#!/usr/bin/env node
// Pre-tool guard for git commands the agent types itself (ACG C8 §11.2; G7 team
// commit style since 4.9.6).
// Package scripts call git through execFileSync and are never seen here.
// Fail-open: any parse error or exception allows the command and writes one
// stderr line. governance.guards:false makes the hook a no-op.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs } from "./cli-args.mjs";
import { checkCommitHeader } from "./git-flow.mjs";
import { DEFAULT_PROTECTED, isProtected, loadPolicy } from "./workflow-policy.mjs";
import { safeSession } from "./session-state.mjs";

const DENY = "deny";
const ASK = "ask";
const GLOBAL_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);

// Splits on && || ; | & and newlines outside quotes, after joining bash
// backslash and PowerShell backtick line continuations. Throws on an
// unterminated quote (the caller fails open).
export function splitCommands(command) {
  const text = String(command || "").replace(/\\\r?\n/g, " ").replace(/`\r?\n/g, " ");
  const segments = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') { quote = char; current += char; continue; }
    if (char === "\n" || char === "\r" || char === ";" || char === "|" || char === "&") {
      if (char === "&" && (text[index + 1] === ">" || text[index - 1] === ">")) { current += char; continue; }
      segments.push(current);
      current = "";
      if ((char === "&" || char === "|") && text[index + 1] === char) index += 1;
      continue;
    }
    current += char;
  }
  if (quote) throw new Error("unterminated quote");
  segments.push(current);
  return segments.map(item => item.trim()).filter(Boolean);
}

export function tokenize(segment) {
  const tokens = [];
  let current = "";
  let quote = null;
  let started = false;
  for (const char of segment) {
    if (quote) { if (char === quote) quote = null; else current += char; continue; }
    if (char === "'" || char === '"') { quote = char; started = true; continue; }
    if (/\s/.test(char)) { if (started) tokens.push(current); current = ""; started = false; continue; }
    current += char;
    started = true;
  }
  if (started) tokens.push(current);
  return tokens;
}

// Returns { sub, args } for a git invocation, or null.
export function gitInvocation(segment) {
  const tokens = tokenize(segment);
  let index = 0;
  while (index < tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index]) || tokens[index] === "&" || /^(?:sudo|command|exec|env)$/.test(tokens[index]))) index += 1;
  const program = String(tokens[index] || "").replaceAll("\\", "/").split("/").pop().toLowerCase();
  if (program !== "git" && program !== "git.exe") return null;
  index += 1;
  const globals = [];
  while (index < tokens.length && tokens[index].startsWith("-")) {
    globals.push(tokens[index]);
    if (GLOBAL_WITH_VALUE.has(tokens[index])) { globals.push(tokens[index + 1]); index += 1; }
    index += 1;
  }
  if (index >= tokens.length) return null;
  const cwdIndex = globals.indexOf("-C");
  return { sub: tokens[index], args: tokens.slice(index + 1), cwd: cwdIndex >= 0 ? globals[cwdIndex + 1] : null };
}

// G8 (4.11.0): `sqlctx query --reveal` prints real sensitive values to the terminal.
// sql-context-pack 3.0.0 refuses it without an interactive terminal; this denies the
// agent typing it at all, so protected values never enter an agent transcript.
export function sqlctxRevealInvocation(segment) {
  const tokens = tokenize(segment);
  let index = 0;
  while (index < tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index]) || tokens[index] === "&" || /^(?:sudo|command|exec|env)$/.test(tokens[index]))) index += 1;
  const program = String(tokens[index] || "").replaceAll("\\", "/").split("/").pop().toLowerCase();
  const rest = tokens.slice(index + 1);
  const viaModule = /^(?:python3?|py)(?:.exe)?$/.test(program) && rest[0] === "-m" && rest[1] === "sqlctx";
  if (program !== "sqlctx" && program !== "sqlctx.exe" && !viaModule) return false;
  return rest.includes("query") && rest.some(item => item === "--reveal" || item.startsWith("--reveal="));
}

// Heredoc ($(cat <<'EOF' ... EOF)) and PowerShell here-string (@'...'@) bodies.
function unwrapMessage(value) {
  const text = String(value);
  const heredoc = text.match(/^\$\(\s*cat\s+<<-?\s*(['"]?)([A-Za-z_]\w*)\1[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\2[ \t]*(?:\r?\n)?\s*\)\s*$/);
  if (heredoc) return heredoc[3];
  const here = text.match(/^@\r?\n([\s\S]*?)\r?\n@$/);
  return here ? here[1] : text;
}

// Message of `git commit -m/--message/-F/--file`; null when unknown (editor, stdin, reuse).
export function commitMessageOf(args, readMessageFile = null) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") break;
    let value;
    let file = false;
    if (arg === "-m" || arg === "--message") value = args[index + 1];
    else if (arg.startsWith("--message=")) value = arg.slice("--message=".length);
    else if (arg === "-F" || arg === "--file") { value = args[index + 1]; file = true; }
    else if (arg.startsWith("--file=")) { value = arg.slice("--file=".length); file = true; }
    else if (/^-[A-Za-z]+$/.test(arg) && /[mF]$/.test(arg)) { value = args[index + 1]; file = arg.endsWith("F"); }
    else if (/^-m./.test(arg)) value = arg.slice(2);
    else continue;
    if (value === undefined) return null;
    if (!file) return unwrapMessage(value);
    if (value === "-" || !readMessageFile) return null;
    try { return readMessageFile(value); } catch { return null; }
  }
  return null;
}

const shortFlags = (args, letter) => args.some(arg => /^-[A-Za-z]+$/.test(arg) && arg.includes(letter));

// G9 (5.0.1): the branch a command creates, with its start point when given.
// switch -c/-C/--create, checkout -b/-B, branch <name> [start] (not list/delete/
// copy/move flags except -m/-M, whose last name is the new branch), worktree add -b/-B.
export function createdBranchOf({ sub, args }) {
  const positional = list => list.filter(arg => !arg.startsWith("-"));
  const after = (flags) => {
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      const inline = arg.match(/^--(?:create|force-create)=(.+)$/);
      if (inline) return { name: inline[1], start: positional(args.slice(index + 1))[0] || null };
      if (flags.includes(arg)) return { name: args[index + 1] || null, rest: args.slice(index + 2) };
    }
    return null;
  };
  if (sub === "switch" || sub === "checkout") {
    const hit = after(sub === "switch" ? ["-c", "-C", "--create", "--force-create"] : ["-b", "-B"]);
    return hit ? { name: hit.name, start: hit.start ?? positional(hit.rest || [])[0] ?? null } : null;
  }
  if (sub === "worktree" && args[0] === "add") {
    const hit = after(["-b", "-B"]);
    return hit ? { name: hit.name, start: positional(hit.rest || [])[1] ?? null } : null;
  }
  if (sub === "branch") {
    if (args.some(arg => /^-[mM]$|^--move$/.test(arg))) return { name: positional(args).at(-1) || null, start: null };
    if (args.some(arg => arg.startsWith("-") && !/^(?:-t|--track(?:=.*)?|--no-track|-f|--force)$/.test(arg))) return null;
    const [name, start = null] = positional(args);
    return name ? { name, start } : null;
  }
  return null;
}

const ALLOWED_WORK_PREFIXES = ["feature/", "hotfix/"];
const HOST_BRANCH = /^(?:claude|codex|cursor|gemini|antigravity)\/|^worktree-/;

function workBranchVerdict(created, context) {
  const name = String(created?.name || "");
  if (!name || name.includes("$")) return null;
  const policy = { branching: { protected: context.protectedList || DEFAULT_PROTECTED } };
  if (ALLOWED_WORK_PREFIXES.some(prefix => name.startsWith(prefix)) || isProtected(policy, name) || HOST_BRANCH.test(name)) return null;
  // Checking out a branch that already exists on the remote keeps its name.
  if (created.start && String(created.start).replace(/^(?:refs\/remotes\/)?[^/]+\//, "") === name) return null;
  const slug = name.includes("/") ? name.slice(name.indexOf("/") + 1) : name;
  return { decision: DENY, rule: "G9", reason: `work branch "${name}" is not allowed; work branches are feature/<slug> or hotfix/<slug> only (fix, refactor, docs and chore use feature/); use "feature/${slug}"` };
}
const stripRef = value => String(value || "").replace(/^\+/, "").replace(/^refs\/heads\//, "");
const isTag = value => /^refs\/tags\//.test(value) || /^v?\d+\.\d+(?:\.\d+)?/.test(value);

// Pure rule evaluation. context: { protectedList, currentBranch, release,
// commitConvention ("agrimap"|"conventional"|null), commitLanguage ("th" default), readMessageFile }.
export function evaluate(invocation, context) {
  const { sub, args } = invocation;
  const policy = { branching: { protected: context.protectedList || DEFAULT_PROTECTED } };
  const protectedRef = ref => isProtected(policy, stripRef(ref));
  if (sub === "push") {
    const options = args.filter(arg => arg.startsWith("-"));
    const positional = args.filter(arg => !arg.startsWith("-"));
    if (options.some(arg => /^--(?:force|force-with-lease|force-if-includes|mirror)(?:=|$)/.test(arg)) || shortFlags(options, "f") || positional.slice(1).some(arg => arg.startsWith("+"))) {
      return { decision: DENY, rule: "G1", reason: "force or mirror push rewrites remote history" };
    }
    const refspecs = positional.slice(1);
    const deleting = options.some(arg => arg === "--delete") || shortFlags(options, "d");
    const deleted = deleting ? refspecs : refspecs.filter(spec => spec.startsWith(":")).map(spec => spec.slice(1));
    for (const ref of deleted) {
      if (isTag(ref)) return { decision: DENY, rule: "G5", reason: `deleting remote tag ${ref}` };
      if (protectedRef(ref)) return { decision: DENY, rule: "G5", reason: `deleting protected branch ${stripRef(ref)}` };
    }
    if (deleting) return null;
    if (options.includes("--tags")) return null;
    const targets = refspecs.length ? refspecs.map(spec => (spec.includes(":") ? spec.split(":").pop() : spec)) : [context.currentBranch].filter(Boolean);
    const hit = targets.find(ref => !isTag(ref) && protectedRef(ref));
    if (hit && !context.release) return { decision: DENY, rule: "G2", reason: `push to protected branch ${stripRef(hit)}; use integrate plan/apply or the project release flow` };
    return null;
  }
  if (sub === "add") {
    const paths = args.filter(arg => arg !== "--" && !arg.startsWith("-")).map(item => item.replaceAll("\\", "/").replace(/^\.\//, ""));
    if (args.includes("-A") || args.includes("--all") || shortFlags(args.filter(arg => arg !== "--"), "A") || paths.some(item => item === "." || item === ":/" || item === "*")) {
      return { decision: DENY, rule: "G3", reason: "stage exact paths only; never add everything" };
    }
    if (paths.some(item => item === ".agrimap-agent" || item === ".agrimap-agent/" || item === ".agrimap-agent/local" || item.startsWith(".agrimap-agent/local/"))) {
      return { decision: DENY, rule: "G3", reason: ".agrimap-agent is staged by deliver; .agrimap-agent/local is never committed" };
    }
    return null;
  }
  if (sub === "reset" && args.includes("--hard")) return { decision: ASK, rule: "G4", reason: "reset --hard discards uncommitted work" };
  if (sub === "clean" && (args.some(arg => /^--force$/.test(arg)) || shortFlags(args, "f"))) return { decision: ASK, rule: "G4", reason: "clean -f deletes untracked files" };
  if (sub === "checkout" && args.includes("--") && args.slice(args.indexOf("--") + 1).some(item => item === ".")) return { decision: ASK, rule: "G4", reason: "checkout -- . discards local changes" };
  if (sub === "restore" && args.some(item => item === "." || item === ":/")) return { decision: ASK, rule: "G4", reason: "restore . discards local changes" };
  if (sub === "branch" && (args.includes("--delete") || shortFlags(args, "D") || shortFlags(args, "d"))) {
    const hit = args.filter(arg => !arg.startsWith("-")).find(protectedRef);
    if (hit) return { decision: DENY, rule: "G5", reason: `deleting protected branch ${hit}` };
    return null;
  }
  if (context.workBranchRule) {
    const verdict = workBranchVerdict(createdBranchOf(invocation), context);
    if (verdict) return verdict;
  }
  if (sub === "tag" && (args.includes("--delete") || shortFlags(args, "d"))) return { decision: DENY, rule: "G5", reason: "deleting a tag" };
  if (sub === "stash" && !["list", "show"].includes(args[0])) return { decision: ASK, rule: "G6", reason: "stash hides the requester's work" };
  if (sub === "commit" && context.commitConvention) {
    const message = commitMessageOf(args, context.readMessageFile ? file => context.readMessageFile(file, invocation.cwd) : null);
    const header = message === null ? "" : message.split(/\r?\n/).map(line => line.trim()).find(Boolean) || "";
    // Unresolved shell expansion or an unknown message fails open.
    if (!header || header.includes("$")) return null;
    const check = checkCommitHeader(header, context.commitConvention, context.commitLanguage || "th");
    if (check.ok) return null;
    const thai = check.reason === "type" ? "" : " with a Thai description (English only for technical names)";
    return { decision: DENY, rule: "G7", reason: `commit header "${header.slice(0, 80)}" is not the team style "<feature|fix|comment|bump|audit|ci>: <plain description>"${thai} of AGENTS.md §10.6${check.suggestion ? `; use "${check.suggestion}"` : ""}` };
  }
  return null;
}

function git(cwd, args) {
  try { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; }
}

async function readJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return null; }
}

// G7 applies in AgriMap repositories: a workflow policy, .agrimap-agent state or the bootstrap marker.
async function commitConventionFor(root, loaded) {
  if (!root) return null;
  if (loaded?.validation?.ok) return loaded.policy.delivery?.commitConvention || "agrimap";
  if (await stat(path.join(root, ".agrimap-agent")).then(() => true, () => false)) return "agrimap";
  return /AGRIMAP BOOTSTRAP VERSION/.test(await readFile(path.join(root, "AGENTS.md"), "utf8").catch(() => "")) ? "agrimap" : null;
}

export async function guardCommand(command, { cwd, session = null } = {}) {
  const root = git(cwd, ["rev-parse", "--show-toplevel"]) || null;
  if (root) {
    const config = await readJson(path.join(root, ".agrimap-agent", "config.json"));
    if (config?.governance?.guards === false) return null;
  }
  const loaded = root ? await loadPolicy(root) : null;
  const active = root && safeSession(session) ? await readJson(path.join(root, ".agrimap-agent", "runtime", "active", `${safeSession(session)}.json`)) : null;
  const commitConvention = await commitConventionFor(root, loaded);
  // The skill-package repository itself develops on fix/* (DEVELOPMENT.md), so G9 is product-only.
  const packageName = root ? (await readJson(path.join(root, "package.json")))?.name : null;
  const context = {
    protectedList: loaded?.validation?.ok ? loaded.policy.branching?.protected || DEFAULT_PROTECTED : DEFAULT_PROTECTED,
    currentBranch: root ? git(root, ["branch", "--show-current"]) : null,
    release: active?.operation === "release",
    commitConvention,
    workBranchRule: Boolean(commitConvention) && packageName !== "agrimap-agent-skills",
    commitLanguage: loaded?.validation?.ok ? loaded.policy.delivery?.commitLanguage || "th" : "th",
    readMessageFile: (file, gitCwd) => readFileSync(path.resolve(cwd, gitCwd || ".", file), "utf8"),
  };
  let result = null;
  for (const segment of splitCommands(command)) {
    if (sqlctxRevealInvocation(segment)) return { decision: DENY, rule: "G8", reason: "sqlctx query --reveal shows real sensitive values; give the user reveal_handoff to run it themselves" };
    const invocation = gitInvocation(segment);
    if (!invocation) continue;
    const verdict = evaluate(invocation, context);
    if (verdict?.decision === DENY) return verdict;
    result ||= verdict;
  }
  return result;
}

export function hookOutput(verdict) {
  if (!verdict) return null;
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: verdict.decision, permissionDecisionReason: `AGM guard ${verdict.rule}: ${verdict.reason}.` } };
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text ? JSON.parse(text) : {};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    parseCliArgs(process.argv.slice(2));
    const input = await readStdin();
    const command = input.tool_input?.command ?? input.toolInput?.command ?? "";
    const verdict = command ? await guardCommand(command, { cwd: path.resolve(input.cwd || process.cwd()), session: input.session_id || input.sessionId }) : null;
    const output = hookOutput(verdict);
    if (output) process.stdout.write(JSON.stringify(output));
  } catch (error) {
    process.stderr.write(`AGM guard skipped (fail-open): ${String(error?.message || error).slice(0, 160)}\n`);
  }
}
