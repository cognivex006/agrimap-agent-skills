// Work branch, delivery and integration mechanics (ACG C4-C6).
// Every function takes { run } so tests can stub gh/glab (glab flags checked
// against glab 1.115 --help); git is always an argv
// array through run(). Plans are pure reads; apply() recomputes the plan and
// refuses a different planHash. No force push, stash, reset, worktree or clone.
import { createHash } from "node:crypto";
import { mkdir, open, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultRun, trimStderr } from "./run-command.mjs";
import { detectSensitive } from "./sensitive-recording.mjs";
import { isProtected, workTypeOf } from "./workflow-policy.mjs";

const AUDIT_DIRECTORIES = new Set(["decisions", "instructions", "knowledge", "logs", "memory", "reports", "policy"]);
const SECRET_KINDS = new Set(["CREDENTIAL", "TOKEN", "AUTH", "PRIVATE_KEY"]);
// Team commit style (bootstrap AGENTS.md §10.6): "<type>: <plain description>" that an
// App Leader, BA or customer can read. Work: feature|fix|comment; agm-release: bump|audit|ci.
const TYPE_BY_WORK = { feature: "feature", fix: "fix", hotfix: "fix", refactor: "comment", docs: "comment", chore: "ci" };
export const TEAM_HEADER = /^(feature|fix|comment|ci|bump|audit): \S.*$/u;
const TEAM_HEADER_MAX = 100;
// Conventional or habitual types map onto the team type and lose their scope (4.9.6).
const TEAM_TYPE_OF = {
  feat: "feature", feature: "feature", fix: "fix", bugfix: "fix", hotfix: "fix",
  comment: "comment", refactor: "comment", docs: "comment", doc: "comment", style: "comment", perf: "comment", test: "comment", tests: "comment",
  chore: "ci", build: "ci", ci: "ci", bump: "bump", release: "bump", version: "bump", audit: "audit",
};
const PREFIXED = /^([A-Za-z]+)(?:\([^)]*\))?!?:\s*(.*)$/u;
// Headers Git writes itself keep Git's wording.
const GIT_GENERATED = /^(?:Merge (?:branch|remote-tracking branch|pull request|tag|commit) |Revert "|(?:fixup|squash|amend)! )/;
// English Conventional Commits pass only when the policy selects commitConvention "conventional".
const HEADER =/^(feat|fix|refactor|docs|chore|test|perf|build|ci)(\([a-z0-9._/-]+\))?: \S.*$/;

export function teamHeader(header) {
  const match = String(header || "").trim().match(PREFIXED);
  const type = match && TEAM_TYPE_OF[match[1].toLowerCase()];
  return type && match[2].trim() ? `${type}: ${match[2].trim()}` : null;
}

// With policy delivery.commitLanguage "th" (the default) the description is Thai so a BA
// and the team can read it: at least 30% of its letters are Thai; English stays only for
// technical names such as an API, SP or version (4.9.8).
const THAI_MIN_SHARE = 0.3;
export function isThaiDescription(text) {
  const thai = (String(text).match(/[ก-๛]/gu) || []).length;
  const latin = (String(text).match(/[A-Za-z]/g) || []).length;
  return thai > 0 && thai / (thai + latin) >= THAI_MIN_SHARE;
}

export function checkCommitHeader(header, convention = "agrimap", language = "th") {
  const value = String(header || "").trim();
  if (GIT_GENERATED.test(value)) return { ok: true, generated: true };
  const thai = text => language !== "th" || isThaiDescription(text.slice(text.indexOf(":") + 1));
  if (TEAM_HEADER.test(value) && value.length <= TEAM_HEADER_MAX) return thai(value) ? { ok: true } : { ok: false, reason: "thai", suggestion: null };
  if (convention === "conventional" && HEADER.test(value) && value.length <= 72 && !/[^\x20-\x7e]/.test(value)) return { ok: true };
  const suggestion = teamHeader(value);
  const usable = suggestion && suggestion.length <= TEAM_HEADER_MAX && thai(suggestion);
  return { ok: false, reason: suggestion && !thai(suggestion) ? "type+thai" : "type", suggestion: usable ? suggestion : null };
}
const SLUG = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const toSlash = value => String(value || "").replaceAll("\\", "/");
// Append-only audit written after a delivery (delivered/completed/integrated,
// recent memory) rides with the next delivery instead of becoming preexisting.
const CARRIED_AUDIT = /^\.agrimap-agent\/(?:logs|memory\/recent|reports|decisions)\//;
export const isCarriedAudit = relative => CARRIED_AUDIT.test(toSlash(relative));
const exists = file => stat(file).then(() => true, () => false);

export function planHashOf(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function git(run, root, args, options = {}) {
  return run("git", args, { ...options, cwd: root });
}

function out(result) {
  return result.ok ? result.stdout.trim() : "";
}

function stop(code, message, extra = {}) {
  return { ok: false, code, message, warnings: [], next: extra.next || { action: "report" }, card: null, ...extra };
}

function warning(code, subject, fix) {
  return { code, subject, fix };
}

// ---------------------------------------------------------------- git facts

export function parsePorcelainZ(stdout) {
  const parts = String(stdout || "").split("\0");
  const entries = [];
  for (let index = 0; index < parts.length; index += 1) {
    const record = parts[index];
    if (record.length < 4) continue;
    const xy = record.slice(0, 2);
    const entry = { path: toSlash(record.slice(3)), status: xy.trim() || xy };
    if (/[RC]/.test(xy)) { entry.origPath = toSlash(parts[index + 1] || ""); index += 1; }
    entries.push(entry);
  }
  return entries;
}

export function dirtyInventory(root, { run = defaultRun } = {}) {
  return parsePorcelainZ(git(run, root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout);
}

async function hashPath(root, relative, run) {
  const file = path.join(root, relative);
  const info = await stat(file).catch(() => null);
  if (!info) return "deleted";
  if (info.isDirectory()) return "directory";
  const result = git(run, root, ["hash-object", "--", relative]);
  return result.ok ? result.stdout.trim() : "unreadable";
}

// Snapshot taken by `start` before any write so delivery never stages
// files that were already dirty when the execution began.
export async function snapshotDirty(root, { run = defaultRun } = {}) {
  // The state ignore file is created by the runtime itself (context --ack), not pre-existing work.
  const entries = dirtyInventory(root, { run }).filter(entry => entry.path !== ".agrimap-agent/.gitignore" && !isCarriedAudit(entry.path));
  const snapshot = [];
  for (const entry of entries.slice(0, 5000)) snapshot.push({ path: entry.path, status: entry.status, hash: await hashPath(root, entry.path, run) });
  return snapshot;
}

function refExists(run, root, ref) {
  return git(run, root, ["show-ref", "--verify", "--quiet", ref]).ok;
}

function isAncestor(run, root, ancestor, descendant) {
  return git(run, root, ["merge-base", "--is-ancestor", ancestor, descendant]).ok;
}

export async function gitFacts(root, { run = defaultRun, fetch = true } = {}) {
  const warnings = [];
  const branch = out(git(run, root, ["branch", "--show-current"]));
  const head = out(git(run, root, ["rev-parse", "HEAD"])) || null;
  const gitDir = out(git(run, root, ["rev-parse", "--path-format=absolute", "--git-dir"]));
  let operationInProgress = null;
  for (const marker of ["MERGE_HEAD", "rebase-merge", "rebase-apply", "CHERRY_PICK_HEAD"]) {
    if (gitDir && await exists(path.join(gitDir, marker))) { operationInProgress = marker; break; }
  }
  const upstreamResult = git(run, root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  const remoteUrl = git(run, root, ["remote", "get-url", "origin"]);
  const hasRemote = remoteUrl.ok;
  let fetched = false;
  if (hasRemote && fetch) {
    fetched = git(run, root, ["fetch", "--prune", "origin"]).ok;
    if (!fetched) warnings.push(warning("OFFLINE_FETCH_FAILED", "origin", "continue with local refs; retry when online"));
  } else if (!hasRemote) warnings.push(warning("NO_REMOTE", "origin", "commit only; add an origin remote to push"));
  return {
    branch, head, gitDir, operationInProgress,
    upstream: upstreamResult.ok ? upstreamResult.stdout.trim() : null,
    hasRemote, remoteUrl: hasRemote ? remoteUrl.stdout.trim() : null, fetched,
    dirty: dirtyInventory(root, { run }), warnings,
  };
}

// ------------------------------------------------------------- work branch

function candidateName(prefix, ticket, slug, suffix) {
  return `${prefix}${ticket ? `${String(ticket).toLowerCase()}-` : ""}${slug}${suffix > 1 ? `-${suffix}` : ""}`;
}

function branchCard({ question, impact, checked, options, reason, risk = "R2" }) {
  return { kind: "workflow", topic: "git/work-branch", risk, confidence: "medium", question, impact, checked, options, recommended: "1", recommendedReason: reason, blocking: true, default: null, recordAs: "none", paths: [], expiresHours: 24 };
}

export async function planBranch({ root, policy, active = null, type, slug, ticket = null, mode = null, run = defaultRun, fetch = true }) {
  if (!policy) return stop("POLICY_REQUIRED", "No workflow policy; run policy infer and ask its card first.", { next: { action: "run", command: "policy infer" } });
  if (policy.branching?.disabled) return { ok: true, action: "skip", reason: "branching disabled by policy", commands: [], warnings: [], card: null };
  const workType = policy.branching?.workTypes?.[type];
  if (!workType) return stop("WORK_TYPE_INVALID", `--type must be one of ${Object.keys(policy.branching?.workTypes || {}).join("|")}.`);
  if (!SLUG.test(String(slug || ""))) return stop("BRANCH_NAME_INVALID", "--slug must be English kebab-case.", { next: { action: "run", command: "branch plan with a kebab-case --slug" } });
  const maxLength = Number(policy.branching.slug?.maxLength || 40);
  const facts = await gitFacts(root, { run, fetch });
  if (!facts.branch) return stop("DETACHED_HEAD", "HEAD is detached; ask the requester which branch to use.");
  if (facts.operationInProgress) return stop("OPERATION_IN_PROGRESS", `A ${facts.operationInProgress} is in progress; the requester must finish or abort it.`);
  const base = workType.base;
  const baseRef = facts.hasRemote && refExists(run, root, `refs/remotes/origin/${base}`) ? `origin/${base}` : refExists(run, root, `refs/heads/${base}`) ? base : null;
  if (!baseRef) return stop("BASE_NOT_FOUND", `Base branch ${base} exists neither locally nor on origin.`);
  const baseSha = out(git(run, root, ["rev-parse", baseRef]));
  const first = candidateName(workType.prefix, ticket, slug, 1);
  if (first.length > workType.prefix.length + maxLength || !git(run, root, ["check-ref-format", "--branch", first]).ok) return stop("BRANCH_NAME_INVALID", `Branch name ${first} is too long or invalid.`);
  let name = first;
  const taken = candidate => refExists(run, root, `refs/heads/${candidate}`) || refExists(run, root, `refs/remotes/origin/${candidate}`);
  if (facts.branch !== first && taken(first) && active?.branch !== first) {
    name = null;
    for (let suffix = 2; suffix <= 9 && !name; suffix += 1) if (!taken(candidateName(workType.prefix, ticket, slug, suffix))) name = candidateName(workType.prefix, ticket, slug, suffix);
    if (!name) return stop("BRANCH_NAME_EXHAUSTED", "Suffixes -2..-9 are taken; choose another slug.");
  }
  const dirty = facts.dirty.filter(entry => !entry.path.startsWith(".agrimap-agent/"));
  const hostPatterns = (policy.branching.hostBranchPatterns || []).map(pattern => new RegExp(pattern));
  const currentType = workTypeOf(policy, facts.branch);
  const warnings = [...facts.warnings];
  let action;
  let commands = [];
  let remoteBranch = name;
  let card = null;
  const createFrom = start => (start ? ["git", "switch", "--no-track", "-c", name, start] : ["git", "switch", "-c", name]);
  if (mode === "current") action = "reuse";
  else if (facts.branch === name || (active?.branch && facts.branch === active.branch && currentType)) action = "reuse";
  else if (hostPatterns.some(pattern => pattern.test(facts.branch))) {
    const style = policy.branching.hostWorktreeBranch || "push-as-team-name";
    if (style === "rename" && !facts.upstream) { action = "rename"; commands = [["git", "branch", "-m", name]]; }
    else {
      action = style === "keep" ? "keep" : "host-keep";
      remoteBranch = style === "keep" ? facts.branch : name;
      if (style === "rename") warnings.push(warning("HOST_BRANCH_HAS_UPSTREAM", facts.branch, "kept the host branch name because it already tracks a remote"));
    }
  } else if (mode === "head") { action = "create-carry"; commands = [createFrom(null)]; }
  else if (mode === "local-base") { action = "create"; commands = [createFrom(base)]; }
  else if (mode === "new") {
    action = dirty.length ? "create-carry" : "create";
    commands = [createFrom(dirty.length ? null : baseRef)];
    if (dirty.length) warnings.push(warning("BASE_NOT_REFRESHED_DIRTY", name, "the branch starts at the current HEAD because the tree was dirty"));
  } else if (currentType) {
    action = "ask";
    card = branchCard({
      risk: "R1", question: `อยู่บน ${facts.branch} ซึ่งเป็น branch ของงานอื่น จะทำงานนี้ที่ไหน`,
      impact: "แยกงานคนละ branch ทำให้ review และ merge แยกกันได้",
      checked: [`current branch ${facts.branch}`, `policy prefix ${workType.prefix}`],
      options: [
        { id: "1", label: `แตก ${name} ใหม่จาก ${base}`, effect: "งานนี้อยู่ branch ของตัวเอง", value: "new" },
        { id: "2", label: `ทำต่อบน ${facts.branch}`, effect: "งานนี้รวมอยู่กับงานเดิมใน branch เดียวกัน", value: "current" },
      ],
      reason: "หนึ่งงานต่อหนึ่ง work branch",
    });
  } else if (isProtected(policy, facts.branch) || facts.branch === base) {
    if (facts.branch !== base && dirty.length) {
      action = "ask";
      card = branchCard({
        question: `อยู่บน ${facts.branch} (ไม่ใช่ base ${base}) และมีไฟล์ค้าง`,
        impact: "branch ใหม่จะเริ่มจาก HEAD นี้ ไม่ใช่ base ตาม policy",
        checked: [`current ${facts.branch}`, `${dirty.length} dirty paths`],
        options: [
          { id: "1", label: "สร้างจาก HEAD ปัจจุบัน พางานไปด้วย", effect: `${name} เริ่มจาก ${facts.branch} (base ไม่ตรง policy)`, value: "head" },
          { id: "2", label: "หยุดให้ผู้ใช้จัดการก่อน", effect: "ไม่สร้าง branch จนกว่าผู้ใช้จัดการไฟล์ค้าง", value: "stop" },
        ],
        reason: "ไม่ต้อง stash หรือ reset งานของผู้ใช้",
      });
    } else if (dirty.length) {
      action = "create-carry";
      commands = [createFrom(null)];
      warnings.push(warning("BASE_NOT_REFRESHED_DIRTY", name, "the branch starts at the current HEAD because the tree was dirty"));
    } else {
      const counts = facts.branch === base && baseRef !== base ? out(git(run, root, ["rev-list", "--left-right", "--count", `${base}...${baseRef}`])).split(/\s+/).map(Number) : [0, 0];
      if (counts[0] > 0) {
        action = "ask";
        card = branchCard({
          question: `local ${base} มี ${counts[0]} commit ที่ยังไม่อยู่บน ${baseRef}`,
          impact: "เลือกว่างานใหม่จะรวม commit ค้างของ local base หรือไม่",
          checked: [`${base} ahead ${counts[0]}, behind ${counts[1]}`],
          options: [
            { id: "1", label: `แตกจาก ${baseRef}`, effect: `ไม่รวม ${counts[0]} local commits`, value: "new" },
            { id: "2", label: `แตกจาก local ${base}`, effect: `รวม ${counts[0]} local commits เข้างานนี้`, value: "local-base" },
          ],
          reason: "base ของทีมคือ remote",
        });
      } else { action = "create"; commands = [createFrom(baseRef)]; }
    }
  } else {
    action = "ask";
    card = branchCard({
      question: `อยู่บน ${facts.branch} ซึ่งไม่ใช่ work branch หรือ base`,
      impact: "กำหนดว่างานนี้เป็นส่วนของ branch ปัจจุบันหรือแยกออกมา",
      checked: [`current ${facts.branch}`, `policy base ${base}`],
      options: [
        { id: "1", label: `แตก ${name} จาก ${base}`, effect: "งานนี้แยกเป็น work branch ตาม policy", value: "new" },
        { id: "2", label: `ทำบน ${facts.branch} ต่อ`, effect: "งานนี้เป็นส่วนของ branch ปัจจุบัน", value: "current" },
      ],
      reason: "policy กำหนด work branch ต่อหนึ่งงาน",
    });
  }
  if (action === "reuse") { remoteBranch = active?.remoteBranch || facts.branch; name = facts.branch; }
  const hashFacts = { branch: facts.branch, head: facts.head, baseRef, baseSha, dirty: facts.dirty.map(entry => [entry.path, entry.status]) };
  const plan = {
    ok: true, action, branch: action === "keep" ? facts.branch : name, remoteBranch, base, baseRef, baseSha, workType: type,
    facts: { current: facts.branch, dirty: dirty.length, remote: facts.hasRemote, upstream: facts.upstream },
    commands, warnings, card,
  };
  plan.planHash = card ? null : planHashOf({ facts: hashFacts, action, commands });
  plan.next = card ? { action: "ask" } : { action: "run", command: `branch apply --plan-hash ${plan.planHash}` };
  return plan;
}

function runCommands(run, root, commands) {
  for (const [index, command] of commands.entries()) {
    const [program, ...args] = command;
    const result = run(program, args, { cwd: root });
    if (!result.ok) return { ok: false, failedStep: index, command: command.join(" "), stderr: trimStderr(result.stderr) };
  }
  return { ok: true };
}

export async function applyBranch(options) {
  const plan = await planBranch({ ...options, fetch: false });
  if (!plan.ok) return plan;
  if (plan.card) return { ...plan, ok: false, code: "CARD_PENDING", message: "Answer the card, then plan again with --mode." };
  if (plan.planHash !== options.planHash) return stop("PLAN_STALE", "Repository state changed since the plan; run branch plan again.", { next: { action: "run", command: "branch plan" } });
  const result = runCommands(options.run || defaultRun, options.root, plan.commands);
  if (!result.ok) return stop("BRANCH_APPLY_FAILED", `Command failed: ${result.command}`, result);
  return { ok: true, action: plan.action, branch: plan.branch, record: { branch: plan.branch, remoteBranch: plan.remoteBranch, base: plan.base, baseSha: plan.baseSha, workType: plan.workType, branchAction: plan.action }, warnings: plan.warnings, next: { action: "none" }, card: null };
}

// ---------------------------------------------------------------- delivery

async function isText(file) {
  let handle;
  try {
    handle = await open(file, "r");
    const buffer = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(buffer, 0, 8192, 0);
    return !buffer.subarray(0, bytesRead).includes(0);
  } catch { return false; } finally { await handle?.close(); }
}

// Added lines with their new-file line numbers (whole file when untracked).
async function addedLines(root, entry, run) {
  const file = path.join(root, entry.path);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile() || info.size > 1024 * 1024 || !(await isText(file))) return [];
  if (entry.status === "??" || entry.status === "A") {
    return (await readFile(file, "utf8")).split(/\r?\n/).map((text, index) => ({ line: index + 1, text }));
  }
  const diff = git(run, root, ["diff", "HEAD", "--no-color", "-U0", "--", entry.path]);
  const result = [];
  let line = 0;
  for (const text of diff.stdout.split(/\r?\n/)) {
    const hunk = text.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { line = Number(hunk[1]); continue; }
    if (text.startsWith("+") && !text.startsWith("+++")) { result.push({ line, text: text.slice(1) }); line += 1; }
  }
  return result;
}

function auditPathAllowed(relative) {
  const inside = relative.slice(".agrimap-agent/".length);
  if (inside === ".gitignore") return true;
  if (inside.startsWith("memory/current/")) return false;
  return AUDIT_DIRECTORIES.has(inside.split("/")[0]);
}

export async function classifyPaths(root, { preexisting = [], includeAudit = true, run = defaultRun } = {}) {
  const pre = new Map(preexisting.map(entry => [entry.path, entry]));
  const groups = { own: [], foreign: [], mixed: [], excluded: [] };
  const warnings = [];
  const inventory = dirtyInventory(root, { run });
  for (const entry of inventory) {
    const relative = entry.path;
    if (relative.startsWith(".agrimap-agent/local/")) { groups.excluded.push({ ...entry, reason: "local-memory" }); continue; }
    if (pre.has(relative) && !isCarriedAudit(relative)) {
      const hash = await hashPath(root, relative, run);
      (hash === pre.get(relative).hash ? groups.foreign : groups.mixed).push(entry);
      continue;
    }
    if (relative.startsWith(".agrimap-agent/")) {
      if (includeAudit && auditPathAllowed(relative)) groups.own.push(entry);
      else groups.excluded.push({ ...entry, reason: "runtime-or-private-state" });
      continue;
    }
    groups.own.push(entry);
  }
  if (groups.own.length) {
    const ignored = git(run, root, ["check-ignore", "--no-index", "--stdin"], { input: `${groups.own.map(entry => entry.path).join("\n")}\n` });
    const ignoredSet = new Set(lines(ignored.stdout).map(toSlash));
    groups.excluded.push(...groups.own.filter(entry => ignoredSet.has(entry.path)).map(entry => ({ ...entry, reason: "ignored" })));
    groups.own = groups.own.filter(entry => !ignoredSet.has(entry.path));
  }
  if (lines(git(run, root, ["ls-files", "--", ".agrimap-agent/local"]).stdout).length) {
    warnings.push(warning("LOCAL_MEMORY_TRACKED", ".agrimap-agent/local", "ask the requester before `git rm --cached -r .agrimap-agent/local`"));
  }
  // Raw prompt history is local only since 5.0.1 (owner decision 2026-10-14); the
  // next release's final audit commit untracks it and keeps the files on disk.
  if (lines(git(run, root, ["ls-files", "--", ".agrimap-agent/prompts"]).stdout).length) {
    warnings.push(warning("PROMPT_HISTORY_TRACKED", ".agrimap-agent/prompts", "untrack once with `git rm --cached -r -- .agrimap-agent/prompts` in an `audit:` commit; files stay local"));
  }
  return { groups, warnings, inventory };
}

function lines(value) {
  return String(value || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function commitMessage({ input, workType, objective, own, executionId, verificationTrailer, bodyFallback = [], convention = "agrimap" }) {
  let subject = String(input?.subject || objective || "").trim();
  let type = input?.type ? String(input.type).trim() : null;
  // A subject that already carries a prefix ("feat(x): ...") supplies the type once.
  const embedded = subject.match(PREFIXED);
  if (embedded && TEAM_TYPE_OF[embedded[1].toLowerCase()] && embedded[2].trim()) { type ||= embedded[1]; subject = embedded[2].trim(); }
  type ||= TYPE_BY_WORK[workType] || "ci";
  let scope = input?.scope;
  // The team style carries no scope; only a "conventional" policy derives one.
  if (convention !== "conventional") { type = TEAM_TYPE_OF[type.toLowerCase()] || type; scope = null; }
  else if (scope === undefined && !TEAM_HEADER.test(`${type}: x`)) {
    const counts = {};
    for (const entry of own) {
      const top = entry.path.includes("/") ? entry.path.split("/")[0] : null;
      if (top && top !== ".agrimap-agent") counts[top] = (counts[top] || 0) + 1;
    }
    scope = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]?.toLowerCase().replace(/[^a-z0-9._/-]+/g, "-") || null;
  }
  const header = `${type}${scope ? `(${scope})` : ""}: ${subject}`;
  const body = (Array.isArray(input?.body) && input.body.length ? input.body : bodyFallback).slice(0, 5).map(item => `- ${String(item).replace(/^-\s*/, "")}`);
  const trailers = [`AGM-Execution: ${executionId}`, ...(verificationTrailer ? [`AGM-Verification: ${verificationTrailer}`] : [])];
  return { header, subject, text: [header, "", ...(body.length ? [...body, ""] : []), ...trailers, ""].join("\n"), trailers };
}

function findChangelog(entries, target) {
  return entries.find(name => name.toLowerCase() === String(target || "changelog.md").toLowerCase()) || null;
}

export async function planDelivery({
  root, policy, active, ackRequired = [], explicit = null, input = null, changelogNa = null, mixed = null,
  allowSecretPaths = [], excludePaths = [], localPaths = [], bodyFallback = [], governance = {}, run = defaultRun, pushOnly = false, spec = null,
}) {
  if (!active) return stop("NO_ACTIVE_EXECUTION", "Start the execution first (start --objective <same objective>).", { next: { action: "run", command: "start" } });
  if (ackRequired.length) return stop("INSTRUCTIONS_NOT_ACKNOWLEDGED", "Read and ack the AGENTS chain first.", { next: { action: "read-and-ack", files: ackRequired, command: "context --ack <sha12,...>" } });
  const facts = await gitFacts(root, { run, fetch: false });
  const warnings = [...facts.warnings.filter(item => item.code !== "OFFLINE_FETCH_FAILED")];
  const branch = facts.branch;
  if (active.branch && branch !== active.branch) return stop("BRANCH_MISMATCH", `Current branch ${branch || "(detached)"} differs from the execution branch ${active.branch}; switch back or plan again.`, { next: { action: "run", command: `git switch ${active.branch}` } });
  if (!branch) return stop("DETACHED_HEAD", "HEAD is detached.");
  if (isProtected(policy, branch)) return stop("PROTECTED_BRANCH", `${branch} is protected; deliver only on a work branch.`, { next: { action: "run", command: "branch plan --mode head" } });
  if (facts.operationInProgress) return stop("OPERATION_IN_PROGRESS", `A ${facts.operationInProgress} is in progress.`);
  const explicitSet = new Set(String(explicit || "").split(",").map(item => item.trim()).filter(Boolean));
  const autoAuthorized = policy?.status === "confirmed" && policy.delivery?.commitOnComplete === true && governance.delivery !== false;
  const commitAuthorized = autoAuthorized || explicitSet.has("commit") || explicitSet.has("push");
  const pushAuthorized = (autoAuthorized && policy.delivery?.pushOnComplete === true) || explicitSet.has("push");
  const { groups, warnings: classifyWarnings } = await classifyPaths(root, { preexisting: active.preexistingDirty || [], includeAudit: policy?.delivery?.includeAuditArtifacts !== false, run });
  warnings.push(...classifyWarnings);
  const excluded = new Set(excludePaths.map(toSlash));
  groups.excluded.push(...groups.own.filter(entry => excluded.has(entry.path)).map(entry => ({ ...entry, reason: "excluded-by-request" })));
  groups.own = groups.own.filter(entry => !excluded.has(entry.path));
  if (groups.mixed.length && mixed === "include") groups.own.push(...groups.mixed.splice(0));
  else if (groups.mixed.length && mixed === "exclude") groups.foreign.push(...groups.mixed.splice(0));
  const paths = Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, value.map(entry => entry.path)]));
  const counts = Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, value.length]));
  if (!commitAuthorized) {
    return { ok: true, authorized: false, reason: policy ? "the workflow policy does not enable delivery" : "no confirmed workflow policy", paths, counts, warnings, next: { action: "report", command: "report exact own paths as local deliverables" }, card: null, planHash: null };
  }
  if (groups.mixed.length) {
    return {
      ok: true, authorized: true, paths, counts, warnings, planHash: null, next: { action: "ask" },
      card: {
        kind: "scope", topic: "git/delivery-mixed", risk: "R2", confidence: "medium",
        question: `${groups.mixed.length} ไฟล์ค้างก่อนเริ่มงานและงานนี้แก้ต่อ จะรวมใน commit ไหม`,
        impact: "ไฟล์เหล่านี้มีทั้งงานนี้และงานที่ค้างก่อนเริ่มปนกัน",
        checked: paths.mixed.slice(0, 5),
        options: [
          { id: "1", label: "รวม", effect: "commit ไฟล์ทั้งไฟล์รวมส่วนที่ค้างก่อนเริ่ม", value: "include" },
          { id: "2", label: "ไม่รวม", effect: "ไฟล์เหล่านี้อยู่ใน working tree ต่อ ไม่ถูก commit", value: "exclude" },
        ],
        recommended: "1", recommendedReason: "งานนี้แก้ไฟล์นี้จริง", blocking: true, default: null, recordAs: "none", paths: paths.mixed, expiresHours: 24,
      },
    };
  }
  const findings = [];
  const leaks = [];
  const allowed = new Set(allowSecretPaths.map(toSlash));
  for (const entry of groups.own) {
    const added = await addedLines(root, entry, run);
    if (!added.length) continue;
    if (!allowed.has(entry.path)) {
      const text = added.map(item => item.text).join("\n");
      for (const finding of detectSensitive(text).filter(item => SECRET_KINDS.has(item.kind))) findings.push({ path: entry.path, line: added[finding.line - 1]?.line ?? finding.line, kind: finding.kind });
    }
    for (const item of added) {
      const lower = item.text.toLowerCase();
      if (localPaths.some(value => lower.includes(value))) leaks.push({ path: entry.path, line: item.line });
    }
  }
  if (findings.length) {
    const suspect = [...new Set(findings.map(item => item.path))];
    return stop("SECRET_SUSPECTED", "Possible secrets in files to commit; values are not shown.", {
      findings: findings.map(item => ({ path: item.path, line: item.line, kind: item.kind })), paths, counts, next: { action: "ask" },
      card: {
        kind: "scope", topic: "git/delivery-secret", risk: "R3", confidence: "medium",
        question: `พบสิ่งที่อาจเป็นข้อมูลลับใน ${suspect.length} ไฟล์ จะทำอย่างไร`,
        impact: "push แล้วข้อมูลลับจะอยู่ใน history ของ remote และย้อนไม่ได้",
        checked: findings.slice(0, 5).map(item => `${item.path}:${item.line} (${item.kind})`),
        options: [
          { id: "1", label: "ไม่รวมไฟล์นี้", effect: `deliver plan --exclude-paths ${suspect.join(",")}`, value: "exclude" },
          { id: "2", label: "เป็น false positive รวมได้", effect: `deliver plan --allow-secret-paths ${suspect.join(",")}`, value: "allow" },
        ],
        recommended: "1", recommendedReason: "ปลอดภัยกว่าจนกว่าผู้ใช้ยืนยัน", blocking: true, default: null, recordAs: "none", paths: suspect, expiresHours: 24,
      },
    });
  }
  if (leaks.length) return stop("LOCAL_PATH_LEAK", "Committed files would contain a machine-local path from local memory; refer to the spec source id instead.", { leaks, next: { action: "run", command: "replace the absolute path with the spec source id, then deliver plan" } });
  const changelogMode = policy?.delivery?.changelog?.mode || "required-if-exists";
  if (changelogMode !== "none" && !changelogNa) {
    const entries = await readdir(root).catch(() => []);
    const file = findChangelog(entries, policy?.delivery?.changelog?.path);
    const touched = file && groups.own.some(entry => entry.path.toLowerCase() === file.toLowerCase());
    if ((changelogMode === "required" && !touched) || (changelogMode === "required-if-exists" && file && !touched)) {
      return stop("CHANGELOG_REQUIRED", `${file || policy.delivery.changelog.path} needs an entry for this change.`, { next: { action: "run", command: "add the changelog entry per project AGENTS §5, then deliver plan (or --changelog-na \"<reason>\")" } });
    }
  }
  // Precondition 7 (spec §8.2/§19.9): spec sync is a self-fix first; when it
  // could not be done the work still delivers with the warning, unless the
  // team opted into enforcement "block".
  if (spec?.required && !spec.synced && !spec.specNa) {
    const next = { action: "run", command: "spec sync plan --session <id> [--tasks <ids>] [--evidence ID=<path>], then spec sync apply and deliver plan (or --spec-na \"<reason>\")" };
    if (spec.enforcement === "block") return stop("SPEC_SYNC_REQUIRED", "The project enforces spec sync before delivery.", { severity: "stop", next });
    if (!spec.attempted) return stop("SPEC_NOT_SYNCED", "Sync the spec for this work, then plan delivery again.", { severity: "self-fix", next });
    warnings.push(warning("SPEC_NOT_SYNCED", (spec.items || []).join(", ") || "spec", "spec sync plan, fix the reported warning, spec sync apply; the spec was not updated by this delivery"));
  }
  for (const item of spec?.warnings || []) if (!warnings.some(existing => existing.code === item.code && existing.subject === item.subject)) warnings.push(item);
  const verification = active.verificationStatus;
  const verified = ["passed", "not-applicable"].includes(verification);
  if (!verified) warnings.push(warning("DELIVERED_UNVERIFIED", active.executionId, "run the tests, fix them, deliver again; merge is not offered until verification passes"));
  const convention = policy?.delivery?.commitConvention || "agrimap";
  const message = commitMessage({ input, workType: active.workType || workTypeOf(policy, branch), objective: active.objective, own: groups.own, executionId: active.executionId, verificationTrailer: verified ? null : verification === "failed" ? "failed" : "not-run", bodyFallback, convention });
  const language = policy?.delivery?.commitLanguage || "th";
  const headerCheck = checkCommitHeader(message.header, convention, language);
  if (!pushOnly && groups.own.length && !headerCheck.ok) {
    const thai = headerCheck.reason !== "type" ? " with a Thai description (English only for technical names)" : "";
    return stop("MESSAGE_INVALID", `Header must be "<feature|fix|comment|ci|bump|audit>: <plain description>"${thai}, at most ${TEAM_HEADER_MAX} characters: ${message.header}`, { next: { action: "run", command: "deliver plan --input message.json with {\"subject\":\"<คำอธิบายภาษาไทย>\"}" } });
  }
  const head = facts.head;
  const headMessage = head ? out(git(run, root, ["log", "-1", "--format=%B", head])) : "";
  const alreadyCommitted = headMessage.includes(`AGM-Execution: ${active.executionId}`);
  if (!groups.own.length && !alreadyCommitted && !pushOnly) return stop("NOTHING_TO_DELIVER", "No own changes to commit for this execution.", { paths, counts, warnings });
  const remoteBranch = active.remoteBranch || branch;
  const push = pushAuthorized && facts.hasRemote ? { enabled: true, refspec: `HEAD:refs/heads/${remoteBranch}` } : { enabled: false, reason: facts.hasRemote ? "push not enabled" : "no origin remote" };
  const staged = lines(git(run, root, ["diff", "--cached", "--name-only"]).stdout).map(toSlash);
  const ownSet = new Set(groups.own.map(entry => entry.path));
  const onlyOwn = staged.some(item => !ownSet.has(item));
  // After delivery only its own audit log changed: that rides with the next commit.
  const auditOnly = groups.own.every(entry => entry.path.startsWith(".agrimap-agent/"));
  const commit = groups.own.length && !pushOnly && !(alreadyCommitted && auditOnly);
  const addCommands = [];
  for (let index = 0; commit && index < groups.own.length; index += 100) addCommands.push(["git", "add", "--", ...groups.own.slice(index, index + 100).map(entry => entry.path)]);
  const messageFile = toSlash(path.join(".agrimap-agent", "runtime", "tmp", `commit-${active.executionId}.txt`));
  const commands = [
    ...addCommands,
    ...(commit ? [["git", "diff", "--cached", "--check"], ["git", "commit", "-F", messageFile, ...(onlyOwn ? ["--only", "--", ...groups.own.map(entry => entry.path)] : [])]] : []),
    ...(push.enabled ? [["git", "push", "-u", "origin", push.refspec], ["git", "ls-remote", "--heads", "origin", remoteBranch]] : []),
  ];
  const ownHashes = [];
  for (const entry of groups.own) ownHashes.push([entry.path, await hashPath(root, entry.path, run)]);
  const plan = {
    ok: true, authorized: true, branch, remoteBranch, counts, paths,
    message: { header: message.header, trailers: message.trailers, text: message.text },
    commit: Boolean(commit), alreadyCommitted, push, commands, warnings, card: null,
    verification: verified ? verification : verification || "not-run", specLine: spec?.line || null,
  };
  plan.planHash = planHashOf({ branch, head, own: ownHashes, message: message.text, push, commands });
  plan.next = { action: "run", command: `deliver apply --plan-hash ${plan.planHash}` };
  return plan;
}

function classifyPushFailure(stderr) {
  if (/\[rejected\]|non-fast-forward|fetch first/i.test(stderr)) return { code: "REMOTE_AHEAD", next: { action: "run", command: "integrate plan --intent update-branch, then deliver apply --push-only" } };
  if (/Authentication failed|Permission denied|403|could not read Username/i.test(stderr)) return { code: "PUSH_AUTH", next: { action: "report", command: "the requester fixes Git credentials; the agent never touches them" } };
  if (/Could not resolve host|timed out|Connection|unable to access/i.test(stderr)) return { code: "PUSH_NETWORK", next: { action: "run", command: "deliver apply --push-only when the network is back" } };
  return { code: "PUSH_FAILED", next: { action: "report" } };
}

export async function applyDelivery(options) {
  const run = options.run || defaultRun;
  const { root, active } = options;
  const plan = await planDelivery({ ...options, pushOnly: Boolean(options.pushOnly) });
  if (!plan.ok) return plan;
  if (!plan.authorized) return stop("DELIVERY_NOT_AUTHORIZED", "Delivery is not enabled by a confirmed policy or an explicit instruction; report local paths.", { paths: plan.paths });
  if (plan.card) return { ...plan, ok: false, code: "CARD_PENDING", message: "Answer the card, then plan again." };
  if (!options.pushOnly && plan.planHash !== options.planHash) return stop("PLAN_STALE", "Files changed since the plan; run deliver plan again.", { next: { action: "run", command: "deliver plan" } });
  if (plan.commit) {
    const messageFile = path.join(root, ".agrimap-agent", "runtime", "tmp", `commit-${active.executionId}.txt`);
    await mkdir(path.dirname(messageFile), { recursive: true });
    await writeFile(messageFile, plan.message.text, "utf8");
  }
  const pushIndex = plan.commands.findIndex(command => command[1] === "push");
  const local = runCommands(run, root, pushIndex < 0 ? plan.commands : plan.commands.slice(0, pushIndex));
  if (!local.ok) return stop(local.command.includes("--check") ? "DIFF_CHECK_FAILED" : "COMMIT_FAILED", `Command failed: ${local.command}`, local);
  const commit = out(git(run, root, ["rev-parse", "HEAD"]));
  let remoteSha = null;
  let pushed = false;
  if (plan.push.enabled) {
    const remoteNow = out(git(run, root, ["ls-remote", "--heads", "origin", plan.remoteBranch])).split(/\s+/)[0] || null;
    if (remoteNow !== commit) {
      const result = git(run, root, ["push", "-u", "origin", plan.push.refspec]);
      if (!result.ok) {
        const failure = classifyPushFailure(result.stderr);
        return { ...stop(failure.code, `Push failed (${failure.code}); the commit ${commit.slice(0, 7)} is kept locally.`, { next: failure.next, stderr: trimStderr(result.stderr) }), commit, severity: failure.code === "PUSH_NETWORK" ? "warn" : "stop" };
      }
      pushed = true;
    }
    remoteSha = out(git(run, root, ["ls-remote", "--heads", "origin", plan.remoteBranch])).split(/\s+/)[0] || null;
    if (remoteSha !== commit) return { ...stop("REMOTE_MISMATCH", `Remote ${plan.remoteBranch} is ${remoteSha || "missing"}, local HEAD is ${commit}.`), commit };
  }
  return {
    ok: true, branch: plan.branch, remoteBranch: plan.remoteBranch, commit, remoteSha, pushed,
    remoteVerified: plan.push.enabled ? remoteSha === commit : false,
    committed: plan.commit, files: plan.paths.own, excluded: plan.paths.excluded, foreign: plan.paths.foreign,
    header: plan.message.header, verification: plan.verification, warnings: plan.warnings, specLine: plan.specLine,
    next: { action: "run", command: "integrate options" }, card: null,
  };
}

// -------------------------------------------------------------- integration

export function forgeOf(remoteUrl) {
  const value = String(remoteUrl || "").trim();
  let host = null;
  let repoPath = null;
  const scp = value.match(/^(?:[^@/\s]+@)?([^:/\s]+):(?!\/)(.+)$/);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    try { const url = new URL(value); host = url.hostname; repoPath = url.pathname.replace(/^\/+/, ""); } catch { /* not a URL */ }
  } else if (scp && !/^[a-z]:[\\/]/i.test(value)) { host = scp[1]; repoPath = scp[2]; }
  if (!host || !repoPath || /^file$/i.test(host)) return { forge: "none", host: null, path: null, webUrl: null };
  repoPath = repoPath.replace(/\.git$/i, "").replace(/\/+$/, "");
  const forge = /github\.com$/i.test(host) ? "github" : /gitlab/i.test(host) ? "gitlab" : "none";
  return { forge, host, path: repoPath, webUrl: `https://${host}/${repoPath}` };
}

export function compareUrl(forge, remote, source, target) {
  const info = typeof remote === "string" ? forgeOf(remote) : remote;
  if (!info?.webUrl) return null;
  const kind = forge === "auto" || !forge ? info.forge : forge;
  const ref = value => String(value).split("/").map(encodeURIComponent).join("/");
  if (kind === "github") return `${info.webUrl}/compare/${ref(target)}...${ref(source)}?expand=1`;
  if (kind === "gitlab") return `${info.webUrl}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${encodeURIComponent(source)}&merge_request%5Btarget_branch%5D=${encodeURIComponent(target)}`;
  return null;
}

function parseJson(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

function forgeContext(root, policy, run) {
  const remote = git(run, root, ["remote", "get-url", "origin"]);
  const info = forgeOf(remote.ok ? remote.stdout.trim() : "");
  const configured = policy?.integration?.forge || "auto";
  const forge = configured === "auto" ? info.forge : configured;
  const cli = forge === "github" ? "gh" : forge === "gitlab" ? "glab" : null;
  const ready = Boolean(cli) && run(cli, ["auth", "status"], { cwd: root }).ok;
  return { ...info, forge, cli, ready };
}

function findOpenPr(root, context, source, target, run) {
  if (!context.ready) return null;
  if (context.forge === "github") {
    const list = run("gh", ["pr", "list", "--head", source, "--base", target, "--state", "open", "--json", "number,url"], { cwd: root });
    const first = parseJson(list.stdout, [])[0];
    return first ? { number: first.number, url: first.url } : null;
  }
  const list = run("glab", ["mr", "list", "--source-branch", source, "--target-branch", target, "-F", "json"], { cwd: root });
  const first = parseJson(list.stdout, [])[0];
  return first ? { number: first.iid, url: first.web_url } : null;
}

function viewPr(root, context, number, run) {
  if (context.forge === "github") {
    const view = run("gh", ["pr", "view", String(number), "--json", "mergeStateStatus,reviewDecision,statusCheckRollup,url"], { cwd: root });
    return parseJson(view.stdout, null);
  }
  const view = parseJson(run("glab", ["mr", "view", String(number), "-F", "json"], { cwd: root }).stdout, null);
  if (!view) return null;
  const status = String(view.detailed_merge_status || view.merge_status || "").toLowerCase();
  const pipeline = String(view.head_pipeline?.status || view.pipeline?.status || "").toLowerCase();
  return {
    url: view.web_url,
    mergeStateStatus: ["mergeable", "can_be_merged"].includes(status) ? "CLEAN" : /pipeline|ci_/.test(status) ? "UNSTABLE" : "BLOCKED",
    reviewDecision: status === "not_approved" ? "REVIEW_REQUIRED" : null,
    statusCheckRollup: pipeline ? [{ status: ["running", "pending", "created"].includes(pipeline) ? "IN_PROGRESS" : "COMPLETED", conclusion: pipeline === "success" ? "SUCCESS" : ["failed", "canceled"].includes(pipeline) ? "FAILURE" : null }] : [],
  };
}

export function prDecision(view, { whenGreen = false } = {}) {
  if (!view) return { decision: "unknown" };
  const checks = Array.isArray(view.statusCheckRollup) ? view.statusCheckRollup : [];
  const failing = checks.some(check => ["FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "ERROR"].includes(String(check.conclusion || check.state || "").toUpperCase()));
  const pending = checks.some(check => (check.status && String(check.status).toUpperCase() !== "COMPLETED") || ["PENDING", "EXPECTED"].includes(String(check.state || "").toUpperCase()));
  if (["REVIEW_REQUIRED", "CHANGES_REQUESTED"].includes(view.reviewDecision)) return { decision: "blocked", waiting: `review ${String(view.reviewDecision).toLowerCase()}` };
  if (failing) return { decision: "checks-failing" };
  if (pending) return { decision: whenGreen ? "auto-merge" : "pending" };
  if (["CLEAN", "HAS_HOOKS", "UNSTABLE"].includes(view.mergeStateStatus)) return { decision: "merge" };
  return { decision: "blocked", waiting: String(view.mergeStateStatus || "unknown").toLowerCase() };
}

function mergeFlags(context, policy, { auto = false } = {}) {
  const strategy = policy?.integration?.mergeStrategy || "merge-commit";
  const warnings = [];
  if (context.forge === "github") {
    const flags = [strategy === "squash" ? "--squash" : "--merge"];
    if (strategy === "ff-only") warnings.push(warning("FF_ONLY_AS_MERGE", "pull-request", "ff-only maps to --merge in PR mode; rebase is never used"));
    if (policy?.integration?.deleteBranchAfterMerge === "always") flags.push("--delete-branch");
    if (auto) flags.push("--auto");
    return { flags, warnings };
  }
  // glab 1.115 flags (verified with --help): --auto-merge defaults to true, so a
  // plain merge passes --auto-merge=false explicitly.
  const flags = ["--yes", ...(strategy === "squash" ? ["--squash"] : []), ...(policy?.integration?.deleteBranchAfterMerge === "always" ? ["--remove-source-branch"] : []), auto ? "--auto-merge" : "--auto-merge=false"];
  return { flags, warnings };
}

function integrationTargets(policy, workType) {
  const type = policy?.branching?.workTypes?.[workType] || {};
  return [...new Set([policy?.branching?.integrationBranch, policy?.branching?.stableBranch, type.target, ...(type.backMerge || [])].filter(Boolean))];
}

export async function integrationOptions({ root, policy, delivery, run = defaultRun }) {
  if (!delivery?.branch) return stop("DELIVERY_REQUIRED", "No delivered work branch in this session; deliver first.", { next: { action: "run", command: "deliver plan" } });
  const workType = delivery.workType || workTypeOf(policy, delivery.branch) || "feature";
  const typePolicy = policy?.branching?.workTypes?.[workType] || {};
  const target = typePolicy.target || policy?.branching?.integrationBranch || "develop";
  const method = policy?.integration?.method || "local-merge";
  const context = forgeContext(root, policy, run);
  const unverified = (delivery.warnings || []).some(item => (item.code || item) === "DELIVERED_UNVERIFIED");
  const pr = method === "pull-request" || unverified ? findOpenPr(root, context, delivery.remoteBranch || delivery.branch, target, run) : null;
  const backMerge = typePolicy.backMerge?.length ? ` แล้ว back-merge ${typePolicy.backMerge.join(", ")}` : "";
  let options;
  if (unverified) {
    options = [
      { id: "1", label: "แก้ต่อให้ test ผ่าน", effect: "ทำงานต่อบน work branch แล้ว deliver ใหม่", value: "continue" },
      ...(context.forge !== "none" ? [{ id: "2", label: `เปิด PR แบบ draft → ${target}`, effect: "ให้ทีมเห็นงานโดยยังไม่ merge", value: "open-pr-draft" }] : []),
      { id: String(context.forge !== "none" ? 3 : 2), label: "พักไว้", effect: "คง branch และสถานะไว้ให้ resume", value: "park" },
    ];
  } else if (method === "pull-request" && !pr) {
    options = [
      { id: "1", label: `เปิด PR → ${target}`, effect: context.ready ? `${context.cli} สร้าง PR จาก ${delivery.remoteBranch || delivery.branch}` : "ให้ลิงก์เปิด PR เอง (ไม่มี CLI ที่ login)", value: "open-pr" },
      { id: "2", label: "แก้ต่อ", effect: "ทำงานต่อบน work branch", value: "continue" },
      { id: "3", label: "พักไว้", effect: "คง branch ไว้ให้ resume", value: "park" },
    ];
  } else if (method === "pull-request") {
    options = [
      { id: "1", label: `Merge PR #${pr.number} (เมื่อ review ผ่าน)`, effect: `merge เข้า ${target}${backMerge} แล้วตรวจ remote`, value: "integrate" },
      { id: "2", label: `อัปเดต branch จาก ${target}`, effect: `merge ${target} ล่าสุดเข้า work branch แล้ว push`, value: "update-branch" },
      { id: "3", label: "แก้ต่อ", effect: "ทำงานต่อบน work branch", value: "continue" },
    ];
  } else {
    options = [
      { id: "1", label: `Merge เข้า ${target}${backMerge}`.slice(0, 60), effect: "merge หลัง test ในเครื่องผ่าน แล้ว push แบบไม่ force และตรวจ remote", value: "integrate" },
      ...(context.forge !== "none" ? [{ id: "2", label: "เปิด PR/MR แทน (ถ้าต้องการ review)", effect: `เปิด PR/MR → ${target} ให้ทีม review`, value: "open-pr" }] : []),
      { id: String(context.forge !== "none" ? 3 : 2), label: "แก้ต่อ", effect: "ทำงานต่อบน work branch", value: "continue" },
      { id: String(context.forge !== "none" ? 4 : 3), label: "พักไว้", effect: "คง branch ไว้ให้ resume", value: "park" },
    ];
  }
  return {
    ok: true, target, method, pr, forge: context.forge, unverified, warnings: [],
    card: {
      kind: "integration", topic: "git/integration", risk: "R3", confidence: "high",
      question: "ถัดไปทำอะไรกับ work branch นี้",
      impact: `${delivery.branch} ถูก commit${delivery.remoteVerified ? " และ push" : ""} แล้ว${unverified ? " แต่ verification ยังไม่ผ่าน" : ""}`,
      checked: [`policy ${method} → ${target}`, pr ? `PR #${pr.number} เปิดอยู่` : `forge ${context.forge}${context.ready ? " (CLI พร้อม)" : ""}`],
      options, recommended: "1", recommendedReason: unverified ? "ยังไม่ควร merge จนกว่า test ผ่าน" : "ตาม workflow policy ของทีม",
      blocking: true, default: null, recordAs: "none", paths: [], expiresHours: 72,
    },
  };
}

function resolveSource({ branch, active, delivery, current, policy }) {
  return branch || active?.branch || delivery?.branch || (workTypeOf(policy, current) ? current : null);
}

function remoteHead(run, root, branch) {
  return out(git(run, root, ["ls-remote", "--heads", "origin", branch])).split(/\s+/)[0] || null;
}

function ownDirty(root, preexisting, run) {
  const pre = new Set((preexisting || []).map(entry => entry.path));
  return dirtyInventory(root, { run }).filter(entry => !entry.path.startsWith(".agrimap-agent/") && !pre.has(entry.path)).map(entry => entry.path);
}

function stageAMerge(run, root, source, target) {
  const current = out(git(run, root, ["branch", "--show-current"]));
  if (current !== source) {
    const switched = git(run, root, ["switch", source]);
    if (!switched.ok) return stop("BRANCH_MISMATCH", `Could not switch to ${source}.`, { stderr: trimStderr(switched.stderr) });
  }
  if (isAncestor(run, root, `origin/${target}`, source)) return { ok: true, merged: false };
  const merged = git(run, root, ["merge", "--no-edit", `origin/${target}`]);
  if (!merged.ok) {
    const conflicts = lines(git(run, root, ["diff", "--name-only", "--diff-filter=U"]).stdout);
    git(run, root, ["merge", "--abort"]);
    // Refused before merging (e.g. local files would be overwritten): no conflict card.
    if (!conflicts.length) return stop("MERGE_FAILED", `git merge origin/${target} failed without conflicts; nothing was merged into ${target}.`, { stderr: trimStderr(merged.stderr) });
    return stop("MERGE_CONFLICT", `origin/${target} conflicts with ${source}; nothing was merged into ${target}.`, {
      conflicts, next: { action: "ask" },
      card: {
        kind: "integration", topic: "git/merge-conflict", risk: "R2", confidence: "high",
        question: `${target} มีการแก้ชนกับงานนี้ ${conflicts.length} ไฟล์`,
        impact: `ยังไม่ได้ merge อะไรเข้า ${target}`,
        checked: conflicts.slice(0, 5),
        options: [
          { id: "1", label: "แก้ conflict บน work branch แล้ว test ใหม่", effect: `${target} ไม่ถูกแตะจนกว่าผ่าน`, value: "continue" },
          { id: "2", label: "หยุดไว้ให้ดูเอง", effect: "ไม่ทำอะไรเพิ่ม", value: "park" },
        ],
        recommended: "1", recommendedReason: "conflict ต้องแก้บน work branch ก่อนรวม", blocking: true, default: null, recordAs: "none", paths: conflicts, expiresHours: 24,
      },
    });
  }
  return { ok: true, merged: true };
}

function pushBranch(run, root, source, remoteBranch) {
  const local = out(git(run, root, ["rev-parse", source]));
  if (remoteHead(run, root, remoteBranch) === local) return { ok: true, pushed: false };
  const pushed = git(run, root, ["push", "origin", `${source}:refs/heads/${remoteBranch}`]);
  if (!pushed.ok) return { ...stop(classifyPushFailure(pushed.stderr).code, "Pushing the work branch failed.", { stderr: trimStderr(pushed.stderr) }) };
  return { ok: true, pushed: true };
}

async function localMergeToTarget({ run, root, state, source, target, executionId, policy }) {
  if (!isAncestor(run, root, `origin/${target}`, source)) return stop("REMOTE_TARGET_ADVANCED", `origin/${target} is not contained in ${source}; run integrate plan again.`, { next: { action: "run", command: "integrate plan --intent integrate" } });
  const strategy = policy?.integration?.mergeStrategy || "merge-commit";
  const sourceSha = out(git(run, root, ["rev-parse", source]));
  let sha = sourceSha;
  if (strategy !== "ff-only") {
    const messageFile = path.join(state, "runtime", "tmp", `merge-${executionId || "manual"}-${target.replace(/[^a-z0-9._-]+/gi, "-")}.txt`);
    await mkdir(path.dirname(messageFile), { recursive: true });
    await writeFile(messageFile, `Merge branch '${source}' into ${target}\n\n${executionId ? `AGM-Execution: ${executionId}\n` : ""}`, "utf8");
    const signing = out(git(run, root, ["config", "--get", "commit.gpgsign"])) === "true" ? ["-S"] : [];
    const parents = strategy === "squash" ? ["-p", `origin/${target}`] : ["-p", `origin/${target}`, "-p", source];
    const created = git(run, root, ["commit-tree", ...signing, `${source}^{tree}`, ...parents, "-F", messageFile]);
    if (!created.ok) return stop("MERGE_COMMIT_FAILED", "git commit-tree failed.", { stderr: trimStderr(created.stderr) });
    sha = created.stdout.trim();
  }
  const pushed = git(run, root, ["push", "origin", `${sha}:refs/heads/${target}`]);
  if (!pushed.ok) {
    const stderr = pushed.stderr;
    if (/protected branch|GH006|pre-receive hook declined|not allowed to push|denied/i.test(stderr) && !/non-fast-forward|fetch first/i.test(stderr)) return stop("PROTECTED_BY_SERVER", `The server refused the push to ${target}; switch integration.method to pull-request.`, { stderr: trimStderr(stderr) });
    if (/\[rejected\]|non-fast-forward|fetch first/i.test(stderr)) return stop("REMOTE_TARGET_ADVANCED", `${target} moved on the remote; nothing changed locally. Run integrate plan again.`, { next: { action: "run", command: "integrate plan --intent integrate" } });
    return stop(classifyPushFailure(stderr).code, `Push to ${target} failed.`, { stderr: trimStderr(stderr) });
  }
  const remoteSha = remoteHead(run, root, target);
  if (remoteSha !== sha) return stop("REMOTE_MISMATCH", `Remote ${target} is ${remoteSha}, expected ${sha}.`);
  const warnings = [];
  const worktrees = out(git(run, root, ["worktree", "list", "--porcelain"]));
  if (refExists(run, root, `refs/heads/${target}`) && !worktrees.split(/\r?\n/).includes(`branch refs/heads/${target}`)) {
    if (!git(run, root, ["fetch", "origin", `${target}:${target}`]).ok) warnings.push(warning("LOCAL_TARGET_NOT_UPDATED", target, `local ${target} is not a fast-forward of origin; update it yourself`));
  }
  return { ok: true, mergeSha: sha, sourceSha, remoteVerified: true, warnings };
}

async function writePrBody(state, delivery) {
  const file = path.join(state, "runtime", "tmp", `pr-${delivery.executionId || "manual"}.md`);
  const warnings = (delivery.warnings || []).map(item => `- ${item.code}: ${item.subject || ""}${item.fix ? ` — fix: ${item.fix}` : ""}`);
  const body = [
    `## Summary`, "", delivery.objective || delivery.header || "", "",
    `## Files`, "", ...(delivery.files || []).slice(0, 50).map(file => `- \`${file}\``), "",
    `## Verification`, "", `- ${delivery.verification || "not recorded"}`, "",
    ...(warnings.length ? ["## ⚠️ Open warnings", "", ...warnings, ""] : []),
    ...(delivery.executionId ? [`AGM-Execution: ${delivery.executionId}`, ""] : []),
  ].join("\n");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body, "utf8");
  return file;
}

export async function planIntegration(options) {
  const { root, policy, active = null, delivery = null, intent, ackRequired = [], whenGreen = false, confirmUnverified = false, choice = null, run = defaultRun } = options;
  if (!["integrate", "open-pr", "open-pr-draft", "update-branch", "park", "abandon"].includes(intent)) return stop("INTENT_INVALID", "--intent must be integrate|open-pr|update-branch|park|abandon.");
  if (ackRequired.length) return stop("INSTRUCTIONS_NOT_ACKNOWLEDGED", "Read and ack the AGENTS chain first.", { next: { action: "read-and-ack", files: ackRequired } });
  const current = out(git(run, root, ["branch", "--show-current"]));
  const source = resolveSource({ branch: options.branch, active, delivery, current, policy });
  if (!source) return stop("DELIVERY_REQUIRED", "No work branch to integrate; deliver first.", { next: { action: "run", command: "deliver plan" } });
  const workType = delivery?.workType || active?.workType || workTypeOf(policy, source) || "feature";
  const policyTarget = policy?.branching?.workTypes?.[workType]?.target || policy?.branching?.integrationBranch || "develop";
  const target = options.target || policyTarget;
  if (["jenkins", "jenkins-release"].includes(target)) return stop("TARGET_IS_RELEASE_FLOW", `${target} is a release branch; use the project release intents (AGENTS §2).`);
  if (!integrationTargets(policy, workType).includes(target)) return stop("TARGET_NOT_ALLOWED", `${target} is not an integration target in the workflow policy.`);
  const remoteBranch = (delivery?.branch === source && delivery.remoteBranch) || (active?.branch === source && active.remoteBranch) || source;
  const base = { ok: true, intent, source, remoteBranch, target, workType, warnings: [], card: null };
  if (intent === "park") return { ...base, commands: [], planHash: planHashOf({ intent, source }), next: { action: "report" } };
  if (intent === "abandon") {
    if (!choice) {
      return {
        ...base, planHash: null, next: { action: "ask" },
        card: {
          kind: "integration", topic: "git/abandon", risk: "R3", confidence: "high",
          question: `ทิ้ง work branch ${source} ไหม`, impact: "ลบ branch แล้วงานที่ยังไม่ merge จะหาได้ยาก",
          checked: [`remote ${remoteBranch}: ${remoteHead(run, root, remoteBranch) ? "มี" : "ไม่มี"}`],
          options: [
            { id: "1", label: "ลบ local เก็บ remote ไว้", effect: `ลบ ${source} ในเครื่อง, origin/${remoteBranch} ยังอยู่`, value: "local" },
            { id: "2", label: "ลบทั้ง local และ remote", effect: `ลบ ${source} และ origin/${remoteBranch}`, value: "both" },
            { id: "3", label: "ยกเลิก", effect: "ไม่ลบอะไร", value: "cancel" },
          ],
          recommended: "1", recommendedReason: "remote ยังกู้งานได้", blocking: true, default: null, recordAs: "none", paths: [], expiresHours: 24,
        },
      };
    }
    if (choice === "cancel") return { ...base, commands: [], planHash: planHashOf({ intent, source, choice }), next: { action: "report" } };
    const merged = isAncestor(run, root, source, `origin/${policyTarget}`);
    const commands = [
      ...(current === source ? [["git", "switch", policy?.branching?.workTypes?.[workType]?.base || policyTarget]] : []),
      ["git", "branch", merged ? "-d" : "-D", source],
      ...(choice === "both" ? [["git", "push", "origin", "--delete", remoteBranch]] : []),
    ];
    return { ...base, commands, planHash: planHashOf({ intent, source, choice, commands }), next: { action: "run", command: "integrate apply" } };
  }
  if (options.fetch !== false && ["integrate", "update-branch"].includes(intent)) {
    if (!git(run, root, ["fetch", "--prune", "origin"]).ok) base.warnings.push(warning("OFFLINE_FETCH_FAILED", "origin", "integration uses the last fetched refs"));
  }
  const localSha = out(git(run, root, ["rev-parse", source]));
  const remoteSha = remoteHead(run, root, remoteBranch);
  if (!remoteSha || remoteSha !== localSha) return stop("DELIVERY_REQUIRED", `${source} is not pushed with its latest commit; deliver first.`, { next: { action: "run", command: "deliver apply --push-only" } });
  const dirty = ownDirty(root, active?.preexistingDirty || delivery?.preexistingDirty, run);
  if (dirty.length) return stop("DIRTY_TREE", `Uncommitted changes on ${source}; deliver or ask first.`, { paths: dirty });
  const unverified = (delivery?.warnings || []).some(item => (item.code || item) === "DELIVERED_UNVERIFIED");
  if (intent === "integrate" && unverified && !confirmUnverified) {
    return {
      ...base, planHash: null, next: { action: "ask" },
      card: {
        kind: "integration", topic: "git/integrate-unverified", risk: "R3", confidence: "high",
        question: `ยืนยัน merge ${source} ทั้งที่ verification ยังไม่ผ่าน`, impact: `${target} จะได้งานที่ test ยังไม่ผ่าน`,
        checked: [`delivery ${delivery?.commit?.slice(0, 7) || ""} มี AGM-Verification: ${delivery?.verification || "not-run"}`],
        options: [
          { id: "1", label: "ยังไม่ merge แก้ต่อให้ผ่าน", effect: "ทำงานต่อบน work branch", value: "continue" },
          { id: "2", label: "merge ทั้งที่ยังไม่ผ่าน", effect: `integrate plan --confirm-unverified เข้า ${target}`, value: "confirm" },
        ],
        recommended: "1", recommendedReason: "ไม่ควรรวมงานที่ test ไม่ผ่าน", blocking: true, default: null, recordAs: "none", paths: [], expiresHours: 24,
      },
    };
  }
  if (options.target && options.target !== policyTarget && !options.confirmTarget) {
    return {
      ...base, planHash: null, next: { action: "ask" },
      card: {
        kind: "integration", topic: "git/integration-target", risk: "R2", confidence: "high",
        question: `รวม ${source} เข้า ${target} แทน ${policyTarget} ตาม policy ไหม`, impact: "target ต่างจาก workflow ของทีม",
        checked: [`policy ${workType} target = ${policyTarget}`],
        options: [
          { id: "1", label: `รวมเข้า ${policyTarget} ตาม policy`, effect: `integrate plan --target ${policyTarget}`, value: policyTarget },
          { id: "2", label: `รวมเข้า ${target}`, effect: `integrate plan --target ${target} --confirm-target`, value: target },
        ],
        recommended: "1", recommendedReason: "ตาม workflow ของทีม", blocking: true, default: null, recordAs: "none", paths: [], expiresHours: 24,
      },
    };
  }
  const method = intent === "integrate" ? policy?.integration?.method || "local-merge" : intent;
  if (intent === "open-pr" || intent === "open-pr-draft" || method === "pull-request") {
    const context = forgeContext(root, policy, run);
    const pr = findOpenPr(root, context, remoteBranch, target, run);
    if (!context.ready) {
      return { ...base, method: "pull-request", status: "manual-pr", compareUrl: compareUrl(context.forge, context, remoteBranch, target), commands: [], planHash: null, next: { action: "report", command: "give the requester the compare URL" } };
    }
    if (intent !== "integrate") {
      const draft = intent === "open-pr-draft";
      return { ...base, method: "pull-request", forge: context.forge, pr, status: pr ? "exists" : "create", draft, planHash: planHashOf({ intent, source, target, localSha, pr, forge: context.forge }), next: pr ? { action: "report" } : { action: "run", command: "integrate apply" } };
    }
    const view = pr ? viewPr(root, context, pr.number, run) : null;
    const decision = pr ? prDecision(view, { whenGreen }) : { decision: "create-then-check" };
    if (decision.decision === "blocked") return stop("PR_BLOCKED", `PR #${pr.number} is waiting for ${decision.waiting}; reviews are never bypassed.`, { pr: { ...pr, url: view?.url || pr.url } });
    if (decision.decision === "checks-failing") {
      return stop("PR_CHECKS_FAILING", `Checks are failing on PR #${pr.number}.`, {
        pr, next: { action: "ask" },
        card: {
          kind: "integration", topic: "git/pr-checks", risk: "R2", confidence: "high", question: `check ของ PR #${pr.number} ไม่ผ่าน`, impact: "merge ขณะ check ไม่ผ่านต้องได้รับอนุญาตแยก",
          checked: [`PR ${pr.url}`], options: [
            { id: "1", label: "แก้ต่อบน branch", effect: "แก้แล้ว deliver ใหม่", value: "continue" },
            { id: "2", label: "รอแล้วค่อยสั่งใหม่", effect: "ไม่ทำอะไรตอนนี้", value: "park" },
          ], recommended: "1", recommendedReason: "ต้องให้ check ผ่านก่อน", blocking: true, default: null, recordAs: "none", paths: [], expiresHours: 24,
        },
      });
    }
    if (decision.decision === "pending") {
      return {
        ...base, method: "pull-request", pr, planHash: null, next: { action: "ask" },
        card: {
          kind: "integration", topic: "git/pr-pending", risk: "R3", confidence: "high", question: `check ของ PR #${pr.number} ยังรันอยู่`, impact: "merge ได้เมื่อ CI ผ่าน",
          checked: [`PR ${pr.url}`], options: [
            { id: "1", label: "merge เมื่อ CI ผ่าน (auto-merge)", effect: "integrate plan --when-green", value: "when-green" },
            { id: "2", label: "รอแล้วค่อยสั่งใหม่", effect: "ไม่ทำอะไรตอนนี้", value: "park" },
          ], recommended: "1", recommendedReason: "ไม่ต้องรอดูเอง", blocking: true, default: null, recordAs: "none", paths: [], expiresHours: 24,
        },
      };
    }
    const { flags, warnings } = mergeFlags(context, policy, { auto: decision.decision === "auto-merge" });
    return { ...base, method: "pull-request", forge: context.forge, pr, decision: decision.decision, mergeFlags: flags, warnings, planHash: planHashOf({ intent, source, target, localSha, pr, decision, flags }), next: { action: "run", command: "integrate apply" } };
  }
  // local-merge or update-branch
  const needsMerge = !isAncestor(run, root, `origin/${target}`, source);
  const verified = !unverified && ["passed", "not-applicable"].includes(delivery?.verification || active?.verificationStatus);
  const stages = intent === "update-branch" ? ["merge-into-branch", "push-branch"] : [...(needsMerge ? ["merge-into-branch", "push-branch"] : []), "push-target"];
  const verificationRequired = intent === "integrate" && (needsMerge || !verified);
  return {
    ...base, method: intent === "update-branch" ? "update-branch" : "local-merge", needsMerge, stages, verificationRequired,
    backMerge: intent === "integrate" ? policy?.branching?.workTypes?.[workType]?.backMerge || [] : [],
    planHash: planHashOf({ intent, source, target, localSha, targetSha: out(git(run, root, ["rev-parse", `origin/${target}`])), stages }),
    next: { action: "run", command: verificationRequired && needsMerge ? "integrate apply (merges target into the branch, then asks for verification)" : "integrate apply" },
  };
}

export async function applyIntegration(options) {
  const run = options.run || defaultRun;
  const { root, state, policy } = options;
  const stage = options.stage || null;
  const plan = await planIntegration({ ...options, fetch: false });
  if (!plan.ok) return plan;
  if (plan.card) return { ...plan, ok: false, code: "CARD_PENDING", message: "Answer the card first." };
  if (plan.status === "manual-pr") return { ...plan, ok: true };
  if (stage !== "push" && plan.planHash !== options.planHash) return stop("PLAN_STALE", "State changed since the plan; run integrate plan again.", { next: { action: "run", command: "integrate plan" } });
  const executionId = options.delivery?.executionId || options.active?.executionId || null;
  if (plan.intent === "park") return { ok: true, intent: "park", source: plan.source, warnings: [] };
  if (plan.intent === "abandon") {
    const result = runCommands(run, root, plan.commands);
    return result.ok ? { ok: true, intent: "abandon", source: plan.source, deleted: plan.commands.map(command => command.join(" ")), warnings: [] } : stop("ABANDON_FAILED", `Command failed: ${result.command}`, result);
  }
  if (plan.method === "pull-request") {
    const context = forgeContext(root, policy, run);
    let pr = plan.pr;
    if (!pr) {
      const header = options.delivery?.header || out(git(run, root, ["log", "-1", "--format=%s", plan.source]));
      const bodyFile = await writePrBody(state, { ...(options.delivery || {}), header });
      const created = context.forge === "github"
        ? run("gh", ["pr", "create", "--base", plan.target, "--head", plan.remoteBranch, "--title", header, "--body-file", bodyFile, ...(plan.draft ? ["--draft"] : [])], { cwd: root })
        : run("glab", ["mr", "create", "--source-branch", plan.remoteBranch, "--target-branch", plan.target, "--title", header, "--description-file", bodyFile, "--yes", ...(plan.draft ? ["--draft"] : [])], { cwd: root });
      if (!created.ok) return stop("PR_CREATE_FAILED", `${context.cli} could not create the PR.`, { stderr: trimStderr(created.stderr) });
      pr = findOpenPr(root, context, plan.remoteBranch, plan.target, run) || { number: null, url: created.stdout.trim().split(/\s+/).find(item => /^https?:\/\//.test(item)) || null };
      if (plan.intent !== "integrate") return { ok: true, intent: plan.intent, pr, created: true, warnings: [] };
      const decision = prDecision(viewPr(root, context, pr.number, run), { whenGreen: options.whenGreen });
      if (decision.decision !== "merge" && decision.decision !== "auto-merge") return stop(decision.decision === "checks-failing" ? "PR_CHECKS_FAILING" : "PR_BLOCKED", `PR ${pr.url || pr.number} was opened; it cannot merge yet (${decision.waiting || decision.decision}).`, { pr });
      plan.decision = decision.decision;
      plan.mergeFlags = mergeFlags(context, policy, { auto: decision.decision === "auto-merge" }).flags;
    } else if (plan.intent !== "integrate") return { ok: true, intent: plan.intent, pr, created: false, warnings: [] };
    const merged = context.forge === "github"
      ? run("gh", ["pr", "merge", String(pr.number), ...plan.mergeFlags], { cwd: root })
      : run("glab", ["mr", "merge", String(pr.number), ...plan.mergeFlags], { cwd: root });
    if (!merged.ok) return stop("PR_MERGE_FAILED", `Merging PR ${pr.number} failed; nothing was bypassed.`, { stderr: trimStderr(merged.stderr), pr });
    if (plan.decision === "auto-merge") return { ok: true, intent: "integrate", pr, autoMerge: true, remoteVerified: false, warnings: plan.warnings || [] };
    git(run, root, ["fetch", "--prune", "origin"]);
    const sourceSha = out(git(run, root, ["rev-parse", plan.source]));
    const remoteVerified = isAncestor(run, root, sourceSha, `origin/${plan.target}`);
    return { ok: true, intent: "integrate", method: "pull-request", pr, source: plan.source, target: plan.target, sourceSha, mergeSha: out(git(run, root, ["rev-parse", `origin/${plan.target}`])), remoteVerified, warnings: plan.warnings || [] };
  }
  const warnings = [];
  if (stage !== "push" && plan.stages.includes("merge-into-branch")) {
    const merged = stageAMerge(run, root, plan.source, plan.target);
    if (!merged.ok) return merged;
    const pushed = pushBranch(run, root, plan.source, plan.remoteBranch);
    if (!pushed.ok) return pushed;
    if (plan.intent === "update-branch") return { ok: true, intent: "update-branch", source: plan.source, target: plan.target, merged: merged.merged, pushed: pushed.pushed, warnings };
    if (plan.verificationRequired) {
      return { ok: true, intent: "integrate", stage: "merge-into-branch", source: plan.source, target: plan.target, merged: merged.merged, warnings, next: { action: "run-verification", command: "run the verification for the merged branch, then integrate apply --stage push" } };
    }
  } else if (plan.intent === "update-branch") return { ok: true, intent: "update-branch", source: plan.source, target: plan.target, merged: false, pushed: false, warnings };
  if (stage !== "push" && plan.verificationRequired) return { ok: true, intent: "integrate", stage: "verification", source: plan.source, target: plan.target, warnings, next: { action: "run-verification", command: "verify, then integrate apply --stage push" } };
  const result = await localMergeToTarget({ run, root, state, source: plan.source, target: plan.target, executionId, policy });
  if (!result.ok) return result;
  return {
    ok: true, intent: "integrate", method: "local-merge", source: plan.source, target: plan.target, mergeSha: result.mergeSha, sourceSha: result.sourceSha,
    remoteVerified: result.remoteVerified, backMerge: plan.backMerge, warnings: [...warnings, ...result.warnings],
    next: plan.backMerge.length ? { action: "run", command: `integrate plan --intent integrate --target ${plan.backMerge[0]} --confirm-target` } : { action: "report" },
  };
}

// ------------------------------------------------------ release gather (M)
// agm-release merges finished work branches into the local integration branch
// before it prepares a version (release-steps.md M, 4.9.6). Merges stay local:
// the release D stage pushes develop once. Never rebase, squash, stash or force.

const DEFAULT_WORK_PREFIXES = ["feature/", "fix/", "hotfix/", "refactor/", "docs/", "chore/"];

function trailerValue(message, key) {
  const match = String(message || "").match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : null;
}

// Newest delivery commit (AGM-Execution) on base..tip and how many product
// commits follow it; carried audit committed afterwards (.agrimap-agent only) does not count.
function lastDelivery(run, root, base, tip) {
  const log = git(run, root, ["log", "--no-merges", "-n", "50", "--format=%H%x00%B%x1e", `${base}..${tip}`]).stdout || "";
  const commits = log.split("\x1e").map(item => item.trim()).filter(Boolean).map(item => ({ sha: item.split("\0")[0], body: item.split("\0").slice(1).join("\n") }));
  const index = commits.findIndex(item => trailerValue(item.body, "AGM-Execution"));
  if (index < 0) return { delivered: false, after: commits.length };
  const auditOnly = sha => lines(git(run, root, ["diff-tree", "--no-commit-id", "--name-only", "-r", sha]).stdout).every(file => file.startsWith(".agrimap-agent/"));
  const after = commits.slice(0, index).filter(item => !auditOnly(item.sha)).length;
  return { delivered: true, after, verification: trailerValue(commits[index].body, "AGM-Verification") || "passed" };
}

// Conflict preview without touching the worktree (git >= 2.38); null = unknown.
function mergePreview(run, root, into, tip) {
  const result = git(run, root, ["merge-tree", "--write-tree", "--name-only", "--no-messages", into, tip]);
  if (result.ok) return { conflict: false, paths: [] };
  if (result.status === 1) return { conflict: true, paths: lines(result.stdout).slice(1) };
  return { conflict: null, paths: [] };
}

export async function pendingWork({ root, policy = null, target = null, run = defaultRun, fetch = true } = {}) {
  const integration = target || policy?.branching?.integrationBranch || "develop";
  const warnings = [];
  if (fetch && git(run, root, ["remote", "get-url", "origin"]).ok && !git(run, root, ["fetch", "--prune", "origin"]).ok) warnings.push(warning("OFFLINE_FETCH_FAILED", "origin", "gather uses the last fetched refs"));
  const remoteRef = `origin/${integration}`;
  const hasRemote = refExists(run, root, `refs/remotes/${remoteRef}`);
  const hasLocal = refExists(run, root, `refs/heads/${integration}`);
  if (!hasRemote && !hasLocal) return stop("TARGET_MISSING", `${integration} does not exist locally or on origin.`);
  if (hasLocal && hasRemote && !isAncestor(run, root, remoteRef, integration) && !isAncestor(run, root, integration, remoteRef)) {
    return stop("TARGET_DIVERGED", `Local ${integration} and ${remoteRef} diverged; diagnose before gathering (AGENTS.release.md §6.2).`);
  }
  // Local develop may already hold unpushed merges from an earlier gather.
  const base = hasLocal && (!hasRemote || isAncestor(run, root, remoteRef, integration)) ? integration : remoteRef;
  const prefixes = [...new Set(Object.values(policy?.branching?.workTypes || {}).map(value => value?.prefix).filter(Boolean))];
  const workPrefixes = prefixes.length ? prefixes : DEFAULT_WORK_PREFIXES;
  const byName = new Map();
  for (const line of lines(git(run, root, ["for-each-ref", "--format=%(refname)%09%(objectname)", "refs/heads", "refs/remotes/origin"]).stdout)) {
    const [ref, sha] = line.split("\t");
    const local = ref.startsWith("refs/heads/");
    const name = local ? ref.slice("refs/heads/".length) : ref.slice("refs/remotes/origin/".length);
    if (name === "HEAD" || !workPrefixes.some(prefix => name.startsWith(prefix))) continue;
    const entry = byName.get(name) || { name, local: null, remote: null };
    entry[local ? "local" : "remote"] = sha;
    byName.set(name, entry);
  }
  const current = out(git(run, root, ["branch", "--show-current"]));
  const branches = [];
  let merged = 0;
  for (const entry of [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    let ref = entry.local ? entry.name : `origin/${entry.name}`;
    let sha = entry.local || entry.remote;
    let status = null;
    const reasons = [];
    if (entry.local && entry.remote && entry.local !== entry.remote) {
      if (isAncestor(run, root, entry.local, entry.remote)) { ref = `origin/${entry.name}`; sha = entry.remote; }
      else if (isAncestor(run, root, entry.remote, entry.local)) reasons.push("มี commit ในเครื่องที่ยังไม่ push");
      else { status = "manual"; reasons.push(`local กับ origin/${entry.name} แยกกัน`); }
    }
    if (isAncestor(run, root, sha, base)) { merged += 1; continue; }
    const delivery = lastDelivery(run, root, base, sha);
    if (!status && !delivery.delivered) { status = "manual"; reasons.push("ไม่ได้ส่งผ่าน deliver (ไม่มี AGM-Execution)"); }
    if (!status && delivery.after) { status = "manual"; reasons.push(`มี ${delivery.after} commit หลังส่งงานล่าสุด`); }
    if (!status && delivery.verification !== "passed") { status = "unverified"; reasons.push(`AGM-Verification: ${delivery.verification}`); }
    const preview = mergePreview(run, root, base, sha);
    if (preview.conflict) reasons.push(`ชนกับ ${integration} ${preview.paths.length} ไฟล์`);
    branches.push({
      name: entry.name, ref, sha, status: status || "ready", current: entry.name === current,
      ahead: Number(out(git(run, root, ["rev-list", "--count", `${base}..${sha}`]))) || 0,
      conflict: preview.conflict, conflictPaths: preview.paths.slice(0, 20),
      lastCommit: out(git(run, root, ["log", "-1", "--format=%cI", sha])),
      subjects: lines(git(run, root, ["log", "--no-merges", "-n", "3", "--format=%s", `${base}..${sha}`]).stdout),
      reasons,
    });
  }
  const count = predicate => branches.filter(predicate).length;
  return {
    ok: true, target: integration, base, baseSha: out(git(run, root, ["rev-parse", base])), current, branches, warnings,
    counts: { ready: count(item => item.status === "ready" && item.conflict !== true), unverified: count(item => item.status === "unverified"), manual: count(item => item.status === "manual"), conflict: count(item => item.conflict === true), merged },
  };
}

const gatherSummary = item => ({ name: item.name, ref: item.ref, sha: item.sha, status: item.status, ahead: item.ahead, conflict: item.conflict, reasons: item.reasons, subjects: item.subjects });

// Release scope (4.9.9 default): only the release's own work branch — the current
// branch, --branches, or this session's delivered branch. Other people's branches are
// ignored, and a conflict on an own branch is resolved by the agent on that branch.
function releaseScopePlan(pending, { include, exclude, sessionBranches }) {
  const own = new Set([...(pending.current && pending.current !== pending.target ? [pending.current] : []), ...include, ...sessionBranches].filter(name => !exclude.includes(name)));
  const inScope = pending.branches.filter(item => own.has(item.name));
  const resolve = inScope.filter(item => item.conflict === true).map(item => ({
    branch: item.name, paths: item.conflictPaths,
    steps: [`git switch ${item.name}`, `git merge ${pending.base}`, "resolve every conflict keeping both intents, run the project tests", "git commit (Git's merge message)", "deliver apply --push-only", "integrate gather plan"],
  }));
  return { selected: inScope.filter(item => item.conflict !== true), resolve, ignored: pending.branches.length - inScope.length };
}

export async function planGather({ root, policy = null, target = null, mode = null, include = [], exclude = [], scope = "release", sessionBranches = [], run = defaultRun, fetch = true } = {}) {
  if (mode && !["ready", "all", "none"].includes(mode)) return stop("MODE_INVALID", "--mode must be ready|all|none.");
  if (!["release", "all"].includes(scope)) return stop("SCOPE_INVALID", "--scope must be release|all.");
  const pending = await pendingWork({ root, policy, target, run, fetch });
  if (!pending.ok) return pending;
  const { target: integration, current } = pending;
  const dirty = dirtyInventory(root, { run }).filter(entry => !entry.path.startsWith(".agrimap-agent/")).map(entry => entry.path);
  if (dirty.length) {
    const onTarget = current === integration;
    return stop(onTarget ? "DIRTY_TARGET" : "DELIVER_FIRST", onTarget
      ? `${integration} has uncommitted work; commit it as the release content commit (AGENTS.release.md §6.3), then gather.`
      : `${current || "HEAD"} has uncommitted changes; deliver them first, then gather.`, {
      paths: dirty.slice(0, 50), next: { action: "run", command: onTarget ? "content commit per AGENTS.release.md §6.3, then integrate gather plan" : "deliver plan, deliver apply, then integrate gather plan" },
    });
  }
  if (scope === "release") {
    const own = mode === "none" ? { selected: [], resolve: [], ignored: pending.branches.length } : releaseScopePlan(pending, { include, exclude, sessionBranches });
    const merges = own.selected.map(item => ({ name: item.name, ref: item.ref, sha: item.sha }));
    const planHash = planHashOf({ integration, baseSha: pending.baseSha, current, merges: merges.map(item => [item.name, item.sha]) });
    return {
      ok: true, scope, target: integration, base: pending.base, baseSha: pending.baseSha, current, counts: pending.counts,
      selected: own.selected.map(gatherSummary), resolve: own.resolve, ignored: own.ignored, skipped: [], merges, warnings: pending.warnings, card: null, planHash,
      next: own.resolve.length ? { action: "resolve", command: "resolve the conflict on each resolve[].branch by following its steps, then integrate gather plan again" }
        : merges.length ? { action: "run", command: `integrate gather apply --plan-hash ${planHash}` } : { action: "report", command: `nothing of this release to gather into ${integration}; continue` },
    };
  }
  const unknown = [...include, ...exclude].filter(name => !pending.branches.some(item => item.name === name));
  if (unknown.length) return stop("BRANCH_NOT_PENDING", `Not an unmerged work branch: ${unknown.join(", ")}.`, { pending: pending.branches.map(gatherSummary) });
  const skip = new Set(exclude);
  const candidates = pending.branches.filter(item => !skip.has(item.name));
  const mergeable = candidates.filter(item => item.conflict !== true);
  const blocked = candidates.filter(item => item.conflict === true);
  const ready = mergeable.filter(item => item.status === "ready");
  const undecided = mergeable.filter(item => item.status !== "ready");
  const warnings = [...pending.warnings, ...blocked.map(item => warning("GATHER_CONFLICT", item.name, `integrate plan --intent update-branch --branch ${item.name}, resolve ${item.conflictPaths.slice(0, 3).join(", ")}, deliver, then gather again`))];
  if (!include.length && !mode && undecided.length) {
    return {
      ok: true, target: integration, counts: pending.counts, ready: ready.map(gatherSummary), undecided: undecided.map(gatherSummary), blocked: blocked.map(gatherSummary), warnings, planHash: null, next: { action: "ask" },
      card: {
        kind: "integration", topic: "git/release-gather", risk: "R2", confidence: "high",
        question: `มี ${undecided.length} branch ที่ยังไม่พร้อมรวมอัตโนมัติ จะรวมเข้า ${integration} ใน release นี้ไหม`,
        impact: `branch ที่รวมจะไปกับ release นี้; ที่พร้อมแล้ว ${ready.length} branch รวมให้อยู่แล้ว`,
        checked: [...undecided, ...blocked].slice(0, 5).map(item => `${item.name}: ${item.reasons.join(", ")}`),
        options: [
          { id: "1", label: `รวมเฉพาะที่พร้อม (${ready.length})`, effect: "integrate gather plan --mode ready", value: "ready" },
          { id: "2", label: `รวมทั้งหมดที่ไม่ชน (${mergeable.length})`, effect: "integrate gather plan --mode all", value: "all" },
          { id: "3", label: "ไม่รวม branch ใดเลย", effect: `release เฉพาะงานที่อยู่ใน ${integration} แล้ว`, value: "none" },
        ],
        recommended: "1", recommendedReason: "รวมเฉพาะงานที่ส่งผ่าน deliver และ test ผ่าน", blocking: true, default: null, recordAs: "none", paths: [], expiresHours: 24,
      },
    };
  }
  const named = new Set(include);
  const selected = include.length ? mergeable.filter(item => named.has(item.name)) : mode === "none" ? [] : mode === "all" ? mergeable : ready;
  const merges = selected.map(item => ({ name: item.name, ref: item.ref, sha: item.sha }));
  const planHash = planHashOf({ integration, baseSha: pending.baseSha, current, merges: merges.map(item => [item.name, item.sha]) });
  return {
    ok: true, target: integration, base: pending.base, baseSha: pending.baseSha, current, counts: pending.counts,
    selected: selected.map(gatherSummary), skipped: pending.branches.filter(item => !selected.includes(item)).map(gatherSummary),
    merges, warnings, card: null, planHash,
    next: selected.length ? { action: "run", command: `integrate gather apply --plan-hash ${planHash}${mode ? ` --mode ${mode}` : ""}` } : { action: "report", command: `nothing to gather into ${integration}; continue the release` },
  };
}

// Merge commits are built with merge-tree/commit-tree like the local-merge
// integration, so gathering never switches branches in the worktree. Local
// develop moves by update-ref, or by --ff-only when it is checked out here.
export async function applyGather(options) {
  const run = options.run || defaultRun;
  const { root } = options;
  const plan = await planGather({ ...options, run, fetch: false });
  if (!plan.ok) return plan;
  if (plan.card) return { ...plan, ok: false, code: "CARD_PENDING", message: "Answer the card first." };
  if (plan.planHash !== options.planHash) return stop("PLAN_STALE", "Branches changed since the plan; run integrate gather plan again.", { next: { action: "run", command: "integrate gather plan" } });
  if (!plan.merges.length) return { ok: true, target: plan.target, merged: [], head: plan.baseSha, pushed: false, skipped: plan.skipped, warnings: plan.warnings, next: plan.next };
  const here = plan.current === plan.target;
  const elsewhere = !here && out(git(run, root, ["worktree", "list", "--porcelain"])).split(/\r?\n/).includes(`branch refs/heads/${plan.target}`);
  if (elsewhere) return stop("TARGET_CHECKED_OUT", `${plan.target} is checked out in another worktree; gather there or free it first.`);
  const signing = out(git(run, root, ["config", "--get", "commit.gpgsign"])) === "true" ? ["-S"] : [];
  const merged = [];
  let tip = plan.baseSha;
  for (const item of plan.merges) {
    const tree = git(run, root, ["merge-tree", "--write-tree", "--no-messages", tip, item.sha]);
    if (!tree.ok) {
      if (tree.status !== 1) return stop("GIT_MERGE_TREE_UNSUPPORTED", "integrate gather needs git 2.38+ (merge-tree --write-tree).", { stderr: trimStderr(tree.stderr) });
      const conflicts = lines(git(run, root, ["merge-tree", "--write-tree", "--name-only", "--no-messages", tip, item.sha]).stdout).slice(1);
      return stop("MERGE_CONFLICT", `${item.name} conflicts with the branches gathered before it; nothing was changed.`, {
        merged: [], conflicts, next: { action: "ask" },
        card: {
          kind: "integration", topic: "git/release-gather-conflict", risk: "R2", confidence: "high",
          question: `${item.name} ชนกับงานที่รวมก่อนหน้า ${conflicts.length} ไฟล์`,
          impact: `ยังไม่ได้แตะ ${plan.target}`,
          checked: conflicts.slice(0, 5),
          options: [
            { id: "1", label: "ข้าม branch นี้แล้ว release ต่อ", effect: `integrate gather plan --exclude ${item.name}`, value: "exclude" },
            { id: "2", label: "หยุด release แก้ conflict ก่อน", effect: `integrate plan --intent update-branch --branch ${item.name}`, value: "resolve" },
          ],
          recommended: "1", recommendedReason: "งานอื่นไปต่อได้ branch นี้ตามไปรอบหน้าหลังแก้ conflict", blocking: true, default: null, recordAs: "none", paths: conflicts, expiresHours: 24,
        },
      });
    }
    const label = item.ref.startsWith("origin/") ? `remote-tracking branch '${item.ref}'` : `branch '${item.ref}'`;
    const created = git(run, root, ["commit-tree", ...signing, tree.stdout.split(/\r?\n/)[0].trim(), "-p", tip, "-p", item.sha, "-m", `Merge ${label} into ${plan.target}`]);
    if (!created.ok) return stop("MERGE_COMMIT_FAILED", "git commit-tree failed; nothing was changed.", { stderr: trimStderr(created.stderr) });
    tip = created.stdout.trim();
    merged.push({ name: item.name, sha: item.sha, mergeSha: tip });
  }
  const localSha = refExists(run, root, `refs/heads/${plan.target}`) ? out(git(run, root, ["rev-parse", plan.target])) : "0".repeat(40);
  const moved = here ? git(run, root, ["merge", "--ff-only", tip]) : git(run, root, ["update-ref", `refs/heads/${plan.target}`, tip, localSha]);
  if (!moved.ok) return stop("GATHER_FAILED", `Could not move ${plan.target} to the gathered merges; nothing was changed.`, { stderr: trimStderr(moved.stderr) });
  return {
    ok: true, target: plan.target, merged, head: tip, pushed: false, skipped: plan.skipped, warnings: plan.warnings,
    next: { action: "run-verification", command: `verify ${plan.target}, then continue the release; D pushes ${plan.target} once` },
  };
}

// ---------------------------------------- release preflight and sync (4.9.8)
// R reads every branch fact once and returns automatic actions and resolve steps,
// so a release never stops for a branch surprise (AGENTS.release.md §6.5). Sync
// makes history-preserving merges into local develop; pushes stay with D/J/T.

const RELEASE_BRANCHES = ["develop", "jenkins", "jenkins-release"];
const refSha = (run, root, ref) => (refExists(run, root, ref) ? out(git(run, root, ["rev-parse", ref])) : null);

function pairState(run, root, local, remote) {
  if (!local && !remote) return "missing";
  if (!remote) return "local-only";
  if (!local) return "remote-only";
  if (local === remote) return "equal";
  if (isAncestor(run, root, local, remote)) return "behind";
  if (isAncestor(run, root, remote, local)) return "ahead";
  return "diverged";
}

// Effect of merging `other` into `tip`: a conflict, or the files the result changes.
function mergeEffect(run, root, tip, other) {
  const result = git(run, root, ["merge-tree", "--write-tree", "--no-messages", tip, other]);
  if (!result.ok) {
    if (result.status !== 1) return { conflict: null, changed: [], paths: [] };
    return { conflict: true, changed: [], paths: lines(git(run, root, ["merge-tree", "--write-tree", "--name-only", "--no-messages", tip, other]).stdout).slice(1) };
  }
  const tree = lines(result.stdout)[0];
  return { conflict: false, tree, changed: lines(git(run, root, ["diff", "--name-only", `${tip}^{tree}`, tree]).stdout), paths: [] };
}

function ownerVersion(run, root, ref, file) {
  const shown = git(run, root, ["show", `${ref}:${file}`]);
  if (!shown.ok) return null;
  return {
    imageTag: shown.stdout.match(/IMAGE_TAG\s*=\s*['"]([^'"]+)['"]/)?.[1] || null,
    projectVersion: shown.stdout.match(/PROJECT_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] || null,
  };
}

function releaseFacts(run, root) {
  const branches = {};
  for (const name of RELEASE_BRANCHES) {
    const local = refSha(run, root, `refs/heads/${name}`);
    const remote = refSha(run, root, `refs/remotes/origin/${name}`);
    branches[name] = { local, remote, state: pairState(run, root, local, remote) };
  }
  const develop = branches.develop;
  // The candidate grows from local develop when it holds unpushed work, else from origin/develop.
  const base = ["ahead", "local-only", "diverged"].includes(develop.state) ? develop.local : develop.remote || develop.local;
  return { branches, base };
}

// Merges that bring local develop up to date and restore fast-forward ancestry for
// jenkins and jenkins-release. All are automatic (owner decision 2026-09-29, 4.9.9):
// content already on a release branch belongs in develop. A conflict becomes a
// resolve step the agent performs on develop, never a question.
function releaseMerges(run, root, facts) {
  const { branches, base } = facts;
  const merges = [];
  const resolve = [];
  const blockers = [];
  // Each merge is judged against the tip that already holds the earlier ones; the
  // unreferenced commit-tree object moves no ref.
  let tip = base;
  const advance = (effect, sha) => { const made = git(run, root, ["commit-tree", effect.tree, "-p", tip, "-p", sha, "-m", "preflight"]); if (made.ok) tip = made.stdout.trim(); };
  const conflictSteps = ref => ["git switch develop", `git merge ${ref}`, "resolve every conflict keeping both intents, run the project tests", "git commit (Git's merge message)", "release sync plan"];
  const candidates = [
    ...(branches.develop.state === "diverged" ? [{ ref: "origin/develop", sha: branches.develop.remote, reason: "origin/develop advanced" }] : []),
    ...["jenkins", "jenkins-release"].map(name => ({ ref: `origin/${name}`, sha: branches[name].remote, reason: null })),
  ];
  for (const item of candidates) {
    if (!item.sha || isAncestor(run, root, item.sha, tip)) continue;
    const effect = mergeEffect(run, root, tip, item.sha);
    if (effect.conflict === null) { blockers.push({ code: "GIT_MERGE_TREE_UNSUPPORTED", subject: item.ref, paths: [] }); continue; }
    if (effect.conflict === true) { resolve.push({ ref: item.ref, paths: effect.paths.slice(0, 20), steps: conflictSteps(item.ref) }); continue; }
    const reason = item.reason || (effect.changed.length ? `content already on ${item.ref.slice(7)}` : "merge-only history, no file changes");
    merges.push({ ref: item.ref, sha: item.sha, reason, changed: effect.changed.length, files: effect.changed.slice(0, 20) });
    advance(effect, item.sha);
  }
  return { merges, resolve, blockers };
}

export async function releasePreflight({ root, policy = null, include = [], sessionBranches = [], run = defaultRun, fetch = true } = {}) {
  const warnings = [];
  if (fetch && git(run, root, ["remote", "get-url", "origin"]).ok && !git(run, root, ["fetch", "--prune", "--tags", "origin"]).ok) warnings.push(warning("OFFLINE_FETCH_FAILED", "origin", "preflight uses the last fetched refs"));
  const facts = releaseFacts(run, root);
  if (!facts.base) return stop("DEVELOP_MISSING", "develop does not exist locally or on origin.");
  const { merges, resolve, blockers } = releaseMerges(run, root, facts);
  const gather = await planGather({ root, policy, include, sessionBranches, run, fetch: false });
  const dirty = dirtyInventory(root, { run });
  const own = gather.ok ? gather.selected || [] : [];
  const autoActions = [
    ...(facts.branches.develop.state === "behind" ? [{ action: "fast-forward develop", ref: "origin/develop" }] : []),
    ...merges.map(item => ({ action: `merge ${item.ref} into develop`, reason: item.reason, changed: item.changed })),
    ...(own.length ? [{ action: `gather ${own.map(item => item.name).join(", ")}`, command: "integrate gather plan, integrate gather apply" }] : []),
    ...(!gather.ok && gather.code === "DELIVER_FIRST" ? [{ action: `deliver the uncommitted work on ${gather.current || "the current branch"} first`, command: "deliver plan, deliver apply" }] : []),
  ];
  const latestTag = lines(git(run, root, ["tag", "--list", "v*", "--sort=-v:refname"]).stdout)[0] || null;
  const allResolve = [...resolve, ...(gather.ok ? gather.resolve || [] : [])];
  return {
    ok: blockers.length === 0, code: blockers.length ? blockers[0].code : undefined, current: out(git(run, root, ["branch", "--show-current"])),
    branches: facts.branches, base: facts.base,
    owners: { inhouse: ownerVersion(run, root, facts.base, "Jenkinsfile"), production: ownerVersion(run, root, facts.base, "Jenkinsfile_Production") },
    latestTag, dirty: { product: dirty.filter(item => !item.path.startsWith(".agrimap-agent/")).map(item => item.path), agent: dirty.filter(item => item.path.startsWith(".agrimap-agent/")).length },
    work: gather.ok ? { own: own.map(item => item.name), ignoredOtherBranches: gather.ignored || 0 } : { code: gather.code },
    autoActions, resolve: allResolve, blockers, questions: [], warnings,
    next: blockers.length ? { action: "report", command: "stop only the affected publication and report the blocker" }
      : allResolve.length ? { action: "resolve", command: "resolve each conflict by its steps (no question), then run release preflight again" }
      : { action: "run", command: "release sync plan, release sync apply, integrate gather plan/apply, then prepare" },
  };
}

export async function planReleaseSync({ root, run = defaultRun, fetch = true } = {}) {
  if (fetch && git(run, root, ["remote", "get-url", "origin"]).ok) git(run, root, ["fetch", "--prune", "origin"]);
  const facts = releaseFacts(run, root);
  if (!facts.base) return stop("DEVELOP_MISSING", "develop does not exist locally or on origin.");
  const { merges, resolve, blockers } = releaseMerges(run, root, facts);
  if (blockers.length) return stop(blockers[0].code, `${blockers[0].subject} cannot be checked; nothing was merged.`, { blockers, next: { action: "report" } });
  if (resolve.length) return { ok: true, base: facts.base, resolve, merges: [], planHash: null, card: null, next: { action: "resolve", command: "merge each resolve[].ref into develop, resolve the conflicts, run the tests, commit, then release sync plan" } };
  const current = out(git(run, root, ["branch", "--show-current"]));
  const planHash = planHashOf({ base: facts.base, local: facts.branches.develop.local, merges: merges.map(item => [item.ref, item.sha]), current });
  return {
    ok: true, base: facts.base, current, merges, resolve: [], planHash, card: null,
    next: merges.length || facts.base !== facts.branches.develop.local ? { action: "run", command: `release sync apply --plan-hash ${planHash}` } : { action: "report", command: "develop is already in sync" },
  };
}

export async function applyReleaseSync(options) {
  const run = options.run || defaultRun;
  const { root } = options;
  const plan = await planReleaseSync({ ...options, run, fetch: false });
  if (!plan.ok) return plan;
  if (plan.planHash !== options.planHash) return stop("PLAN_STALE", "Branches changed since the plan; run release sync plan again.", { next: { action: "run", command: "release sync plan" } });
  const local = refSha(run, root, "refs/heads/develop");
  if (plan.current !== "develop" && out(git(run, root, ["worktree", "list", "--porcelain"])).split(/\r?\n/).includes("branch refs/heads/develop")) return stop("TARGET_CHECKED_OUT", "develop is checked out in another worktree; sync there.");
  const signing = out(git(run, root, ["config", "--get", "commit.gpgsign"])) === "true" ? ["-S"] : [];
  let tip = plan.base;
  const merged = [];
  for (const item of plan.merges) {
    const effect = mergeEffect(run, root, tip, item.sha);
    if (effect.conflict !== false) return stop("RELEASE_SYNC_CONFLICT", `${item.ref} no longer merges cleanly; nothing was changed.`, { paths: effect.paths });
    const created = git(run, root, ["commit-tree", ...signing, effect.tree, "-p", tip, "-p", item.sha, "-m", `Merge remote-tracking branch '${item.ref}' into develop`]);
    if (!created.ok) return stop("MERGE_COMMIT_FAILED", "git commit-tree failed; nothing was changed.", { stderr: trimStderr(created.stderr) });
    tip = created.stdout.trim();
    merged.push({ ref: item.ref, sha: item.sha, mergeSha: tip, changed: item.changed });
  }
  if (tip !== local) {
    const moved = plan.current === "develop" ? git(run, root, ["merge", "--ff-only", tip]) : git(run, root, ["update-ref", "refs/heads/develop", tip, local || "0".repeat(40)]);
    if (!moved.ok) return stop("RELEASE_SYNC_FAILED", "Could not move develop to the synced commit; nothing was pushed.", { stderr: trimStderr(moved.stderr) });
  }
  return {
    ok: true, head: tip, merged, pushed: false,
    next: { action: "run", command: merged.some(item => item.changed) ? "review the merged delta (changelog/notes), verify, then push develop once" : "verify, then push develop once" },
  };
}
