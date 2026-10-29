#!/usr/bin/env node
// Skill routing from assets/skill-routing.json (4.9.5): lane (where the work
// lives) x intent (what is asked) selects one AgriMap skill; supporting
// packages add evidence only. Shared by the prompt hook, the Claude skill gate,
// the generated routing reference/AGENTS section 0 and the workspace template.
// Pure functions except the CLI at the bottom; no network, no git writes.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs } from "./cli-args.mjs";
import { unquotedIntent } from "./governance-policy.mjs";

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ROUTING_PATH = path.join(SKILL_ROOT, "assets", "skill-routing.json");

export const AGRIMAP_PROJECT_PATTERNS = Object.freeze([
  /^agmwa-[a-z]+(?:-[a-z]+)*-ng$/i,
  /^agm(?:ws|bo)-[a-z]+(?:-[a-z]+)*-netcore$/i,
  /^agrimap-[a-z]+(?:-[a-z]+)*$/i,
  /^agrimap\.[a-z]+(?:\.[a-z]+)*$/i,
]);

export function recognizedProjectName(value) {
  const name = String(value || "").trim();
  return Boolean(name) && AGRIMAP_PROJECT_PATTERNS.some((pattern) => pattern.test(name));
}

let cached = null;
export function loadRouting(file = ROUTING_PATH) {
  if (file === ROUTING_PATH && cached) return cached;
  const routing = compile(JSON.parse(readFileSync(file, "utf8")));
  if (file === ROUTING_PATH) cached = routing;
  return routing;
}

const any = (list = [], flags = "iu") => list.map((source) => new RegExp(source, flags));
const hits = (patterns, text) => patterns.some((pattern) => pattern.test(text));

function compile(raw) {
  const signals = raw.signals;
  return {
    raw,
    lanes: raw.lanes.map((lane) => ({ ...lane, repositoryPatterns: any(lane.repositories), pathPatterns: any(lane.paths) })),
    sqlPaths: any(signals.sqlPaths),
    sqlObjects: any(signals.sqlObjects, "u"),
    objectToken: new RegExp(signals.objectToken, "u"),
    sqlStrong: any(signals.sqlStrong),
    sqlWeak: any(signals.sqlWeak),
    beKeywords: any(signals.beKeywords),
    feKeywords: any(signals.feKeywords),
    meta: any(signals.meta),
    packageInvocation: new RegExp(signals.packageInvocation, "giu"),
    conformance: any(signals.conformance),
    codeWords: any(signals.codeWords),
    anchors: any(signals.anchors),
    identifier: new RegExp(signals.identifier, "u"),
    repositoryMention: new RegExp(signals.repositoryMention, "giu"),
    intents: raw.intents.map((intent) => ({
      ...intent,
      patterns: any(intent.keywords),
      weakPatterns: any(intent.weakKeywords),
      softPatterns: any(intent.softKeywords),
      projectPatterns: any(intent.projectKeywords),
      createPatterns: any(intent.createKeywords),
      editPatterns: any(intent.editKeywords),
      explainPatterns: any(intent.explainKeywords),
      designPatterns: any(intent.designKeywords),
    })),
    supporting: raw.supporting.map((item) => ({
      ...item,
      mentionPattern: new RegExp(item.mention, "iu"),
      patterns: any(item.keywords),
      ownerPatterns: any(item.ownerKeywords),
    })),
  };
}

export function laneById(routing, id) {
  return routing.lanes.find((lane) => lane.id === id) || null;
}

export function invocation(routing, host, skill) {
  const entry = routing.raw.hosts.find((item) => item.id === host) || routing.raw.hosts.find((item) => item.id === "claude");
  return entry.pattern.replace("{skill}", skill);
}

// Repository lane from its name (basename or remote) and root entries only.
export function repositoryLane(routing, { names = [], rootEntries = [] } = {}) {
  for (const name of names.filter(Boolean)) {
    const lane = routing.lanes.find((item) => item.repositoryPatterns.some((pattern) => pattern.test(name)));
    if (lane) return lane.id;
  }
  const entries = new Set(rootEntries.map((entry) => String(entry).toLowerCase()));
  if (entries.has("angular.json")) return entries.has("projects") && !entries.has("src") ? "fe-library" : "fe-main";
  if ([...entries].some((entry) => /\.(?:sln|slnx|csproj)$/.test(entry))) return "be-library";
  if (entries.has("sql") || entries.has("sqlserver") || [...entries].some((entry) => entry.endsWith(".sql"))) return "sql";
  return null;
}

// Lane of one file path. The repository lane refines the kind inside a family.
export function laneFromPath(routing, filePath, repoLane = null) {
  const normalized = String(filePath || "").replaceAll("\\", "/");
  if (!normalized) return null;
  if (routing.sqlPaths.some((pattern) => pattern.test(normalized))) return "sql";
  const segments = normalized.split("/");
  for (const segment of segments) {
    const lane = routing.lanes.find((item) => item.repositoryPatterns.some((pattern) => pattern.test(segment)));
    if (lane && /\.(?:cs|csproj|ts|html|s?css)$|\/$/i.test(normalized)) return lane.id;
  }
  const byPath = routing.lanes.find((item) => item.pathPatterns.some((pattern) => pattern.test(normalized)));
  const family = /\.(?:cs|csproj|slnx?)$/i.test(normalized) ? "be" : /\.(?:ts|html|s?css|less)$/i.test(normalized) ? "fe" : null;
  if (!family) return null;
  if (byPath?.family === family) return byPath.id;
  const repo = laneById(routing, repoLane);
  if (repo?.family === family) return repo.id;
  // HTML/CSS/TS inside a backend repository (mail templates, tooling) stays backend work.
  if (family === "fe" && repo?.family === "be") return repo.id;
  return family === "be" ? "be-main" : "fe-main";
}

const PATH_TOKEN = /(?:[A-Za-z]:)?[\w.@-]*(?:[\\/][\w.@-]+)+[\\/]?|[\w.@-]+\.(?:sql|cs|csproj|slnx?|ts|html|s?css)\b/g;

function sqlEvidence(routing, text, fePreferred) {
  if (routing.sqlObjects.some((pattern) => pattern.test(text)) || hits(routing.sqlStrong, text)) return true;
  if (!hits(routing.sqlWeak, text)) return false;
  return routing.objectToken.test(text) || !fePreferred;
}

function resolveIntent(routing, text) {
  const read = routing.intents.find((intent) => intent.id === "read");
  const explain = read?.explainPatterns || [];
  // "namespace ผิดปกติ" asked with a read verb is a convention review; real symptoms (error, สาเหตุ) stay strong keywords.
  const review = Boolean(read) && hits(routing.conformance, text) && hits(read.patterns, text);
  for (const intent of routing.intents) {
    if (hits(intent.patterns, text)) return intent;
    if (intent.softPatterns.length && hits(intent.softPatterns, text) && !review) return intent;
    if (intent.weakPatterns.length && hits(intent.weakPatterns, text) && !hits(explain, text)) return intent;
  }
  return null;
}

function actionFor(intent, lane, text) {
  if (!intent.action) return null;
  if (intent.id === "change") {
    const create = hits(intent.createPatterns, text);
    const edit = hits(intent.editPatterns, text);
    return create && !edit ? "create" : edit && !create ? "edit" : "create|edit";
  }
  if (intent.id === "read") {
    if (hits(intent.designPatterns, text)) return "design";
    if (lane === "sql" && hits(intent.explainPatterns, text)) return "explain";
    return "analyze";
  }
  if (intent.id === "test" && lane === "sql") return null;
  return intent.action;
}

function supportingFor(routing, text) {
  const result = { supporting: [], owner: null };
  for (const item of routing.supporting) {
    const invoked = item.invocations.some((alias) => new RegExp(`(?:^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|\\s)`, "iu").test(text));
    const named = item.mentionPattern.test(text);
    if (invoked || (named && hits(item.ownerPatterns, text))) result.owner = item.id;
    else if (named || hits(item.patterns, text)) result.supporting.push(item.id);
  }
  return result;
}

// Resolve one request. prompt is raw requester text; quoted/fenced text is
// ignored. repoLane is the lane of the session repository (or null outside one).
export function routeRequest(routing, { prompt = "", repoLane = null, paths = [] } = {}) {
  // "use agm skills to check X" asks for the work itself; only the phrase names the package.
  const text = unquotedIntent(prompt).replace(routing.packageInvocation, " ").trim();
  // Paths and object names inside backticks are lane evidence, not commands.
  const evidence = String(prompt).replace(/```[\s\S]*?```/g, "").replace(/^\s*>.*$/gm, "");
  const base = { lanes: [], intent: null, skill: null, action: null, crossLane: false, supporting: [], owner: null, codeEvidence: false, reason: "" };
  if (!text) return { ...base, reason: "no-current-intent" };
  if (/^\s*(?:example|ตัวอย่าง)\s*:/i.test(text)) return { ...base, reason: "example" };
  const support = supportingFor(routing, text);
  if (support.owner) return { ...base, owner: support.owner, skill: support.owner, codeEvidence: true, reason: "supporting-package-owner-request" };
  const named = text.match(/(?:^|[\s$/:])(agm-(?:analyze|architect|be|diagnose|doctor|exec|fe|plan|prompt|qa|release|sql))\b/i);
  if (hits(routing.meta, text)) return { ...base, reason: named ? "about-skills" : "meta-conversation" };
  if (named) return { ...base, skill: named[1].toLowerCase(), supporting: support.supporting, codeEvidence: true, reason: "named-skill" };

  const repo = laneById(routing, repoLane);
  const fromPaths = new Set();
  for (const token of [...paths, ...(evidence.match(PATH_TOKEN) || [])]) {
    const lane = laneFromPath(routing, token, repoLane);
    if (lane) fromPaths.add(lane);
  }
  for (const match of evidence.matchAll(routing.repositoryMention)) {
    const lane = routing.lanes.find((item) => item.repositoryPatterns.some((pattern) => pattern.test(match[0])))?.id;
    if (lane) fromPaths.add(lane);
  }
  const lanes = new Set(fromPaths);
  const fePreferred = repo?.family === "fe" || (hits(routing.feKeywords, evidence) && !routing.objectToken.test(evidence));
  // Explicit paths decide the lanes; request words only add SQL when no path did.
  const sqlFromRequest = !fromPaths.size && sqlEvidence(routing, evidence, fePreferred);
  if (sqlFromRequest) lanes.add("sql");
  const matched = resolveIntent(routing, text);
  // Without an intent verb, only lane evidence in the request itself makes it code work.
  if (!matched && !lanes.size) return { ...base, supporting: support.supporting, reason: "no-code-intent" };
  const intent = matched || routing.intents.find((item) => item.id === routing.raw.defaultIntent);
  if (repo && lanes.has("sql") && repo.family !== "sql" && !fromPaths.size) {
    const familyWords = repo.family === "be" ? routing.beKeywords : routing.feKeywords;
    if (hits(familyWords, evidence)) lanes.add(repo.id);
  }
  if (!lanes.size && repo) lanes.add(repo.id);
  if (!lanes.size && !repo) {
    if (hits(routing.feKeywords, evidence)) lanes.add("fe-main");
    else if (hits(routing.beKeywords, evidence)) lanes.add("be-main");
  }

  const laneList = [...lanes];
  const crossLane = laneList.length > 1;
  // Request-level evidence of repository work; a bare verb in a repository is not enough.
  // Explanations need a concrete anchor so general questions ("Explain SQL joins") stay unrouted;
  // lane-free intents need a project keyword ("jenkins", "ตรวจรับ"), not just "release".
  const anchored = fromPaths.size > 0 || (evidence.match(PATH_TOKEN) || []).length > 0
    || routing.sqlObjects.some((pattern) => pattern.test(evidence)) || routing.objectToken.test(evidence)
    || routing.identifier.test(evidence) || hits(routing.anchors, text)
    || new RegExp(routing.repositoryMention.source, "iu").test(evidence)
    // "ไฟล์ไหน namespace ผิด" names repository code by its conventions, not by a path.
    || (hits(routing.conformance, evidence) && hits(routing.codeWords, evidence));
  const codeEvidence = intent.id === "read" ? anchored
    : intent.projectPatterns.length ? anchored || hits(intent.projectPatterns, text)
    : anchored || sqlFromRequest || ["refactor", "test"].includes(intent.id)
      || hits(routing.codeWords, evidence) || hits(routing.sqlWeak, evidence)
      || hits(routing.feKeywords, evidence) || hits(routing.beKeywords, evidence);
  const decision = { ...base, lanes: laneList, intent: intent.id, crossLane, supporting: support.supporting, codeEvidence };
  if (intent.laneFree) return { ...decision, skill: intent.single, reason: "intent" };
  if (!laneList.length) return { ...decision, reason: "lane-unresolved" };
  if (crossLane) return { ...decision, skill: intent.cross, reason: "cross-lane" };
  const lane = laneById(routing, laneList[0]);
  return { ...decision, skill: lane.skill, action: actionFor(intent, lane.id, text), reason: "lane-intent" };
}

export function routeLine(routing, decision, host = "claude") {
  if (decision.owner) {
    const item = routing.raw.supporting.find((entry) => entry.id === decision.owner);
    return `Explicit ${item.label} request: ${item.ownerRule}`;
  }
  if (!decision.skill) {
    return decision.reason === "lane-unresolved"
      ? "Lane not resolved yet: identify the target repository or file first, then pick the skill by intent x lane (references/skill-routing.md)."
      : null;
  }
  const lanes = decision.lanes.length ? `lane ${decision.lanes.join("+")}` : "no lane";
  const intent = decision.intent ? ` · intent ${decision.intent}${decision.action ? ` → action ${decision.action}` : ""}` : "";
  const cross = decision.crossLane ? " It loads each lane's golden references; do not load a second operation skill." : "";
  return `Skill for this turn: ${invocation(routing, host, decision.skill)} (${lanes}${intent}). Load it before the first answer or write and start with \`Skill · Lane · Golden\`.${cross}`;
}

export function supportingLine(routing, decision) {
  if (!decision.supporting?.length) return null;
  return decision.supporting.map((id) => {
    const item = routing.raw.supporting.find((entry) => entry.id === id);
    return `Supporting evidence: ${item.label} (read-only) for ${item.use}; see ${item.reference} recipes.`;
  }).join("\n");
}

// ---- Rendering (npm run sync) -------------------------------------------------

// Display rows: lane-bound intents sharing a cross-lane skill merge into one row.
function intentRows(raw) {
  const rows = [];
  for (const intent of raw.displayOrder.map((id) => raw.intents.find((item) => item.id === id)).filter(Boolean)) {
    const actions = intent.id === "read" ? ["analyze", "explain", "design"] : String(intent.action || "").split("|").filter(Boolean);
    const row = !intent.laneFree && rows.find((item) => !item.laneFree && item.cross === intent.cross);
    if (row) { row.labels.push(intent.label); row.actions.push(...actions); }
    else rows.push({ laneFree: Boolean(intent.laneFree), single: intent.single, cross: intent.cross, labels: [intent.label], actions });
  }
  return rows;
}

function laneEvidenceRows(raw) {
  return raw.lanes.map((lane) => `| ${lane.evidence} | \`${lane.id}\` → \`${lane.skill}\` |`);
}

export function renderRoutingReference(routing) {
  const raw = routing.raw;
  const sql = raw.supporting.find((item) => item.id === "sql-context-pack");
  const intentCell = (row) => row.laneFree ? `\`${row.single}\`` : `lane skill (\`${row.actions.join("`/`")}\`); cross-lane \`${row.cross}\``;
  return [
    "# Skill routing: intent x lane",
    "",
    "<!-- Generated from assets/skill-routing.json. Do not edit directly. -->",
    "",
    "Select exactly one AgriMap skill before answering about, reviewing or changing repository code/SQL. The request does not have to name a skill. Questions still load the lane skill for its golden references; they create no lifecycle, task files or tests.",
    "",
    "## 1. Lane",
    "",
    "Resolve from evidence in this order: file path/extension → repository name/root markers → words in the request. Broad words (table/ตาราง, view, column, index, store, schema) count as SQL only with an object name (`UPPER_SNAKE`) or outside a frontend context. `function` alone never means SQL.",
    "",
    "| Evidence | Lane → skill |",
    "| --- | --- |",
    ...laneEvidenceRows(raw),
    "",
    "Golden collection per lane: " + raw.lanes.map((lane) => `\`${lane.id}\` \`${lane.golden}\``).join(", ") + ".",
    "",
    "## 2. Intent",
    "",
    "| Intent | Skill |",
    "| --- | --- |",
    ...intentRows(raw).map((row) => `| ${row.labels.join(" / ")} | ${intentCell(row)} |`),
    "",
    `Precedence when several intents match: ${raw.intents.map((intent) => intent.id).join(" > ")}. A fix request (แก้/fix) is a change even when it mentions an error; diagnose is for a cause without a fix request. A convention check (namespace/using order, overloads, naming, golden) with a read verb is a read even when it says ผิดปกติ, and "use agm skills to …" asks for the work, not about skills. Lane evidence without a verb takes the read-only \`${raw.defaultIntent}\` path; a request with neither is not code work. Outside any lane the lane-free intents still apply; otherwise use the router \`${raw.router}\`.`,
    "",
    "## 3. Combination",
    "",
    "- One operation skill per turn. Its entrypoint loads the lane references it needs; cross-lane changes use `agm-exec`, which loads each lane's golden checklist.",
    "- Do not load a second operation skill unless the requester asks. Supporting packages add evidence and never select the operation or grant write authority.",
    "- Before the first answer line or write: `Skill: <skill> · Lane: <lane> · Golden: <entries actually opened>`.",
    "",
    "## 4. Host invocation",
    "",
    "| Host | Invocation |",
    "| --- | --- |",
    ...raw.hosts.map((host) => `| ${host.label} | \`${host.pattern.replace("{skill}", "agm-sql")}\` |`),
    "",
    "## 5. Supporting package: sql-context-pack",
    "",
    `Use for ${sql.use}.`,
    "",
    `- Supporting: ${sql.supportingRule}`,
    `- Owner turn: ${sql.ownerRule}`,
    `- Context migrate: ${sql.migrateRule}`,
    `- Owner operations: ${sql.ownerOperations.join(", ")}.`,
    `- Read-only tools: ${sql.readOnlyTools.map((tool) => `\`${tool}\``).join(", ")}. Recipes: [${sql.reference}](${sql.reference}).`,
    "",
  ].join("\n");
}

export const AGENTS_ROUTING_START = "<!-- AGM-ROUTING:START generated; edit assets/skill-routing.json -->";
export const AGENTS_ROUTING_END = "<!-- AGM-ROUTING:END -->";

export function renderAgentsRoutingSection(routing) {
  const raw = routing.raw;
  const hosts = raw.hosts.map((host) => `${host.label} \`${host.pattern.replace("{skill}", "agm-sql")}\``).join(", ");
  const cell = (row) => row.laneFree ? `\`${row.single}\`` : `skill ของ lane (\`${row.actions.join("`/`")}\`); ข้าม lane \`${row.cross}\``;
  const sql = raw.supporting.find((item) => item.id === "sql-context-pack");
  return [
    AGENTS_ROUTING_START,
    `ทุก model ไม่ขึ้นกับความมั่นใจหรือขนาดงาน: ก่อนตอบ วิเคราะห์ review หรือแก้ code/SQL ใน repo นี้ เลือก skill เดียวจาก Lane × เจตนา โหลดผ่าน host (${hosts}) และเปิด reference ของ skill ก่อนบรรทัดแรก แม้คำขอไม่ระบุชื่อ skill; ห้ามใช้ความรู้ทั่วไปแทน golden pattern`,
    "",
    "**Lane**: path/นามสกุลไฟล์ → ชื่อ repo → คำในคำขอ; table/ตาราง, view, column, index นับเป็น SQL เมื่อมีชื่อ object หรือไม่ใช่บริบท FE",
    "",
    "| หลักฐาน | Lane → skill |",
    "| --- | --- |",
    ...laneEvidenceRows(raw),
    "",
    "| เจตนา | Skill |",
    "| --- | --- |",
    ...intentRows(raw).map((row) => `| ${row.labels.join(" / ")} | ${cell(row)} |`),
    "",
    `- ไม่อยู่ใน lane ใช้ skill ตามเจตนา; เลือกไม่ได้ใช้ \`${raw.router}\`; operation skill เดียวต่อรอบ ห้ามโหลดตัวที่สองเองโดยไม่ได้สั่ง`,
    `- \`${sql.label}\` เสริมเมื่อต้องการ schema/ข้อมูลจริงที่ไฟล์ใน repo ตอบไม่ได้: ใน agm-* อ่านอย่างเดียว ยกเว้น \`agm-sql context migrate\` ที่ export DDL ลง db-schema; คำสั่งตรงถึง package นั้นใช้ approval gate ของมัน`,
    "- บรรทัดแรกของคำตอบหรือก่อนเขียนไฟล์: `Skill: <skill> · Lane: <lane> · Golden: <entries ที่เปิดจริง>`; ยังไม่โหลดหรือไม่ตรง golden ให้แก้ก่อนส่ง",
    "- Golden เป็นค่าเริ่มต้นตั้งแต่ร่างแรก (SQL: `[agrimap_app]`, `CREATE OR ALTER PROCEDURE`, SQLFluff)",
    "- Host ไม่มี AgriMap skills: แจ้งให้ติดตั้งผ่าน `agm-doctor` ห้ามอ้างว่า style ทั่วไปคือ AgriMap; ชื่อ skill ที่ยกมาเป็นตัวอย่าง",
    AGENTS_ROUTING_END,
  ].join("\n");
}

export function applyAgentsRoutingSection(text, routing) {
  const start = text.indexOf(AGENTS_ROUTING_START.slice(0, 20));
  const end = text.indexOf(AGENTS_ROUTING_END);
  if (start < 0 || end < start) throw new Error("AGENTS_ROUTING_MARKERS_MISSING");
  return text.slice(0, start) + renderAgentsRoutingSection(routing) + text.slice(end + AGENTS_ROUTING_END.length);
}

export const SQL_CONTEXT_START = "<!-- AGM-SQL-CONTEXT:START -->";
export const SQL_CONTEXT_END = "<!-- AGM-SQL-CONTEXT:END -->";

export function renderSqlContextBlock(routing) {
  const sql = routing.raw.supporting.find((item) => item.id === "sql-context-pack");
  return [
    SQL_CONTEXT_START,
    "<!-- Generated from assets/skill-routing.json. Do not edit directly. -->",
    "",
    `- Supporting: ${sql.supportingRule}`,
    `- Owner turn: ${sql.ownerRule} Owner operations: ${sql.ownerOperations.join(", ")}.`,
    `- Context migrate: ${sql.migrateRule} Tools: ${sql.migrateTools.map((tool) => `\`${tool}\``).join(", ")}.`,
    `- Owner invocations: ${sql.invocations.map((alias) => `\`${alias}\``).join(", ")}; naming the package with an owner operation counts too.`,
    "",
    "| Need | Read-only recipe |",
    "| --- | --- |",
    ...sql.recipes.map((recipe) => `| ${recipe.need} | ${recipe.steps} |`),
    "",
    `Read-only tools: ${sql.readOnlyTools.map((tool) => `\`${tool}\``).join(", ")}.`,
    SQL_CONTEXT_END,
  ].join("\n");
}

export function applyMarkedBlock(text, start, end, block) {
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if (from < 0 || to < from) throw new Error(`MARKERS_MISSING: ${start}`);
  return text.slice(0, from) + block + text.slice(to + end.length);
}

export const WORKSPACE_MARKER = "<!-- AGRIMAP WORKSPACE ROUTING -->";

export function renderWorkspaceAgents(routing, repositories = [], version = "") {
  const rows = repositories.length
    ? repositories.map((repo) => `| \`${repo.path}\` | ${repo.lane ? `\`${repo.lane}\` → \`${laneById(routing, repo.lane)?.skill}\`` : "ดูจากไฟล์/คำขอ"} |`)
    : ["| (ไม่พบ repository) | - |"];
  return [
    "# AgriMap workspace: skill routing",
    "",
    WORKSPACE_MARKER,
    `<!-- Generated by skill-routing.mjs workspace${version ? ` (${version})` : ""}; rerun it to refresh. -->`,
    "",
    "โฟลเดอร์นี้รวมหลาย repository กติกาเต็มของแต่ละ repo อยู่ใน `AGENTS.md` ของ repo นั้น และมีผลเหนือไฟล์นี้เมื่อแก้ไฟล์ใน repo นั้น อ่านก่อนเขียนครั้งแรก ห้ามสร้าง `.agrimap-agent/` ที่โฟลเดอร์นี้",
    "",
    "| Repository | Lane → skill |",
    "| --- | --- |",
    ...rows,
    "",
    "## Skill-first routing",
    "",
    renderAgentsRoutingSection(routing),
    "",
  ].join("\n");
}

export const WORKSPACE_CLAUDE = "# Claude Code\n\nใช้กติกากลางของ workspace นี้จากไฟล์ต่อไปนี้:\n\n@AGENTS.md\n";

// ---- Workspace install (explicit CLI) ----------------------------------------

function gitTopLevel(directory) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

function remoteName(directory) {
  try {
    const remote = execFileSync("git", ["config", "--get", "remote.origin.url"], { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return (remote.replace(/[\\/]+$/, "").split(/[\\/:]/).filter(Boolean).at(-1) || "").replace(/\.git$/i, "");
  } catch {
    return "";
  }
}

async function childRepositories(root, depth = 3) {
  const found = [];
  const queue = [[root, 0]];
  let visited = 0;
  while (queue.length && visited < 400) {
    const [directory, level] = queue.shift();
    visited += 1;
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    if (level > 0 && entries.some((entry) => entry.name === ".git")) { found.push(directory); continue; }
    if (level >= depth) continue;
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".") && !["node_modules", "bin", "obj", "dist"].includes(entry.name)) queue.push([path.join(directory, entry.name), level + 1]);
    }
  }
  return found.sort();
}

export async function planWorkspace(routing, cwd, version = "") {
  const root = path.resolve(cwd);
  if (gitTopLevel(root)) return { ok: false, code: "WORKSPACE_IS_REPOSITORY", message: "Run this in the folder that contains several repositories, not inside one; a repository uses its bootstrap AGENTS.md." };
  const repositories = [];
  for (const directory of await childRepositories(root)) {
    const rootEntries = await readdir(directory).catch(() => []);
    const lane = repositoryLane(routing, { names: [path.basename(directory), remoteName(directory)], rootEntries });
    repositories.push({ path: path.relative(root, directory).replaceAll("\\", "/"), lane });
  }
  const agents = renderWorkspaceAgents(routing, repositories, version);
  const files = [];
  for (const [name, content, owned] of [["AGENTS.md", agents, (text) => text.includes(WORKSPACE_MARKER)], ["CLAUDE.md", WORKSPACE_CLAUDE, (text) => /^@AGENTS\.md$/m.test(text)]]) {
    const target = path.join(root, name);
    const current = await readFile(target, "utf8").catch(() => null);
    const status = current === null ? "create" : current === content ? "unchanged" : owned(current) ? (name === "CLAUDE.md" ? "unchanged" : "update") : "conflict";
    files.push({ path: target, status, content });
  }
  return { ok: true, target: root, repositories, files: files.map(({ content, ...rest }) => rest), _files: files };
}

export async function applyWorkspace(routing, cwd, version = "") {
  const plan = await planWorkspace(routing, cwd, version);
  if (!plan.ok) return plan;
  const conflicts = plan._files.filter((file) => file.status === "conflict");
  if (conflicts.length) return { ok: false, code: "WORKSPACE_FILE_CONFLICT", message: "An existing file is not managed by AgriMap; merge the routing section manually or move the file first.", conflicts: conflicts.map((file) => file.path) };
  for (const file of plan._files) if (["create", "update"].includes(file.status)) await writeFile(file.path, file.content, "utf8");
  return { ok: true, applied: true, target: plan.target, repositories: plan.repositories, files: plan.files };
}

async function packageVersion() {
  const manifest = await readFile(path.join(SKILL_ROOT, "assets", "bootstrap", "manifest.json"), "utf8").then(JSON.parse, () => ({}));
  return manifest.version || "";
}

async function sessionRepoLane(routing, cwd) {
  const top = gitTopLevel(cwd);
  if (!top) return null;
  return repositoryLane(routing, { names: [path.basename(top), remoteName(top)], rootEntries: await readdir(top).catch(() => []) });
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  const args = parseCliArgs(process.argv.slice(3));
  const routing = loadRouting();
  const cwd = path.resolve(typeof args.cwd === "string" ? args.cwd : process.cwd());
  let result;
  if (command === "route") {
    const repoLane = typeof args.lane === "string" ? args.lane : await sessionRepoLane(routing, cwd);
    const paths = typeof args.paths === "string" ? args.paths.split(",").map((item) => item.trim()).filter(Boolean) : [];
    const decision = routeRequest(routing, { prompt: String(args.prompt || ""), repoLane, paths });
    result = { ok: true, repoLane, ...decision, line: routeLine(routing, decision, typeof args.host === "string" ? args.host : "claude") };
  } else if (command === "workspace") {
    const version = await packageVersion();
    const plan = args.apply === true ? await applyWorkspace(routing, cwd, version) : await planWorkspace(routing, cwd, version);
    if (plan._files) delete plan._files;
    result = plan;
  } else {
    result = { ok: false, message: "Use: route --prompt <text> [--cwd <dir>] [--paths a,b] [--host claude|codex|antigravity] | workspace [--cwd <parent>] [--apply]" };
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
