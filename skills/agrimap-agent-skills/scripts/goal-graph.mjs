#!/usr/bin/env node
// A/B goal planning (5.0.1, owner decision 2026-10-16): classifies goals from the real
// task dependency graph, never from goal numbers, language, lane or a wish to look
// parallel. A goal is A when at least one entry task needs no predecessor goal to be
// complete; B when every entry task waits for at least one whole predecessor goal.
// The class is structural: accepted tasks change readiness, not A/B.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs } from "./cli-args.mjs";

export const GOAL_HOURS = { min: 3, max: 8 };
const GOAL_ID = /^G([AB])?(\d+)$/;

const list = (value) => (Array.isArray(value) ? value : value ? [value] : []).map(String);
const byId = (items) => new Map(items.map((item) => [String(item.id), item]));

// Goal ID is one name: G<class><number>. The number is the stable identity; the class
// letter follows the graph. A goal given as G001 or with a stale letter is renamed.
export function goalId(id, cls) {
  const match = GOAL_ID.exec(String(id));
  return match ? `G${cls}${match[2]}` : String(id);
}

function findCycle(tasks) {
  const state = new Map();
  const stack = [];
  const visit = (id) => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "open") return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, "open");
    stack.push(id);
    for (const dep of list(tasks.get(id)?.depends_on)) {
      if (!tasks.has(dep)) continue;
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, "done");
    return null;
  };
  for (const id of tasks.keys()) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

function prerequisites(tasks, id, seen = new Set()) {
  for (const dep of list(tasks.get(id)?.depends_on)) {
    if (seen.has(dep)) continue;
    seen.add(dep);
    prerequisites(tasks, dep, seen);
  }
  return seen;
}

export function analyzeGoals({ goals = [], tasks = [] } = {}, { accepted = [] } = {}) {
  const errors = [];
  const warnings = [];
  const taskMap = byId(tasks);
  const goalOf = new Map();
  const numbers = new Map();

  for (const goal of goals) {
    const match = GOAL_ID.exec(String(goal.id));
    if (!match) errors.push({ code: "GOAL_ID_INVALID", goal: goal.id });
    else if (numbers.has(match[2])) errors.push({ code: "GOAL_NUMBER_DUPLICATE", goal: goal.id, other: numbers.get(match[2]) });
    else numbers.set(match[2], goal.id);
    if (!list(goal.tasks).length) errors.push({ code: "GOAL_EMPTY", goal: goal.id });
    for (const task of list(goal.tasks)) {
      if (goalOf.has(task)) errors.push({ code: "TASK_IN_TWO_GOALS", task, goals: [goalOf.get(task), goal.id] });
      goalOf.set(task, String(goal.id));
      if (!taskMap.has(task)) errors.push({ code: "MISSING_TASK", task, goal: goal.id });
    }
  }
  for (const [id, task] of taskMap) {
    if (!goalOf.has(id)) errors.push({ code: "TASK_WITHOUT_GOAL", task: id });
    for (const dep of list(task.depends_on)) if (!taskMap.has(dep)) errors.push({ code: "MISSING_DEPENDENCY", task: id, depends_on: dep });
  }
  const cycle = findCycle(taskMap);
  if (cycle) errors.push({ code: "DEPENDENCY_CYCLE", tasks: cycle });
  if (errors.length) return { ok: false, errors, warnings, goals: [], groups: { A: [], B: [] }, renames: [], ready: [] };

  const done = new Set(list(accepted));
  const result = goals.map((goal) => {
    const own = new Set(list(goal.tasks));
    const entries = [...own]
      .filter((id) => ![...prerequisites(taskMap, id)].some((dep) => own.has(dep)))
      .map((id) => {
        const before = prerequisites(taskMap, id);
        const gates = goals
          .filter((other) => other !== goal && list(other.tasks).every((task) => before.has(task)))
          .map((other) => String(other.id));
        return { task: id, prerequisites: [...before].sort(), gates };
      });
    const cls = entries.some((entry) => entry.gates.length === 0) ? "A" : "B";
    const hours = list(goal.tasks).reduce((sum, id) => sum + (Number(taskMap.get(id).hours) || 0), 0);
    if (hours && hours > GOAL_HOURS.max) warnings.push({ code: "GOAL_TOO_LARGE", goal: goal.id, hours, max: GOAL_HOURS.max });
    if (hours && hours < GOAL_HOURS.min && goals.length > 1) warnings.push({ code: "GOAL_SMALL", goal: goal.id, hours, min: GOAL_HOURS.min });
    return {
      id: goalId(goal.id, cls),
      given: String(goal.id),
      class: cls,
      reason: cls === "A"
        ? `entry ${entries.filter((entry) => !entry.gates.length).map((entry) => entry.task).join(", ")} needs no whole predecessor goal`
        : `every entry waits for a whole goal: ${entries.map((entry) => `${entry.task} ← ${entry.gates.join(", ")}`).join("; ")}`,
      tasks: list(goal.tasks),
      entries,
      hours: hours || null,
      status: list(goal.tasks).every((id) => done.has(id)) ? "done" : list(goal.tasks).some((id) => done.has(id)) ? "in_progress" : "not_started",
    };
  });

  // Gates name the final IDs so a renamed goal is never referenced by its old name.
  const finalId = new Map(result.map((goal) => [goal.given, goal.id]));
  for (const goal of result) for (const entry of goal.entries) entry.gates = entry.gates.map((gate) => finalId.get(gate));
  const ready = [...taskMap.keys()].filter((id) => !done.has(id) && list(taskMap.get(id).depends_on).every((dep) => done.has(dep)));
  return {
    ok: true,
    errors,
    warnings,
    goals: result,
    groups: { A: result.filter((goal) => goal.class === "A").map((goal) => goal.id), B: result.filter((goal) => goal.class === "B").map((goal) => goal.id) },
    renames: result.filter((goal) => goal.id !== goal.given).map((goal) => ({ from: goal.given, to: goal.id })),
    ready: ready.map((id) => ({ task: id, goal: finalId.get(goalOf.get(id)) })),
  };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.file) {
    process.stderr.write("usage: goal-graph.mjs --file <graph.json> [--accepted T001,T002]\n");
    process.exitCode = 2;
    return;
  }
  const graph = JSON.parse(await readFile(path.resolve(String(args.file)), "utf8"));
  const accepted = String(args.accepted || "").split(",").map((value) => value.trim()).filter(Boolean);
  const report = analyzeGoals(graph, { accepted });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
