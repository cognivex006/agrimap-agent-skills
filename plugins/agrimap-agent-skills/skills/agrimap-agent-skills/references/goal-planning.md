# A/B goal planning

Owner decision 2026-10-16 (5.0.1): the default for every analysis, plan, Prompt Result and execution that breaks work into goals and tasks, one goal included. The requester does not have to ask for it again. Goals and tasks live in the plan or Prompt Result and in the savepoint; no `tasks/` directory or new file.

## Goals and tasks

- Task: one result with acceptance criteria, `depends_on` from the inputs it really uses, and an estimate in hours.
- Goal: a group of tasks with one outcome, sized to finish within a day; 3–5 hours is the target and 8 the ceiling. Split a larger goal along its dependencies; merge a goal under 3 hours into a neighbour when that does not join unrelated ownership.
- Accepted: verified and integrated by the Leader (subagents-and-branches.md). Only accepted tasks unlock downstream work.

## Classify with the script

Write the graph as JSON (`{"goals":[{"id":"G001","tasks":["T001"]}],"tasks":[{"id":"T001","depends_on":[],"hours":3}]}`) in the scratchpad and run `node <skill-root>/scripts/goal-graph.mjs --file <graph.json> [--accepted T001,...]`. Do not classify by hand. It refuses missing references, cycles, a task in two goals and duplicate goal numbers; fix the graph or record the blocker before stating a class.

- Entry task: no direct or transitive predecessor inside its own goal.
- Gate of an entry: a predecessor goal all of whose tasks are in that entry's transitive prerequisites.
- A: at least one entry has no gate. B: every entry has at least one gate, possibly a different goal per entry.
- A is not "starts now"; B is not "one at a time". Both run in parallel once prerequisites, inputs, locks and capacity allow.
- Never merge the gates of all entries into one wait, never add a dependency because a goal has a smaller number, never classify by lane, language or work type.

## Goal ID

One name: `GA<n>` or `GB<n>` (`GA001`). The number is the identity and never changes; the letter follows the graph. When the graph changes a goal's class, the script reports `renames` (`GA002 → GB002`): use the new name, write `GB002 (was GA002)` once in the plan and savepoint, and update every gate or document that names it. A task finishing changes readiness, never the class.

## Plan shape

Always show `Group A` and `Group B`; an empty group says `empty` and no work is invented to fill it. Per goal:

- ID, outcome, task IDs and hours;
- why A or B (the script's `reason`);
- entry paths, each with its prerequisites and gates;
- repository/resource ownership and locks;
- acceptance criteria, status, evidence and next step.

Keep earlier evidence and IDs. The savepoint `remaining` and `next` items start with the goal and task ID (`GA001/T002 …`).

## Dispatch

When working a goal as Leader: read the graph, savepoint and accepted evidence; take the script's `ready` tasks; check actual capacity (at most five agents, reviewers and any parent allocation); split workstreams by ownership and locks so no two writers touch the same files; prefer the goal the requester chose, then the critical path and tasks that unlock the most downstream work. Review and accept each returned task before unlocking its dependants, then rerun the script with the new accepted list and fill the free slot at once — never wait for a whole goal or batch.
