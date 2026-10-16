// Machine-local memory (ACG C9-A): absolute paths of external specs and related
// repositories. Lives under .agrimap-agent/local/, which is always Git-ignored.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const LOCAL_MEMORY_PATH = ".agrimap-agent/local/memory.md";
export const LOCAL_MEMORY_MARKER = "<!-- agm-local-memory: v1 -->";
// prompts/ holds raw requester history: local only since 5.0.1 (owner decision 2026-10-14).
const STATE_IGNORE_LINES = ["runtime/", "cache/", "local/", "prompts/"];
const SECTIONS = Object.freeze({ spec: "Spec locations", repo: "Related repositories" });
const AGENT_NOTE = /^- \(agm \d{4}-\d{2}-\d{2}\)/;
const MAX_AGENT_NOTES = 10;
const MAX_BYTES = 4096;

const TEMPLATE = [
  "# AGM local memory — เครื่องนี้เท่านั้น ไม่ commit",
  "",
  LOCAL_MEMORY_MARKER,
  "<!-- แก้ด้วยมือได้ Agent อ่านผ่าน `agm-workspace.mjs context` -->",
  "",
  "## Spec locations",
  "",
  "| id | path | version | verified |",
  "| --- | --- | --- | --- |",
  "",
  "## Related repositories",
  "",
  "| id | path | verified |",
  "| --- | --- | --- |",
  "",
  "## Working notes",
  "",
].join("\n");

const toSlash = value => String(value || "").replaceAll("\\", "/");

// Appends missing ignore lines idempotently; never rewrites other lines.
export async function ensureStateIgnore(state) {
  const file = path.join(state, ".gitignore");
  const current = await readFile(file, "utf8").catch(() => null);
  const lines = current === null ? [] : current.split(/\r?\n/).map(line => line.trim());
  const missing = STATE_IGNORE_LINES.filter(line => !lines.includes(line) && !lines.includes(line.slice(0, -1)));
  if (current !== null && !missing.length) return false;
  await mkdir(state, { recursive: true });
  const prefix = current === null ? "" : current.endsWith("\n") || !current ? current : `${current}\n`;
  await writeFile(file, `${prefix}${missing.join("\n")}\n`, "utf8");
  return true;
}

function tableRows(lines, heading) {
  const start = lines.findIndex(line => line.trim() === `## ${heading}`);
  if (start < 0) return [];
  const rows = [];
  for (let index = start + 1; index < lines.length && !/^#{1,6}\s/.test(lines[index]); index += 1) {
    const match = lines[index].match(/^\|\s*([a-z0-9][a-z0-9-]*)\s*\|\s*(.+?)\s*\|(.*)$/);
    if (!match || match[1] === "id") continue;
    const rest = match[3].split("|").map(cell => cell.trim()).filter((cell, i, all) => i < all.length - 1 || cell);
    rows.push({ id: match[1], path: toSlash(match[2]), cells: rest, line: index });
  }
  return rows;
}

export function parseLocalMemory(text) {
  if (typeof text !== "string") return { exists: false, specs: [], repos: [], notes: [], warnings: [] };
  if (!text.includes(LOCAL_MEMORY_MARKER)) {
    return { exists: true, recognized: false, specs: [], repos: [], notes: [], warnings: ["LOCAL_MEMORY_UNRECOGNIZED"] };
  }
  const lines = text.split(/\r?\n/);
  const specs = tableRows(lines, SECTIONS.spec).map(({ id, path: p, cells }) => ({ id, path: p, version: cells[0] || null, verified: cells[1] || null }));
  const repos = tableRows(lines, SECTIONS.repo).map(({ id, path: p, cells }) => ({ id, path: p, verified: cells[0] || null }));
  const notesStart = lines.findIndex(line => line.trim() === "## Working notes");
  const notes = [];
  if (notesStart >= 0) {
    for (let index = notesStart + 1; index < lines.length && !/^#{1,6}\s/.test(lines[index]); index += 1) {
      if (lines[index].trim()) notes.push({ text: lines[index], agent: AGENT_NOTE.test(lines[index]) });
    }
  }
  return { exists: true, recognized: true, specs, repos, notes, warnings: [] };
}

function rowText(kind, entry) {
  return kind === "spec"
    ? `| ${entry.id} | ${toSlash(entry.path)} | ${entry.version ?? ""} | ${entry.verified ?? ""} |`
    : `| ${entry.id} | ${toSlash(entry.path)} | ${entry.verified ?? ""} |`;
}

// Rewrites only the row for `id` (or appends it) and keeps every other line.
export function upsertRow(text, kind, entry) {
  const base = typeof text === "string" && text.includes(LOCAL_MEMORY_MARKER) ? text : TEMPLATE;
  const lines = base.split("\n");
  const heading = SECTIONS[kind];
  const existing = tableRows(lines, heading).find(row => row.id === entry.id);
  if (existing) {
    const previous = parseLocalMemory(base)[kind === "spec" ? "specs" : "repos"].find(row => row.id === entry.id);
    lines[existing.line] = rowText(kind, { ...previous, ...entry, version: entry.version ?? previous?.version });
    return lines.join("\n");
  }
  let start = lines.findIndex(line => line.trim() === `## ${heading}`);
  if (start < 0) {
    lines.push("", `## ${heading}`, "", kind === "spec" ? "| id | path | version | verified |" : "| id | path | verified |", kind === "spec" ? "| --- | --- | --- | --- |" : "| --- | --- | --- |");
    start = lines.length - 5;
  }
  let insert = start + 1;
  for (let index = start + 1; index < lines.length && !/^#{1,6}\s/.test(lines[index]); index += 1) {
    if (lines[index].startsWith("|")) insert = index + 1;
  }
  lines.splice(insert, 0, rowText(kind, entry));
  return lines.join("\n");
}

export function renderLocalMemory(text) {
  return typeof text === "string" && text.includes(LOCAL_MEMORY_MARKER) ? text : TEMPLATE;
}

async function readMemory(root) {
  return readFile(path.join(root, LOCAL_MEMORY_PATH), "utf8").catch(() => null);
}

async function writeMemory(root, text) {
  const file = path.join(root, LOCAL_MEMORY_PATH);
  await mkdir(path.dirname(file), { recursive: true });
  await ensureStateIgnore(path.join(root, ".agrimap-agent"));
  let content = text.endsWith("\n") ? text : `${text}\n`;
  // Size cap: drop the oldest agent notes only; human lines are never removed.
  while (Buffer.byteLength(content) > MAX_BYTES) {
    const lines = content.split("\n");
    const index = lines.findIndex(line => AGENT_NOTE.test(line));
    if (index < 0) break;
    lines.splice(index, 1);
    content = lines.join("\n");
  }
  await writeFile(file, content, "utf8");
  return LOCAL_MEMORY_PATH;
}

export async function loadLocalMemory(root) {
  const text = await readMemory(root);
  return { ...parseLocalMemory(text), path: LOCAL_MEMORY_PATH };
}

// `verified` changes at most once per day per id (the date is the only churn).
export async function setLocalPath(root, { kind = "spec", id, path: target, version = null, date }) {
  if (!SECTIONS[kind]) throw new Error("LOCAL_KIND_INVALID");
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(String(id || ""))) throw new Error("LOCAL_ID_INVALID");
  const text = await readMemory(root);
  const next = upsertRow(renderLocalMemory(text), kind, { id, path: path.resolve(target), version, verified: date });
  if (next === text) return { written: false, path: LOCAL_MEMORY_PATH };
  return { written: true, path: await writeMemory(root, next) };
}

export async function addWorkingNote(root, { text: note, date }) {
  const clean = String(note || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!clean) throw new Error("LOCAL_NOTE_EMPTY");
  const lines = renderLocalMemory(await readMemory(root)).replace(/\n+$/, "").split("\n");
  let start = lines.findIndex(line => line.trim() === "## Working notes");
  if (start < 0) { lines.push("", "## Working notes", ""); start = lines.length - 2; }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) if (/^#{1,6}\s/.test(lines[index])) { end = index; break; }
  lines.splice(end, 0, `- (agm ${date}) ${clean}`);
  const agentLines = lines.map((line, index) => [line, index]).filter(([line], index) => index > start && AGENT_NOTE.test(line));
  for (const [, index] of agentLines.slice(0, Math.max(0, agentLines.length - MAX_AGENT_NOTES)).reverse()) lines.splice(index, 1);
  return { written: true, path: await writeMemory(root, `${lines.join("\n")}\n`) };
}

// Every recorded absolute path in both separator forms, for LOCAL_PATH_LEAK.
export function localPathsForLeakCheck(memory) {
  const values = new Set();
  for (const entry of [...(memory?.specs || []), ...(memory?.repos || [])]) {
    const slash = toSlash(entry.path).replace(/\/+$/, "");
    if (slash.length < 4) continue;
    values.add(slash.toLowerCase());
    values.add(slash.replaceAll("/", "\\").toLowerCase());
  }
  return [...values];
}
