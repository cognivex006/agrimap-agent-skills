// Savepoint (5.0.1, owner decision 2026-10-14): the current-execution memory file
// is the one place that says where unfinished work stands — goal, done, remaining,
// next step, decisions and branch — so any session can see it and resume it.
// It replaces the v3 tasks/<id>/task.md. memory/current stays out of deliveries
// (git-flow auditPathAllowed); logs/*.jsonl keep the audit trail.
import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { unquotedIntent } from "./governance-policy.mjs";

// Short Thai/English requests about unfinished work. Quoted text is an example.
const WORK_POLITE = /(?:\s*(?:ครับ|ค่ะ|คะ|นะ|จ้า|เลย|ด้วย|หน่อย|please|pls|[.!?？]))+$/u;
const WORK_INTENTS = [
  ["savepoint", /^(?:savepoint|save\s*point|เซฟ(?:งาน)?(?:ไว้)?(?:ก่อน)?|บันทึก(?:งาน|savepoint)(?:ไว้)?(?:ก่อน)?|พัก(?:งาน)?ไว้(?:ก่อน)?)$/u],
  ["pending", /^(?:(?:มี)?งาน(?:ที่)?ค้าง(?:อยู่)?(?:อะไร)?(?:บ้าง)?(?:ไหม|มั้ย)?|สรุปงาน(?:ที่)?(?:ค้าง|เหลือ)(?:อยู่)?|เหลืองานอะไร(?:บ้าง)?|pending(?:\s+work)?|what(?:'s|\s+is)\s+pending)$/u],
  ["resume", /^(?:resume|ทำต่อ(?:จาก)?(?:งาน)?(?:เดิม|ที่ค้าง)?|ทำงาน(?:ที่)?ค้างต่อ|กลับไปทำ(?:งาน)?ต่อ)(?:\s+(\d{6,8}))?$/u],
];

export function resolveWorkIntent(text) {
  const value = unquotedIntent(text).trim().toLowerCase().replace(WORK_POLITE, "").trim();
  if (!value || value.length > 60) return null;
  for (const [intent, pattern] of WORK_INTENTS) {
    const match = value.match(pattern);
    if (match) return { intent, executionId: match[1] || null };
  }
  return null;
}

const LIST_SECTIONS = ["Done", "Remaining", "Decisions and assumptions"];
const MAX_ITEMS = 20;
const MAX_ITEM_CHARS = 200;

function clean(value, limit = MAX_ITEM_CHARS) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

// "a; b" or ["a", "b"] → unique trimmed items, newest kept when over the cap.
export function savepointItems(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(/\s*;\s*|\r?\n/);
  const items = [...new Set(raw.map(item => clean(String(item).replace(/^- (\[[ x]\] )?/, ""))).filter(Boolean))];
  return items.slice(-MAX_ITEMS);
}

function field(text, label) {
  const match = String(text).match(new RegExp(`^- ${label}: (.*)$`, "m"));
  return match ? match[1].replace(/^`|`$/g, "").trim() : null;
}

function section(text, heading) {
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === `## ${heading}`);
  if (start < 0) return [];
  const body = [];
  for (let index = start + 1; index < lines.length && !/^##\s/.test(lines[index]); index += 1) body.push(lines[index]);
  return body;
}

export function parseSavepoint(text) {
  const lists = Object.fromEntries(LIST_SECTIONS.map(name => [name, section(text, name)
    .map(line => line.match(/^- (.+)$/)?.[1]).filter(item => item && item !== "None yet.")]));
  return {
    executionId: field(text, "Execution ID"),
    objective: field(text, "Request"),
    status: field(text, "Status"),
    requestedBy: field(text, "Requested by"),
    session: field(text, "Session"),
    branch: field(text, "Branch"),
    updated: field(text, "Updated"),
    workflowDepth: field(text, "Workflow depth"),
    next: section(text, "Next step").map(line => line.trim()).filter(Boolean).join(" ") || null,
    done: lists.Done,
    remaining: lists.Remaining,
    decisions: lists["Decisions and assumptions"],
  };
}

// Done and decisions accumulate; remaining and next replace when given.
export function mergeSavepoint(previous = {}, update = {}) {
  const pick = (key) => (update[key] === undefined || update[key] === null ? previous[key] : update[key]);
  return {
    ...previous,
    ...Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined && value !== null)),
    done: savepointItems([...(previous.done || []), ...savepointItems(update.done ?? [])]),
    decisions: savepointItems([...(previous.decisions || []), ...savepointItems(update.decisions ?? [])]),
    remaining: update.remaining === undefined || update.remaining === null ? (previous.remaining || []) : savepointItems(update.remaining),
    next: clean(pick("next") || "", 400) || null,
  };
}

export function gitPlace(root) {
  const run = (args) => {
    try { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; }
  };
  const branch = run(["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = run(["rev-parse", "--short", "HEAD"]);
  return branch ? `${branch}${head ? ` @ ${head}` : ""}` : "not-a-git-repository";
}

export function renderSavepoint(sp) {
  const list = (items, empty = "None yet.") => (items?.length ? items.map(item => `- ${item}`).join("\n") : `- ${empty}`);
  const checkpoint = sp.checkpoint || {};
  return [
    `# Savepoint \`${sp.executionId}\` — ${clean(sp.objective, 120)}`,
    "",
    `- Execution ID: \`${sp.executionId}\``,
    `- Task ID: ${sp.taskId ? `\`${sp.taskId}\`` : "not-applicable"}`,
    `- Workflow depth: \`${sp.workflowDepth}\``,
    `- Requested by: ${sp.requestedBy}`,
    `- Request: ${clean(sp.objective, 400)}`,
    `- Status: ${sp.status || "in-progress"}`,
    `- Session: ${sp.session || "unknown"}`,
    `- Branch: ${sp.branch || "unknown"}`,
    `- Updated: ${sp.updated}`,
    `- Model label: \`${sp.modelLabel || "not-configured"}\``,
    `- Actual model: \`${sp.model || "unknown"}\``,
    `- Agent: \`${sp.agent || "unknown"}\` · Provider: \`${sp.provider || "unknown"}\``,
    "",
    "## Done",
    list(sp.done),
    "",
    "## Remaining",
    list(sp.remaining, "Nothing recorded; state what is left before pausing."),
    "",
    "## Next step",
    sp.next || "Continue the authorized scope or record a terminal state.",
    "",
    "## Decisions and assumptions",
    list(sp.decisions, "None recorded."),
    "",
    "## Last checkpoint",
    `- Milestone: ${checkpoint.milestone || "started"} at ${checkpoint.at || sp.updated}`,
    `- Summary: ${clean(checkpoint.summary || sp.objective, 400)}`,
    `- Files: ${checkpoint.files?.length ? checkpoint.files.map(file => `\`${file}\``).join(", ") : "None"}`,
    `- Verification: ${checkpoint.verification?.length ? checkpoint.verification.join("; ") : "Not yet run"}`,
    `- Concerns: ${clean(checkpoint.concerns || "None recorded.", 400)}`,
    "",
  ].join("\n");
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(full);
  }
  return files;
}

// Every unfinished execution in this project, newest first. Read-only.
export async function listPending(state, { now = Date.now() } = {}) {
  const active = new Map();
  for (const name of await readdir(path.join(state, "runtime", "active")).catch(() => [])) {
    if (!name.endsWith(".json")) continue;
    try {
      const record = JSON.parse(await readFile(path.join(state, "runtime", "active", name), "utf8"));
      if (record.executionId) active.set(record.executionId, { session: name.slice(0, -5), record });
    } catch { /* unreadable runtime state is ignored */ }
  }
  const pending = [];
  for (const file of await markdownFiles(path.join(state, "memory", "current"))) {
    const sp = parseSavepoint(await readFile(file, "utf8").catch(() => ""));
    if (!sp.executionId) continue;
    const owner = active.get(sp.executionId);
    const updatedMs = Date.parse(sp.updated || "") || null;
    pending.push({
      executionId: sp.executionId,
      objective: sp.objective,
      status: sp.status,
      requestedBy: sp.requestedBy,
      session: owner?.session || sp.session || null,
      attached: Boolean(owner),
      branch: sp.branch,
      updated: sp.updated,
      ageHours: updatedMs ? Math.round((now - updatedMs) / 360_000) / 10 : null,
      next: sp.next,
      remaining: sp.remaining,
      done: sp.done.length,
      path: path.relative(state, file).split(path.sep).join("/"),
    });
  }
  return pending.sort((a, b) => String(b.updated || "").localeCompare(String(a.updated || "")));
}
