#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { appendRecord as appendFile, writeRecord as writeFile, redactText } from './sensitive-recording.mjs';
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs } from "./cli-args.mjs";
import { readConfirmedIdentity } from "./identity.mjs";
import { classifyRequest, resolveShortIntent, unquotedIntent } from './governance-policy.mjs';
import { sessionPointerPath } from './session-state.mjs';
import { listPending, resolveWorkIntent } from './savepoint.mjs';
import { AGRIMAP_OPERATION_ALIASES, AGRIMAP_ROUTER_ALIAS } from "./operation-aliases.mjs";
import { laneById, loadRouting, recognizedProjectName, repositoryLane, routeLine, routeRequest, supportingLine } from "./skill-routing.mjs";

const HOOK_HOSTS = Object.freeze({ claude: "claude", codex: "codex", gemini: "antigravity", antigravity: "antigravity" });
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

const EXPLICIT_SKILL_ALIASES = Object.freeze([
  AGRIMAP_ROUTER_ALIAS,
  ...AGRIMAP_OPERATION_ALIASES,
]);

const EXPLICIT_SKILL_ALTERNATION = EXPLICIT_SKILL_ALIASES.map(escapeRegex).join("|");
const EXPLICIT_SKILL_PATTERNS = Object.freeze({
  codex: new RegExp(`(?:^|\\s)\\$(?:${EXPLICIT_SKILL_ALTERNATION})(?=$|\\s)`, "i"),
  claude: new RegExp(`(?:^|\\s)/agrimap-agent-skills:(?:${EXPLICIT_SKILL_ALTERNATION})(?=$|\\s)`, "i"),
  gemini: new RegExp(`(?:^|\\s)/(?:${EXPLICIT_SKILL_ALTERNATION})(?=$|\\s)`, "i"),
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Outside Git the hook never writes or reads project config under cwd (ACG H1.1).
function workspaceRoot(cwd) {
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return root ? { root: path.resolve(root), isRepo: true } : { root: cwd, isRepo: false };
  } catch {
    return { root: cwd, isRepo: false };
  }
}

// Bounded child-repository scan: depth <= 2, <= 200 directories, 150 ms.
async function childRepositories(cwd) {
  const found = [];
  const queue = [[cwd, 0]];
  const deadline = Date.now() + 150;
  let visited = 0;
  while (queue.length && visited < 200 && Date.now() < deadline) {
    const [dir, level] = queue.shift();
    visited += 1;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    if (level > 0 && entries.some((entry) => entry.name === ".git")) { found.push(dir); continue; }
    if (level >= 2) continue;
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".") && !["node_modules", "bin", "obj", "dist"].includes(entry.name)) queue.push([path.join(dir, entry.name), level + 1]);
    }
  }
  return found;
}

// Nearest ancestor holding `.git`, without calling git.
async function nearestRepository(target) {
  let current = path.resolve(target);
  for (let level = 0; level < 32; level += 1) {
    if (await stat(path.join(current, ".git")).then(() => true, () => false)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

function referencedPaths(prompt) {
  const text = String(prompt || "");
  const matches = text.match(/(?:[A-Za-z]:[\\/][^\s"'`<>|]+|(?<![\w.])\.\.[\\/][^\s"'`<>|]+|(?<![\w:])\/(?:[\w.-]+\/)+[\w.-]*)/g) || [];
  return [...new Set(matches)].slice(0, 5);
}

function remoteRepositoryName(cwd) {
  try {
    const remote = execFileSync("git", ["config", "--get", "remote.origin.url"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const tail = remote.replace(/[\\/]+$/, "").split(/[\\/:]/).filter(Boolean).at(-1) || "";
    return tail.replace(/\.git$/i, "");
  } catch {
    return "";
  }
}

function explicitSkillInvocation(provider, prompt) {
  const value = unquotedIntent(prompt);
  if (/^\s*(?:example|ตัวอย่าง)\s*:/i.test(value)) return false;
  const pattern = EXPLICIT_SKILL_PATTERNS[provider];
  const adapterMarker = new RegExp(`(?:^|\\s)AGRIMAP_EXPLICIT_ALIAS=(?:${EXPLICIT_SKILL_ALTERNATION})(?=$|\\s)`, "i");
  return Boolean(value) && ((Boolean(pattern) && pattern.test(value)) || adapterMarker.test(value));
}

function projectActivation(cwd, config, children = []) {
  if (config?.activation?.auto === true) return { active: true, reason: "config-opt-in" };
  const child = children.find((dir) => recognizedProjectName(path.basename(dir)));
  if (child) return { active: true, reason: `child-repository:${path.basename(child)}` };
  const rootName = path.basename(cwd);
  if (recognizedProjectName(rootName)) return { active: true, reason: `project-name:${rootName}` };
  const remoteName = remoteRepositoryName(cwd);
  return recognizedProjectName(remoteName)
    ? { active: true, reason: `remote-name:${remoteName}` }
    : { active: false, reason: "not-agrimap" };
}

function safeSessionId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function zonedParts(timestamp = new Date().toISOString(), timeZone = "Asia/Bangkok") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    period: `${value.year}-${value.month}`,
    date: `${value.year}-${value.month}-${value.day}`,
    time: `${value.hour}:${value.minute}:${value.second}`,
    runId: `${value.day}${value.hour}${value.minute}${value.second}`,
  };
}

// Background-task completions reach UserPromptSubmit as <task-notification>
// blocks. They carry the agent's own commands, not requester text, so they never
// enter raw history (memory-and-logs.md); a prompt left empty is not archived.
const HARNESS_BLOCK = /<task-notification>[\s\S]*?<\/task-notification>/g;

function requesterText(prompt) {
  return prompt.includes("<task-notification>") ? prompt.replace(HARNESS_BLOCK, "").trim() : prompt;
}

async function archiveRawPrompt(stateRoot, config, input) {
  const prompt = typeof input.prompt === "string" ? redactText(requesterText(input.prompt)) : "";
  const eventName = input.hook_event_name || input.hookEventName || "";
  if (!['UserPromptSubmit', 'BeforeAgent'].includes(eventName) || !prompt) return null;
  // A host submission ID deduplicates retries, not repeated human submissions.
  const submitId = input.prompt_id || input.event_id || input.message_id;
  if (submitId) {
    const marker = path.join(stateRoot, 'runtime', 'submits', fingerprint(String(input.session_id || input.sessionId) + ':' + submitId));
    await mkdir(path.dirname(marker), { recursive: true });
    try { await writeFile(marker, '', { flag: 'wx' }); } catch (error) { if (error.code === 'EEXIST') return null; throw error; }
  }
  const timestamp = new Date().toISOString();
  const local = zonedParts(timestamp, config?.timeZone || "Asia/Bangkok");
  const conversationId = safeSessionId(
    input.session_id || input.sessionId || input.conversation_id || input.conversationId || input.context_id || input.contextId || input.room_id || input.roomId,
  ) || "unscoped";
  const promptPath = path.join(stateRoot, "prompts", local.period, conversationId, "history.md");
  await mkdir(path.dirname(promptPath), { recursive: true });
  await appendFile(promptPath, `### [${local.date} ${local.time}]\n${prompt}\n\n`, "utf8");
  return path.relative(stateRoot, promptPath).replace(/\\/g, "/");
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function readText(filePath, limit = 7000) {
  try {
    const value = await readFile(filePath, "utf8");
    return value.length > limit
      ? `${value.slice(0, limit)}\n[context truncated by hook; read the file directly]`
      : value;
  } catch {
    return "";
  }
}

async function isSkillPackageRepository(cwd) {
  const [manifest, operations, lifecycle] = await Promise.all([
    readJson(path.join(cwd, "package.json")),
    readJson(path.join(cwd, "config", "operations.json")),
    readText(path.join(cwd, "skills", "agrimap-agent-skills", "references", "lifecycle-core.md"), 200),
  ]);
  return manifest?.name === "agrimap-agent-skills"
    && Array.isArray(operations?.operations)
    && lifecycle.startsWith("# Workflow lifecycle core");
}

// Skill routing (assets/skill-routing.json, AGENTS.md §0): the repository lane
// from its name and root entries, then the turn's skill from intent x lane.
// Names and root entries only; no directory scan.
async function turnRouting(cwd, prompt, isRepo) {
  const routing = loadRouting();
  const names = isRepo ? [path.basename(cwd), remoteRepositoryName(cwd)].filter(Boolean) : [];
  const repoLane = isRepo ? repositoryLane(routing, { names, rootEntries: await readdir(cwd).catch(() => []) }) : null;
  return { routing, repoLane, names, decision: routeRequest(routing, { prompt, repoLane }) };
}

function routingLines({ routing, repoLane, names, decision }, host) {
  const lines = [];
  const repo = laneById(routing, repoLane);
  if (repo) {
    const profile = repo.id === 'be-main' ? names.map((name) => name.match(/^(agmws|agmbo)-/i)?.[1]?.toLowerCase()).find(Boolean) : null;
    lines.push(`Domain skill (mandatory, AGENTS.md §0): lane work in this repository loads ${repo.skill} (${repo.id}${profile ? `, backend_profile=${profile}` : ''}, ${repo.golden}) before the first answer or write, even when the request names no skill. SQL objects/files use agm-sql; a "Skill for this turn" line below wins for other intents or lanes.`);
  }
  if (decision.owner || decision.codeEvidence) {
    const line = routeLine(routing, decision, host);
    if (line) lines.push(line);
    const support = supportingLine(routing, decision);
    if (support) lines.push(support);
  }
  return lines;
}

function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeProvider(value) {
  const provider = typeof value === "string" ? value.toLowerCase() : "";
  return new Set(["codex", "claude", "gemini", "antigravity"]).has(provider)
    ? provider
    : "unknown";
}

function resolveHookProvider(configuredProvider, environment) {
  // Codex exports both PLUGIN_ROOT and the Claude-compatible root. Check its
  // provider-specific variable first so a cached Claude hook cannot mislabel a
  // Codex session. Gemini has no equivalent host environment marker; its hook
  // lives in the extension-only root and carries an explicit provider value.
  if (String(environment.PLUGIN_ROOT || "").trim()) {
    return { provider: "codex", source: "Codex PLUGIN_ROOT" };
  }
  if (configuredProvider === "gemini") {
    return { provider: "gemini", source: "Gemini extension hook" };
  }
  if (String(environment.CLAUDE_PLUGIN_ROOT || "").trim()) {
    return { provider: "claude", source: "Claude CLAUDE_PLUGIN_ROOT" };
  }
  return { provider: configuredProvider, source: "explicit hook configuration" };
}

function gitRequesterSuggestion(cwd) {
  try {
    return execFileSync("git", ["config", "--get", "user.name"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

async function writeJson(filePath, value) {
  if (!filePath) return;
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  } catch {
    // Context delivery must remain fail-open. A later prompt may retry the refresh.
  }
}

async function readStdin() {
  let value = "";
  for await (const chunk of process.stdin) value += chunk;
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

const args = parseCliArgs(process.argv.slice(2));
const input = await readStdin();
const configuredProvider = normalizeProvider(args.provider);
const provider = resolveHookProvider(configuredProvider, process.env).provider;
const sessionCwd = path.resolve(input.cwd || process.cwd());
const { root: cwd, isRepo } = workspaceRoot(sessionCwd);
const stateRoot = path.join(cwd, '.agrimap-agent');
const config = isRepo ? await readJson(path.join(stateRoot, 'config.json')) : null;
const children = isRepo ? [] : await childRepositories(cwd);
const sessionId = safeSessionId(input.session_id || input.sessionId || input.conversation_id || input.conversationId);
const prompt = input.prompt || '';
const explicit = explicitSkillInvocation(provider, prompt);
const packageWork = await isSkillPackageRepository(cwd);
// Routed code work (lane evidence in the request, or a supporting package's owner
// request) is relevant even without a change verb, e.g. "ทำไม SP_ORDER_Q ช้า".
const turn = packageWork ? null : await turnRouting(cwd, prompt, isRepo);
const relevant = Boolean(turn && (turn.decision.owner || (turn.decision.codeEvidence && (turn.decision.skill || turn.decision.reason === 'lane-unresolved'))));
const selection = classifyRequest({ prompt, explicit, recognized: projectActivation(cwd, config, children).active, relevant });
const output = { continue: true, suppressOutput: true };

// Short replies to a stored card or delivered branch (ACG C6). Reads at most two
// JSON files; never runs git or network.
async function shortReplyContext() {
  if (!sessionId) return null;
  let sessionState = null;
  if (isRepo) sessionState = await readJson(path.join(stateRoot, 'runtime', 'sessions', sessionId + '.json'));
  else {
    const pointer = await readJson(sessionPointerPath(sessionId));
    const root = pointer?.targetRoots?.[0];
    if (root) sessionState = await readJson(path.join(root, '.agrimap-agent', 'runtime', 'sessions', sessionId + '.json'));
  }
  if (!sessionState?.lastCard && !sessionState?.lastDelivery) return null;
  const resolved = resolveShortIntent(prompt, { lastCard: sessionState.lastCard || null });
  const delivery = sessionState.lastDelivery;
  if (resolved.intent === 'select-option') {
    const card = sessionState.lastCard;
    return `User reply "${String(prompt).trim()}" selects option ${resolved.option} "${resolved.label}" of card ${card.cardId} (${card.kind}/${card.topic}). This is the explicit instruction for that option. Record it with decide record --card ${card.cardId} --choice ${resolved.option}, then continue.`;
  }
  if (['integrate', 'open-pr', 'update-branch', 'park', 'abandon'].includes(resolved.intent) && delivery?.branch) {
    if (resolved.code) return `Short integration intent "${resolved.intent}" targets ${resolved.target}: ${resolved.code}. Explain it; do not run git actions.`;
    const target = resolved.target ? ` --target ${resolved.target}` : '';
    return `Short integration intent "${resolved.intent}" for ${delivery.branch} → ${resolved.target || 'policy target'}. Run agm-workspace.mjs integrate plan --intent ${resolved.intent}${target}${resolved.whenGreen ? ' --when-green' : ''} and follow its result.`;
  }
  if (resolved.intent === 'question') return `The reply is a question about ${resolved.about}; answer it without running git actions.`;
  return null;
}
const shortReply = await shortReplyContext();

const clip = (value, size) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > size ? text.slice(0, size - 1) + '…' : text;
};
const pendingWork = isRepo ? await listPending(stateRoot).catch(() => []) : [];

// Savepoint (5.0.1): short requests about unfinished work need no lifecycle.
function workIntentContext() {
  const resolved = resolveWorkIntent(prompt);
  if (!resolved || !isRepo) return null;
  const mine = pendingWork.find((item) => item.session === sessionId && item.attached);
  if (resolved.intent === 'savepoint') {
    return mine
      ? `Write a savepoint for ${mine.executionId}: agm-workspace.mjs savepoint --execution ${mine.executionId} --session ${sessionId} --done "<finished items>" --remaining "<what is left>" --next "<first next step>", then confirm it in three lines.`
      : 'This session has no open execution, so there is nothing to savepoint; list unfinished work with agm-workspace.mjs pending instead.';
  }
  if (resolved.intent === 'pending' || (resolved.intent === 'resume' && !resolved.executionId && pendingWork.length !== 1)) {
    if (!pendingWork.length) return 'No unfinished savepoint exists in this project; say so in one line.';
    return `Unfinished work (${pendingWork.length}): run agm-workspace.mjs pending and show a numbered list — objective, done count, remaining, next step, branch, age${resolved.intent === 'resume' ? ' — then ask which one to resume' : '; offer to resume one'}.`;
  }
  const target = pendingWork.find((item) => item.executionId === resolved.executionId) || (!resolved.executionId ? pendingWork[0] : null);
  if (!target) return `No unfinished execution ${resolved.executionId}; run agm-workspace.mjs pending.`;
  return `Resume ${target.executionId} "${clip(target.objective, 60)}": run agm-workspace.mjs resume --execution ${target.executionId} --session ${sessionId}, switch to ${target.branch || 'its branch'} if needed, show done/remaining/next in up to five lines, then continue from the next step.`;
}
const workContext = workIntentContext();

// Session digest (ACG C7 §10.7): at most three lines / 600 chars, emitted when
// its hash changes. Reads a handful of JSON files and .git/HEAD; no git, no scan.
async function sessionDigest(active) {
  if (!isRepo || !sessionId || config?.governance?.decisionMemory === false) return null;
  const policy = await readJson(path.join(stateRoot, 'policy', 'workflow.json'));
  const project = await readJson(path.join(stateRoot, 'policy', 'project.json'));
  const index = await readJson(path.join(stateRoot, 'cache', 'decisions-index.json'));
  const head = await readText(path.join(cwd, '.git', 'HEAD'), 200).catch(() => null);
  const branch = String(head || '').match(/ref:\s*refs\/heads\/(\S+)/)?.[1] || 'detached';
  const sessionFile = path.join(stateRoot, 'runtime', 'sessions', sessionId + '.json');
  const sessionState = await readJson(sessionFile) || {};
  const others = pendingWork.filter((item) => item.executionId !== active?.executionId);
  const hash = fingerprint(JSON.stringify([policy?.status, policy?.profile, policy?.delivery, index?.fileCount, index?.maxMtimeMs, branch, active?.executionId, active?.verificationStatus, active?.delivery?.commit, project?.developmentMode, others.map((item) => item.executionId + item.updated)]));
  if (sessionState.digestHash === hash) return null;
  const approved = (index?.entries || []).filter((entry) => entry.status === 'approved');
  const topics = [...new Set(approved.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map((entry) => entry.topic).filter(Boolean))].slice(0, 3);
  const lines = [
    'AGM digest: target ' + path.basename(cwd) + ' · branch ' + branch + (policy ? ' · policy ' + (policy.profile || 'custom') + ' (' + (policy.status || 'draft') + '; commit+push on complete: ' + (policy.delivery?.commitOnComplete ? 'yes' : 'no') + ')' : ' · no workflow policy') + (project?.developmentMode ? ' · mode ' + project.developmentMode : ''),
    // Unfinished work comes right after the target line so it is never missed (5.0.1).
    ...(others.length ? ['⏸ Pending work ' + others.length + ': ' + others.slice(0, 2).map((item) => item.executionId + ' "' + clip(item.objective, 40) + '" next: ' + clip(item.next || 'see savepoint', 50)).join('; ') + '. Tell the requester once; ทำต่อ resumes it.'] : []),
    'Decisions: ' + (index ? approved.length + ' approved' + (topics.length ? '; recent topics: ' + topics.join(', ') : '') : 'index not built') + '. Recall at decision points: agm-workspace.mjs recall --topic <t> --paths <p>.',
    ...(active?.executionId ? ['Open execution: ' + active.executionId + ' "' + String(active.objective || '').slice(0, 60) + '" (' + (active.verificationStatus || 'not verified') + ', ' + (active.delivery?.commit ? 'delivered' : 'not delivered') + ')'] : []),
  ];
  const text = lines.join(String.fromCharCode(10)).slice(0, 600);
  await writeJson(sessionFile, { ...sessionState, digestHash: hash });
  return text;
}
// SessionStart is intentionally silent. Current-turn intent precedes identity,
// old execution state and all persistence. Names/cwd alone are insufficient.
if (selection.active || shortReply || workContext) {
  if (isRepo && selection.active) await archiveRawPrompt(stateRoot, config, input);
  const active = sessionId ? await readJson(path.join(stateRoot, 'runtime', 'active', sessionId + '.json')) : null;
  const identity = await readConfirmedIdentity(stateRoot, sessionId, {defaultProvider: provider});
  const ownerTurn = Boolean(turn?.decision.owner);
  const context = [
    'AgriMap skills: choose one skill per turn by intent x lane (references/skill-routing.md, AGENTS.md §0). Quoted commands are examples, not authorization.',
    'Questions about repository code still load the lane skill for its golden references; questions and explanations create no lifecycle, task files, identity prompt or tests. Start execution only for authorized durable work.',
    ...(ownerTurn ? [] : ['Inside AgriMap operations SQL context is read-only (managed metadata and protected SELECT; never reveal real sensitive values, relay reveal_handoff; no DDL/DML, EXEC, metadata sync or routine deployment; export only in agm-sql context migrate); supporting skills never grant database writes or release authority.']),
    packageWork ? 'Workspace kind: skill-package. Package work never creates root product FE/BE/SQL artifacts.' : 'Use only the applicable project contracts.',
    identity && !identity.expired ? 'Confirmed requester: ' + identity.requestedBy + '. Identity is not approval authority.'
      : 'For attributed writes, reuse confirmed conversation identity via --requested-by before asking once. Missing local state is not missing human confirmation. Git author alone is not requester evidence; do not ask for ordinary questions.',
    input.model ? 'Actual host model: ' + input.model + '; configurable labels are separate.' : 'Record actual host model when known; otherwise unknown.',
    sessionId ? 'Session: ' + sessionId : 'Use a stable session for durable work.'
  ];
  const digest = selection.active ? await sessionDigest(active) : null;
  if (turn) context.push(...routingLines(turn, HOOK_HOSTS[provider] || 'claude'));
  if (digest) context.push(digest);
  if (active) {
    const own = pendingWork.find((item) => item.executionId === active.executionId);
    context.push('Open execution ' + (active.executionId || active.taskId) + ' "' + clip(active.objective, 60) + '"' + (own?.next ? ' next: ' + clip(own.next, 80) : '') + '. A related message folds into it and updates its savepoint; an unrelated one is answered on its own, then one line reminds that this execution is still open (ทำต่อ resumes it).');
  }
  if (!isRepo) {
    context.push('Session cwd is outside any Git repository. Before any write run `agm-workspace.mjs context --cwd "' + cwd.replaceAll('\\', '/') + '" --hint "<project>"`, then read and ack the target AGENTS.md chain. Repositories below: ' + (children.slice(0, 5).map((dir) => path.basename(dir)).join(', ') || 'none found') + '.');
    if (children.length && !(await stat(path.join(cwd, 'AGENTS.md')).then(() => true, () => false))) {
      context.push('Workspace routing: this folder has no AGENTS.md, so hosts without hooks miss the skill matrix. Offer the owner `node "' + path.join(SCRIPT_DIRECTORY, 'skill-routing.mjs').replaceAll('\\', '/') + '" workspace --cwd "' + cwd.replaceAll('\\', '/') + '"` (plan only; --apply writes AGENTS.md and CLAUDE.md).');
    }
  } else {
    for (const reference of referencedPaths(prompt)) {
      const other = await nearestRepository(path.resolve(cwd, reference));
      if (other && path.resolve(other).toLowerCase() !== path.resolve(cwd).toLowerCase()) {
        context.push('The request references another repository (' + path.basename(other) + '); resolve it with context --paths before writing.');
        break;
      }
    }
  }
  if (shortReply) context.push(shortReply);
  if (workContext) context.push(workContext);
  // A bare short reply ("1", "merge", "งานค้าง") gets only its own lines.
  const lines = selection.active ? context : [shortReply, workContext].filter(Boolean);
  output.hookSpecificOutput = { hookEventName: input.hook_event_name || input.hookEventName || 'UserPromptSubmit', additionalContext: lines.join('\n') };
}
process.stdout.write(JSON.stringify(output));
