// Ephemeral worktree, durable job context (5.0.1, owner decision 2026-10-14).
// A delegated writer gets a job: a fresh linked worktree on a unique branch from
// the latest integration baseline. After the Leader verifies and integrates it,
// the worktree and its temporary branch are removed; the job's durable context
// stays in the audit log and the Leader's savepoint. Rework is a new job linked
// to the original one; a worktree is never reused. Nothing here forces, resets or
// deletes uncommitted work: Git's own non-forced commands refuse those cases.
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";
import { defaultRun } from "./run-command.mjs";

const LOCK_STALE_MS = 10 * 60_000;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const git = (run, cwd, args) => run("git", args, { cwd });
const out = result => (result.ok ? String(result.stdout || "").trim() : "");
const stop = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });
const toSlash = value => String(value || "").replaceAll("\\", "/");
// Real paths: Windows temp paths may be 8.3 short names (RUNNER~1) while git prints long ones.
const canonical = (value) => { try { return toSlash(realpathSync.native(value)).toLowerCase(); } catch { return toSlash(path.resolve(value)).toLowerCase(); } };
const samePath = (a, b) => canonical(a) === canonical(b);

export function jobsDirectory(state) {
  return path.join(state, "runtime", "jobs");
}

function jobFile(state, jobId) {
  return path.join(jobsDirectory(state), `${jobId}.json`);
}

export function safeJobId(value) {
  const text = String(value || "").trim();
  return /^job-[a-z0-9]{6,20}$/.test(text) ? text : null;
}

export function newJobId(now = Date.now()) {
  return `job-${now.toString(36)}${randomBytes(2).toString("hex")}`;
}

export async function readJob(state, jobId) {
  const id = safeJobId(jobId);
  if (!id) return null;
  try { return JSON.parse(await readFile(jobFile(state, id), "utf8")); } catch { return null; }
}

async function writeJob(state, job) {
  await mkdir(jobsDirectory(state), { recursive: true });
  const target = jobFile(state, job.jobId);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(job, null, 2)}\n`, "utf8");
  await rename(temporary, target);
  return job;
}

export async function listJobs(state, { session = null } = {}) {
  const jobs = [];
  for (const name of await readdir(jobsDirectory(state)).catch(() => [])) {
    if (!name.endsWith(".json")) continue;
    const job = await readJob(state, name.slice(0, -5));
    if (job && (!session || job.ownerSession === session)) jobs.push(job);
  }
  return jobs.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

// Worktrees live beside the repository, never inside it, so they are not
// untracked files of the main checkout: <parent>/<repo>.worktrees/<job-id>.
export function worktreeDirectory(root, jobId) {
  return path.join(path.dirname(root), `${path.basename(root)}.worktrees`, jobId);
}

export function worktreeEntries(run, root) {
  const entries = [];
  let current = null;
  for (const line of out(git(run, root, ["worktree", "list", "--porcelain"])).split(/\r?\n/)) {
    if (line.startsWith("worktree ")) { current = { path: line.slice(9), branch: null, locked: false, prunable: false }; entries.push(current); }
    else if (current && line.startsWith("branch ")) current.branch = line.slice(7).replace(/^refs\/heads\//, "");
    else if (current && line.startsWith("locked")) current.locked = true;
    else if (current && line.startsWith("prunable")) current.prunable = true;
  }
  return entries;
}

// Plan a job: unique branch <prefix><slug>-<job-id> from the baseline. The
// baseline is the Leader's integration branch tip (--into), so every job, rework
// included, starts from the latest approved integrated state.
export function planJob({ root, policy, slug, type = "feature", into, parentJob = null, jobId = newJobId(), run = defaultRun }) {
  if (!SLUG.test(String(slug || ""))) return stop("JOB_SLUG_INVALID", "--slug must be English kebab-case.");
  const workType = policy?.branching?.workTypes?.[type === "hotfix" ? "hotfix" : "feature"];
  const prefix = workType?.prefix || (type === "hotfix" ? "hotfix/" : "feature/");
  const baseline = String(into || "").trim() || out(git(run, root, ["branch", "--show-current"]));
  if (!baseline) return stop("JOB_BASELINE_MISSING", "The Leader must be on its work branch (or pass --into) so jobs start from its integrated state.");
  const baseSha = out(git(run, root, ["rev-parse", "--verify", `${baseline}^{commit}`]));
  if (!baseSha) return stop("JOB_BASELINE_MISSING", `Baseline ${baseline} does not exist.`);
  const branch = `${prefix}${slug}-${jobId.slice(4)}`;
  if (out(git(run, root, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]))) return stop("JOB_BRANCH_EXISTS", `${branch} already exists; plan again for a new job id.`);
  const directory = worktreeDirectory(root, jobId);
  return {
    ok: true,
    job: { jobId, parentJob: safeJobId(parentJob), branch, into: baseline, baseSha, directory },
    commands: [["git", "worktree", "add", "-b", branch, directory, baseSha]],
  };
}

export async function startJob({ root, state, policy, slug, type, into, parentJob = null, session, executionId = null, run = defaultRun, now = () => new Date().toISOString() }) {
  if (!session) return stop("SESSION_REQUIRED", "A Leader session owns every job.");
  const parent = parentJob ? await readJob(state, parentJob) : null;
  if (parentJob && !parent) return stop("PARENT_JOB_NOT_FOUND", `No job ${parentJob} to rework.`);
  const plan = planJob({ root, policy, slug, type, into, parentJob, run });
  if (!plan.ok) return plan;
  await mkdir(path.dirname(plan.job.directory), { recursive: true });
  const created = git(run, root, plan.commands[0].slice(1));
  if (!created.ok) return stop("JOB_WORKTREE_FAILED", "git worktree add failed.", { stderr: String(created.stderr || "").trim().slice(0, 400) });
  const job = { ...plan.job, ownerSession: session, executionId, status: "active", createdAt: now(), steps: [] };
  await writeJob(state, job);
  return { ok: true, job, reworkOf: parent ? parent.jobId : null };
}

// How the job's work reached the target: fast-forward/merge (ancestor), rebase
// or cherry-pick (every patch already upstream), or squash (merging adds nothing).
export function integrationState({ run = defaultRun, root, branch, target }) {
  const tip = out(git(run, root, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}^{commit}`]));
  if (!tip) return { integrated: false, method: null, tip: null, reason: "branch-missing" };
  if (git(run, root, ["merge-base", "--is-ancestor", tip, target]).ok) return { integrated: true, method: "merge", tip };
  const cherry = out(git(run, root, ["cherry", target, tip])).split(/\r?\n/).filter(Boolean);
  if (cherry.length && cherry.every(line => line.startsWith("-"))) return { integrated: true, method: "rebase", tip };
  const merged = git(run, root, ["merge-tree", "--write-tree", target, tip]);
  const targetTree = out(git(run, root, ["rev-parse", `${target}^{tree}`]));
  if (merged.ok && out(merged).split(/\r?\n/)[0] === targetTree) return { integrated: true, method: "squash", tip };
  return { integrated: false, method: null, tip, reason: "not-in-target" };
}

async function acquireLock(state, jobId, nowMs) {
  const lock = path.join(jobsDirectory(state), `${jobId}.lock`);
  await mkdir(path.dirname(lock), { recursive: true });
  try {
    const handle = await open(lock, "wx");
    await handle.writeFile(String(nowMs));
    await handle.close();
    return lock;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const age = nowMs - (await stat(lock).then(item => item.mtimeMs, () => nowMs));
    if (age < LOCK_STALE_MS) return null;
    // An interrupted cleanup left its lock behind: take it over.
    await rm(lock, { force: true });
    return acquireLock(state, jobId, nowMs);
  }
}

// Remove an integrated job's worktree and temporary branch. Every step checks the
// current state first, so a retry after interruption finishes what is left.
export async function cleanupJob({ root, state, jobId, session, target = null, gatesPassed, persist = null, run = defaultRun, now = () => new Date().toISOString() }) {
  const job = await readJob(state, jobId);
  if (!job) return stop("JOB_NOT_FOUND", `No job ${jobId}.`);
  if (job.ownerSession !== session) return stop("JOB_NOT_OWNED", `${job.jobId} belongs to another session; only its Leader removes it.`);
  if (job.status === "cleaned") return { ok: true, jobId: job.jobId, alreadyClean: true, steps: job.steps };
  const into = target || job.into;
  const blocked = (code, message, extra = {}) => ({ ...stop(code, message, extra), jobId: job.jobId, cleanup: "blocked" });
  if (gatesPassed !== true && job.status !== "integrated") return blocked("QUALITY_GATE_NOT_PASSED", "Cleanup waits for the verified integration of this job.");
  // The job's durable context (audit log) is written before anything is removed.
  if (job.contextPersisted !== true) {
    if (!persist) return blocked("JOB_CONTEXT_NOT_PERSISTED", "Record the job in the audit log before removing its worktree.");
    try { await persist({ job }); } catch (error) { return blocked("JOB_CONTEXT_NOT_PERSISTED", String(error?.message || error).slice(0, 200)); }
    await writeJob(state, { ...(await readJob(state, job.jobId)), contextPersisted: true });
  }
  const lock = await acquireLock(state, job.jobId, Date.now());
  if (!lock) return blocked("JOB_CLEANUP_IN_PROGRESS", "Another cleanup of this job is running; retry later.");
  const steps = [...(job.steps || [])];
  try {
    const entry = worktreeEntries(run, root).find(item => samePath(item.path, job.directory));
    const branchExists = Boolean(out(git(run, root, ["rev-parse", "--verify", "--quiet", `refs/heads/${job.branch}`])));
    const proof = branchExists ? integrationState({ run, root, branch: job.branch, target: into }) : { integrated: true, method: job.method || "already-deleted" };
    if (!proof.integrated) return blocked("JOB_NOT_INTEGRATED", `${job.branch} is not in ${into}; nothing is removed.`);
    if (entry) {
      if (entry.locked) return blocked("JOB_WORKTREE_LOCKED", `${job.directory} is locked.`);
      if (samePath(entry.path, root)) return blocked("JOB_WORKTREE_IS_MAIN", "The main worktree is never removed.");
      const dirty = out(git(run, job.directory, ["status", "--porcelain", "--untracked-files=all"]));
      if (dirty) return blocked("JOB_WORKTREE_DIRTY", "The job worktree has uncommitted or untracked files; nothing is removed.", { paths: dirty.split(/\r?\n/).slice(0, 10) });
      const removed = git(run, root, ["worktree", "remove", job.directory]);
      if (!removed.ok) return blocked("JOB_WORKTREE_REMOVE_FAILED", "git worktree remove refused.", { stderr: String(removed.stderr || "").trim().slice(0, 400) });
      steps.push({ step: "worktree-removed", at: now() });
    } else if (await stat(job.directory).then(() => true, () => false)) {
      return blocked("JOB_DIRECTORY_NOT_A_WORKTREE", `${job.directory} exists but is not this job's worktree; it is left alone.`);
    }
    git(run, root, ["worktree", "prune"]);
    if (branchExists) {
      // merge proves ancestry, so the safe -d works whenever HEAD contains it;
      // rebase and squash rewrote the commits, so only the proven -D can delete.
      const head = out(git(run, root, ["rev-parse", "HEAD"]));
      const safe = proof.method === "merge" && git(run, root, ["merge-base", "--is-ancestor", proof.tip, head]).ok;
      const deleted = git(run, root, ["branch", safe ? "-d" : "-D", job.branch]);
      if (!deleted.ok) return blocked("JOB_BRANCH_DELETE_FAILED", `Could not delete ${job.branch}.`, { stderr: String(deleted.stderr || "").trim().slice(0, 400) });
      steps.push({ step: `branch-deleted (${safe ? "-d" : "-D"}, ${proof.method})`, at: now() });
    }
    const finished = { ...job, status: "cleaned", method: proof.method, cleanedAt: now(), steps };
    await writeJob(state, finished);
    return { ok: true, jobId: job.jobId, branch: job.branch, method: proof.method, steps };
  } finally {
    await writeJob(state, { ...(await readJob(state, job.jobId)), steps }).catch(() => {});
    await rm(lock, { force: true });
  }
}

// Leader integration of one finished job into its baseline branch, then cleanup.
// A failed gate, a dirty worktree or a conflict keeps everything in place.
export async function integrateJob({ root, state, jobId, session, verification, evidence = "", persist = null, run = defaultRun, now = () => new Date().toISOString() }) {
  const job = await readJob(state, jobId);
  if (!job) return stop("JOB_NOT_FOUND", `No job ${jobId}.`);
  if (job.ownerSession !== session) return stop("JOB_NOT_OWNED", `${job.jobId} belongs to another session.`);
  if (job.status === "cleaned") return { ok: true, jobId: job.jobId, alreadyIntegrated: true, cleanup: { ok: true, alreadyClean: true } };
  if (verification !== "passed") return { ...stop("QUALITY_GATE_NOT_PASSED", "Verify the job's work first (--verification passed with evidence); the worktree stays."), jobId: job.jobId, cleanup: "blocked" };
  const current = out(git(run, root, ["branch", "--show-current"]));
  if (current !== job.into) return stop("JOB_INTO_NOT_CHECKED_OUT", `Switch the Leader worktree to ${job.into} before integrating ${job.jobId}.`);
  const dirtyJob = out(git(run, job.directory, ["status", "--porcelain", "--untracked-files=all"]));
  if (dirtyJob) return { ...stop("JOB_WORKTREE_DIRTY", "Commit the job's work in its worktree before integration."), jobId: job.jobId, cleanup: "blocked" };
  let mergeSha = null;
  if (job.status !== "integrated") {
    const proof = integrationState({ run, root, branch: job.branch, target: job.into });
    if (!proof.integrated) {
      const merged = git(run, root, ["merge", "--no-ff", "--no-edit", job.branch]);
      if (!merged.ok) {
        const conflicts = out(git(run, root, ["diff", "--name-only", "--diff-filter=U"])).split(/\r?\n/).filter(Boolean);
        git(run, root, ["merge", "--abort"]);
        return { ...stop("JOB_MERGE_CONFLICT", `${job.branch} conflicts with ${job.into}; resolve in a rework job.`, { conflicts }), jobId: job.jobId, cleanup: "blocked" };
      }
    }
    mergeSha = out(git(run, root, ["rev-parse", "HEAD"]));
    await writeJob(state, { ...job, status: "integrated", integratedSha: mergeSha, verification: { status: verification, evidence: String(evidence).slice(0, 300), at: now() } });
  }
  const integrated = await readJob(state, job.jobId);
  const cleanup = await cleanupJob({ root, state, jobId: job.jobId, session, gatesPassed: true, persist: persist ? () => persist({ job: integrated, mergeSha: mergeSha || integrated.integratedSha }) : null, run, now });
  return { ok: true, jobId: job.jobId, branch: job.branch, into: job.into, mergeSha: mergeSha || job.integratedSha || null, parentJob: job.parentJob || null, cleanup };
}

// Finish interrupted cleanups of this Leader's integrated jobs. Idempotent.
export async function resumeCleanups({ root, state, session, run = defaultRun }) {
  const results = [];
  for (const job of await listJobs(state, { session })) {
    if (job.status === "integrated" && job.contextPersisted === true) results.push(await cleanupJob({ root, state, jobId: job.jobId, session, gatesPassed: true, run }));
  }
  return results;
}
