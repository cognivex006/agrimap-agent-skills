// CLI handlers for the ACG commands dispatched by agm-workspace.mjs:
// context, policy, decide, branch, deliver, integrate, project, local and spec.
// Audit logging stays in agm-workspace (passed in as ctx.appendLog).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { defaultRun } from "./run-command.mjs";
import { acknowledge, instructionChain, readRequired, resolveTargetRoots, scanBelow, worktreeFacts } from "./instruction-chain.mjs";
import { branchTypeOf, inferPolicy, initPolicy, loadPolicy, setPolicyValue } from "./workflow-policy.mjs";
import { integrateJob, planJob, resumeCleanups, startJob } from "./worktree-lifecycle.mjs";
import { recordChoice, renderCard, normalizeOptions, storeCard, validateCard } from "./decision-card.mjs";
import { applyBranch, applyDelivery, applyGather, applyIntegration, applyReleaseSync, dirtyInventory, integrationOptions, pendingWork, planBranch, planDelivery, planGather, planIntegration, planReleaseSync, releasePreflight, snapshotDirty } from "./git-flow.mjs";
import { applyProjectPatch, inferProject, initProject, loadProject, resolveSpecSources, setProjectValue, specStandingCard, verifySpecPath } from "./project-profile.mjs";
import { applySpecSync, coveredBy, planSpecSync, specCheck, specContext, specSemanticCard } from "./spec-sync.mjs";
import { addWorkingNote, loadLocalMemory, localPathsForLeakCheck, setLocalPath } from "./local-memory.mjs";
import { readJsonFile, readSessionState, safeSession, updateSessionState, writeJsonFile, writeSessionPointer } from "./session-state.mjs";
import { bangkokParts } from "./decision-records.mjs";
import { loadDecisionIndex, promotionCard, recall, recordSignal, savePreferences, loadPreferences } from "./decision-memory.mjs";

const toSlash = value => String(value || "").replaceAll("\\", "/");
const list = value => String(value === true ? "" : value || "").split(",").map(item => item.trim()).filter(Boolean);
const GOVERNANCE_DEFAULTS = Object.freeze({ workflowPolicy: true, delivery: true, decisionMemory: true, guards: true, projectMode: true, specSync: true });
const text = value => (value && value !== true ? String(value) : null);

async function governanceFlags(root) {
  const config = await readJsonFile(path.join(root, ".agrimap-agent", "config.json"));
  return { ...GOVERNANCE_DEFAULTS, ...(config?.governance || {}) };
}

async function readInput(file) {
  if (!file || file === true) return null;
  try { return JSON.parse(await readFile(path.resolve(String(file)), "utf8")); } catch (error) { throw Object.assign(new Error(`INPUT_UNREADABLE: ${error.message}`), { code: "INPUT_UNREADABLE" }); }
}

function cardResult(card) {
  const normalized = { ...card, options: normalizeOptions(card) };
  return { card, render: renderCard(normalized) };
}

// DP2/DP4: every stored card (git cards included) goes through recall and
// calibration first when governance.decisionMemory is on.
async function storeAndRender(state, session, card, executionId) {
  if (!session) return { ...cardResult(card), stored: false };
  const flags = await governanceFlags(path.dirname(state));
  const stored = await storeCard(state, session, card, { executionId, memory: flags.decisionMemory });
  if (stored.suppressed || stored.autoDecided) return { card, ...stored, stored: false, next: { action: "use-option", command: "apply the option and name the precedent or calibration under 'ตัดสินใจแทนไว้'" } };
  return stored.ok ? { card, cardId: stored.cardId, render: stored.render, stored: true, ...(stored.calibrationMode ? { calibrationMode: stored.calibrationMode } : {}) } : { card, ...stored };
}

// A spec repository written by spec sync has no execution of its own: it
// borrows the code repository's execution as `linkedExecution` in its session.
async function activeFor(ctx, state, session) {
  if (!session) return { active: null, activePath: null, save: null, linked: false };
  const activePath = ctx.activeTaskPath(state, session);
  const active = await readJsonFile(activePath);
  if (active) return { active, activePath, save: value => writeJsonFile(activePath, value), linked: false };
  const linked = (await readSessionState(state, session)).linkedExecution || null;
  return { active: linked, activePath: null, save: linked ? value => updateSessionState(state, session, { linkedExecution: value }) : null, linked: Boolean(linked) };
}

function dedupe(warnings) {
  const seen = new Set();
  return warnings.filter(item => {
    const key = `${item.code || item}|${item.subject || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function logForActive(ctx, state, active, event) {
  if (!active?.executionId || !active.requestedBy) return null;
  return ctx.appendLog(state, {
    executionId: active.executionId, taskId: active.taskId ?? null, requestedBy: active.requestedBy,
    requesterId: active.requesterId ?? null, identitySource: active.identitySource || "legacy-migrated",
    model: active.model || "unknown", modelLabel: active.modelLabel, role: active.role || "leader", agent: active.agent || "primary", provider: active.provider || "unknown",
    workflowDepth: active.workflowDepth || "light", artifactVersion: active.artifactVersion, risk: active.risk,
    files: [], verification: [], ...event,
  });
}

function requireGit(ctx, root) {
  return ctx.isGitRoot(root) ? null : { ok: false, code: "TARGET_NOT_GIT", message: "This command needs a Git repository; run context to resolve the target root." };
}

async function rootAck(root, session) {
  const chain = await instructionChain(root, []);
  return readRequired(root, session, chain);
}

// ------------------------------------------------------------------ context

// First context of a session in spec-first scope reports open spec drift once
// (bounded to 50 findings, 5 lines). Only `--ack` records that it ran.
async function firstSpecCheck(root, session, sessionCwd, { flags, project, covers, persist }) {
  const mode = project.profile?.developmentMode;
  if (!flags.specSync || !session || !project.validation?.ok || !(mode === "spec-first" || (mode === "hybrid" && covers))) return null;
  const state = path.join(root, ".agrimap-agent");
  if ((await readSessionState(state, session)).specCheckedAt) return null;
  const check = await specCheck({ root, sessionCwd, limit: 50 });
  if (persist) await updateSessionState(state, session, { specCheckedAt: new Date().toISOString() });
  return { count: check.findings.length, truncated: check.truncated, lines: check.lines };
}

async function contextCommand(ctx, args) {
  const sessionCwd = path.resolve(String(args.cwd || process.cwd()));
  const paths = list(args.paths);
  const session = safeSession(args.session);
  const resolution = await resolveTargetRoots({ sessionCwd, target: args.target && args.target !== true ? String(args.target) : null, paths, hint: args.hint, depth: args.depth });
  if (!resolution.ok) return { ...resolution, sessionCwd: toSlash(sessionCwd), next: { action: "ask", command: "ask the requester for the target repository path" } };
  const scan = resolution.scan || (resolution.cwdIsRepo ? null : await scanBelow(sessionCwd, { depth: Math.min(4, Number(args.depth) || 3) }));
  const strayStateRoots = (scan?.strayStateRoots || []).map(toSlash);
  const warnings = strayStateRoots.length ? ["STRAY_STATE_ROOT"] : [];
  if (!resolution.resolved) {
    if (args.ack) return { ok: false, code: "ACK_TARGET_REQUIRED", message: "No single target repository; pass --target <root> with --ack.", sessionCwd: toSlash(sessionCwd) };
    return {
      ok: true, resolved: false, reason: resolution.reason, sessionCwd: toSlash(sessionCwd), cwdIsRepo: false,
      repositories: (scan?.repositories || []).slice(0, 8).map(dir => toSlash(dir)), strayStateRoots, warnings,
      ...(resolution.card ? cardResult(resolution.card) : {}),
      next: resolution.card ? { action: "ask", command: "then context --target <chosen root> --session <id>" } : { action: "ask", command: "ask for the repository path" },
    };
  }
  if (args.ack && !(args.target || paths.length || resolution.cwdIsRepo)) return { ok: false, code: "ACK_TARGET_REQUIRED", message: "Pass --target <root> with --ack when the session cwd is outside a repository." };
  if (args.ack && !session) return { ok: false, code: "SESSION_REQUIRED", message: "--session is required with --ack." };
  const targets = [];
  for (const root of resolution.roots) {
    const relativePaths = paths.map(item => path.relative(root, path.resolve(sessionCwd, item)));
    let chain = await instructionChain(root, relativePaths);
    const flags = await governanceFlags(root);
    const localMemory = await loadLocalMemory(root);
    const project = await loadProject(root);
    const spec = flags.projectMode && project.exists ? await resolveSpecSources(root, sessionCwd, localMemory, { project }) : { sources: [], warnings: [], cards: [], discovered: [] };
    let acknowledged = null;
    if (args.ack) {
      const result = await acknowledge(root, session, list(args.ack), chain);
      if (!result.ok) return result;
      acknowledged = result.acknowledged;
      await ctx.ensureLayout(root, false);
      for (const item of spec.discovered) await setLocalPath(root, { kind: "spec", id: item.id, path: item.path, version: item.version, date: bangkokParts().date });
      chain = await instructionChain(root, relativePaths);
    }
    const required = await readRequired(root, session, chain);
    const facts = await worktreeFacts(root);
    const scopes = project.profile?.specs?.scopes || [];
    const covers = paths.length && scopes.length ? coveredBy(scopes, relativePaths).length > 0 : null;
    const policy = await loadPolicy(root);
    const openWarnings = await firstSpecCheck(root, session, sessionCwd, { flags, project, covers, persist: Boolean(args.ack) });
    targets.push({
      targetRoot: toSlash(root), isLinkedWorktree: facts.isLinkedWorktree, branch: facts.branch, stateRoot: toSlash(path.join(root, ".agrimap-agent")),
      chain: chain.map(({ path: _absolute, ...entry }) => entry), readRequired: required, acknowledged,
      policy: { exists: policy.exists, status: policy.status, valid: policy.validation?.ok ?? null },
      projectProfile: project.exists
        ? { exists: true, status: project.status, developmentMode: project.profile?.developmentMode || null, valid: project.validation?.ok ?? false, sources: spec.sources, coversChangedPaths: covers }
        : { exists: false, next: flags.projectMode ? "project infer" : "projectMode disabled: treat as code-first" },
      localMemory: { exists: localMemory.exists, path: localMemory.path, warnings: localMemory.warnings },
      warnings: [...localMemory.warnings, ...spec.warnings.map(item => item.code), ...(project.exists && !project.validation?.ok ? ["PROJECT_PROFILE_INVALID"] : [])],
      specWarnings: spec.warnings,
      ...(openWarnings ? { openWarnings } : {}),
      cards: spec.cards.map(card => cardResult(card)),
      next: required.length
        ? { action: "read-and-ack", files: required, command: `context --target "${toSlash(root)}" --session ${session || "<id>"} --ack ${chain.filter(entry => required.includes(entry.relative)).map(entry => entry.sha12).join(",")}` }
        : { action: "none" },
    });
  }
  const primary = targets[0];
  return {
    ok: true, resolved: true, via: resolution.via, sessionCwd: toSlash(sessionCwd), cwdIsRepo: resolution.cwdIsRepo,
    ...primary, warnings: [...warnings, ...primary.warnings], strayStateRoots,
    ...(targets.length > 1 ? { targets } : {}),
  };
}

// ------------------------------------------------------------------- policy

async function policyCommand(ctx, sub, args, root) {
  const state = path.join(root, ".agrimap-agent");
  if (sub === "show") return { ok: true, ...(await loadPolicy(root)) };
  const gitError = requireGit(ctx, root);
  if (gitError) return gitError;
  if (sub === "infer") return inferPolicy(root);
  const requestedBy = await ctx.resolveRequester(state, args);
  if (sub === "init") return initPolicy(root, String(args.profile || "gitflow"), await readInput(args.input) || {}, requestedBy);
  if (sub === "set") return setPolicyValue(root, args.key, args.value, requestedBy);
  return { ok: false, message: "Use policy show|infer|init|set." };
}

// ------------------------------------------------------------------ decide

async function decideCommand(ctx, sub, args, root) {
  const state = path.join(root, ".agrimap-agent");
  const session = safeSession(args.session);
  const { active } = await activeFor(ctx, state, session);
  if (sub === "card") {
    const card = await readInput(args.input);
    const validation = validateCard(card);
    if (!validation.ok) return { ok: false, ...validation };
    await ctx.ensureLayout(root, false);
    const flags = await governanceFlags(root);
    const stored = await storeCard(state, session, card, { executionId: active?.executionId || null, memory: flags.decisionMemory });
    return stored;
  }
  if (sub === "record") {
    const requestedBy = await ctx.resolveRequester(state, args);
    const result = await recordChoice(state, { session, cardId: args.card, choice: args.choice, note: args.note && args.note !== true ? String(args.note) : null, requestedBy });
    if (result.ok && !result.alreadyRecorded) {
      await logForActive(ctx, state, active, {
        event: "decision", milestone: "scope-decision", summary: `Card ${result.cardId}: ${result.label}`.slice(0, 240),
        reason: `${result.log.kind}/${result.log.topic} ${result.log.risk}; recommendedChosen=${result.recommendedChosen}`, files: (result.written || []).map(toSlash),
      });
    }
    return result;
  }
  if (sub === "correction") {
    const topic = text(args.topic);
    if (!topic || !text(args.to)) return { ok: false, code: "CORRECTION_INVALID", message: "decide correction needs --topic and --to." };
    const signal = await recordSignal(root, { kind: text(args.kind) || "convention", topic, risk: "R1", recommended: text(args.from), chosen: "correction", chosenValue: text(args.to), recommendedChosen: false, source: "correction", paths: list(args.paths) });
    return { ok: true, signal };
  }
  if (sub === "list") {
    const index = await loadDecisionIndex(root);
    const status = text(args.status);
    return { ok: true, decisions: index.entries.filter(entry => !status || entry.status === status).map(({ id, topic, kind, status: entryStatus, summary, date, file }) => ({ id, topic, kind, status: entryStatus, summary, date, file })) };
  }
  if (sub === "promote") {
    if (!text(args.topic) || !text(args.value)) return { ok: false, code: "PROMOTION_INVALID", message: "decide promote needs --topic and --value." };
    const sessionState = await readSessionState(state, session);
    if (sessionState.promotionOffered) return { ok: true, skipped: true, reason: "one promotion card per session" };
    const card = promotionCard({ topic: text(args.topic), value: text(args.value), count: Number(args.count) || 2, kind: text(args.kind) || "convention" });
    const stored = await storeAndRender(state, session, card, active?.executionId);
    if (stored.stored) await updateSessionState(state, session, { promotionOffered: stored.cardId });
    return { ok: true, ...stored };
  }
  if (sub === "always-ask") {
    const kinds = list(args.kind);
    if (!kinds.length) return { ok: false, code: "KIND_REQUIRED", message: "--kind <workflow|convention|…> is required." };
    const prefs = await loadPreferences(root);
    return { ok: true, preferences: await savePreferences(root, { alwaysAsk: [...prefs.alwaysAsk, ...kinds] }) };
  }
  return { ok: false, message: "Use decide card|record|correction|list|promote|always-ask." };
}

// ------------------------------------------------------------------- branch

async function branchCommand(ctx, sub, args, root) {
  const gitError = requireGit(ctx, root);
  if (gitError) return gitError;
  const state = path.join(root, ".agrimap-agent");
  const session = safeSession(args.session);
  const flags = await governanceFlags(root);
  if (!flags.workflowPolicy) return { ok: true, action: "skip", reason: "governance.workflowPolicy is false", commands: [] };
  const loaded = await loadPolicy(root);
  if (loaded.exists && !loaded.validation?.ok) return { ok: false, code: "POLICY_INVALID", details: loaded.validation?.details || [] };
  const { active, save } = await activeFor(ctx, state, session);
  // Orchestration (5.0.1): a parallel writer's job gets its own worktree.
  if (args.worktree) return jobBranchCommand(ctx, sub, args, { root, state, session, policy: loaded.policy, active, save });
  const options = { root, policy: loaded.policy, active, type: String(args.type || "feature"), slug: args.slug, ticket: args.ticket && args.ticket !== true ? args.ticket : null, mode: args.mode && args.mode !== true ? String(args.mode) : null };
  if (sub === "plan") {
    const plan = await planBranch(options);
    return plan.card ? { ...plan, ...(await storeAndRender(state, session, plan.card, active?.executionId)) } : plan;
  }
  if (sub === "apply") {
    if (options.mode === "stop") return { ok: true, action: "stopped", message: "The requester handles the working tree first." };
    const result = await applyBranch({ ...options, planHash: args["plan-hash"] });
    if (!result.ok) return result;
    const warnings = [...(result.warnings || [])];
    if (active && save) {
      Object.assign(active, result.record);
      await save(active);
      await logForActive(ctx, state, active, { event: "changed", milestone: "work-branch", summary: `Work branch ${result.record.branch} ready from ${result.record.base}@${String(result.record.baseSha).slice(0, 7)}`, reason: `branch action ${result.record.branchAction}` });
    } else warnings.push({ code: "NO_ACTIVE_EXECUTION", subject: "branch", fix: "start the execution so delivery can find this branch" });
    return { ...result, warnings };
  }
  return { ok: false, message: "Use branch plan|apply." };
}

// Job worktrees (5.0.1): plan is read-only; apply creates the worktree and records
// the job for its Leader session. Cleanup happens inside `integrate apply --job`.
async function jobBranchCommand(ctx, sub, args, { root, state, session, policy, active, save }) {
  if (!session) return { ok: false, code: "SESSION_REQUIRED", message: "A Leader --session owns every job." };
  const into = args.into && args.into !== true ? String(args.into) : null;
  const parentJob = args["parent-job"] && args["parent-job"] !== true ? String(args["parent-job"]) : null;
  const type = branchTypeOf(args.type || "feature") || "feature";
  if (sub === "plan") return planJob({ root, policy, slug: args.slug, type, into, parentJob });
  if (sub !== "apply") return { ok: false, message: "Use branch plan|apply --worktree." };
  await resumeCleanups({ root, state, session });
  const started = await startJob({ root, state, policy, slug: args.slug, type, into, parentJob, session, executionId: active?.executionId || null });
  if (!started.ok) return started;
  const { job } = started;
  if (active) {
    await logForActive(ctx, state, active, {
      event: "changed", milestone: "work-branch",
      summary: `Job ${job.jobId} worktree on ${job.branch} from ${job.into}@${job.baseSha.slice(0, 7)}${started.reworkOf ? ` (rework of ${started.reworkOf})` : ""}`.slice(0, 240),
      reason: `job=${job.jobId}; parent=${job.parentJob || "none"}; branch=${job.branch}`,
    });
    if (save) await save({ ...active, jobs: [...new Set([...(active.jobs || []), job.jobId])] });
  }
  return { ok: true, job: { ...job, directory: job.directory.replaceAll("\\", "/") }, reworkOf: started.reworkOf, next: { action: "dispatch", detail: "Give the subagent the worktree path, branch and job rules; integrate with integrate apply --job after verification." } };
}

async function integrateJobCommand(ctx, args, { root, state, session, active }) {
  if (!session) return { ok: false, code: "SESSION_REQUIRED", message: "The Leader --session integrates its jobs." };
  const jobId = String(args.job);
  const verification = args.verification && args.verification !== true ? String(args.verification) : null;
  const evidence = args.evidence && args.evidence !== true ? String(args.evidence) : "";
  // Durable job context goes to the Leader execution's audit log before cleanup.
  const persist = async ({ job, mergeSha }) => {
    if (!active?.executionId) throw new Error("No active Leader execution to record the job in; start one, then integrate again.");
    await logForActive(ctx, state, active, {
      event: "integrated",
      summary: `Job ${job.jobId} (${job.branch}) integrated into ${job.into}`.slice(0, 240),
      reason: `job=${job.jobId}; parent=${job.parentJob || "none"}; base=${String(job.baseSha).slice(0, 7)}; mergeSha=${String(mergeSha || "none").slice(0, 12)}`,
      verification: [String(evidence || "verified by Leader").slice(0, 300)],
    });
  };
  return integrateJob({ root, state, jobId, session, verification, evidence, persist });
}

// ------------------------------------------------------------------ deliver

// Precondition 7 input: whether this delivery is under a spec (spec-first, or
// hybrid/standing-sync with changed files in scope or spec items read).
function specGate(project, active, dirtyPaths, specNa) {
  if (!project.exists || !project.validation?.ok) return null;
  const profile = project.profile;
  const mode = profile.developmentMode;
  const sync = profile.specs?.sync || (mode === "code-first" ? "off" : "auto");
  if (sync === "off") return { required: false, line: mode === "code-first" ? "- Spec: ไม่เกี่ยว (code-first)" : "- Spec: ไม่เกี่ยว (specs.sync off)" };
  const covered = coveredBy(profile.specs?.scopes, dirtyPaths).length > 0;
  if (!(mode === "spec-first" || covered || active?.spec?.items?.length)) return { required: false, line: "- Spec: ไม่เกี่ยว (นอก scope ของ spec)" };
  const synced = Boolean(active?.specSync?.appliedAt);
  return {
    required: true, synced, specNa, enforcement: profile.specs?.enforcement || "warn", attempted: Boolean(active?.specSyncAttempt), items: active?.spec?.items || [],
    line: synced ? active.specSync.specLine : specNa ? `- Spec: ไม่เกี่ยว (${specNa})` : "- Spec: ยังไม่ sync (SPEC_NOT_SYNCED)",
    warnings: (synced ? active.specSync.warnings : active?.specSyncAttempt?.warnings) || [],
  };
}

function notGitWarnings(project, localMemory) {
  const warnings = [];
  for (const source of project.profile?.specs?.sources || []) {
    if (source.kind !== "external") continue;
    const remembered = localMemory?.specs?.find(item => item.id === source.id);
    if (remembered && !defaultRun("git", ["rev-parse", "--show-toplevel"], { cwd: path.resolve(remembered.path) }).ok) {
      warnings.push({ code: "SPEC_SOURCE_NOT_GIT", subject: source.id, fix: "spec edits stay on this machine until the pack moves into its own Git repository (spec §19.21)" });
    }
  }
  return warnings;
}

async function deliverCommand(ctx, sub, args, root) {
  const gitError = requireGit(ctx, root);
  if (gitError) return gitError;
  const state = path.join(root, ".agrimap-agent");
  const session = safeSession(args.session);
  const { active, save, linked } = await activeFor(ctx, state, session);
  const loaded = await loadPolicy(root);
  const flags = await governanceFlags(root);
  const localMemory = await loadLocalMemory(root);
  const localPaths = localPathsForLeakCheck(localMemory);
  const bodyFallback = active && !linked ? await ctx.executionSummaries(state, active.executionId) : [];
  const project = flags.projectMode && flags.specSync && !linked ? await loadProject(root) : { exists: false };
  const specNa = text(args["spec-na"]);
  const options = {
    root, policy: loaded.validation?.ok ? loaded.policy : null, active, ackRequired: await rootAck(root, session),
    explicit: text(args.explicit), input: await readInput(args.input), changelogNa: text(args["changelog-na"]),
    mixed: text(args.mixed), allowSecretPaths: list(args["allow-secret-paths"]), excludePaths: list(args["exclude-paths"]),
    localPaths, bodyFallback, governance: flags, spec: specGate(project, active, dirtyInventory(root).map(entry => entry.path), specNa),
  };
  const policyWarnings = loaded.exists && !loaded.validation?.ok ? [{ code: "POLICY_INVALID", subject: "workflow.json", fix: "fix the policy; delivery is not automatic meanwhile" }] : [];
  policyWarnings.push(...notGitWarnings(project, localMemory));
  const sessionState = await readSessionState(state, session);
  const commits = result => [
    ...(result?.commit ? [{ root: linked ? `spec:${active.sourceId}` : "code", commit: result.commit, remoteVerified: Boolean(result.remoteVerified) }] : []),
    ...Object.values(sessionState.specDeliveries || {}).filter(item => item.executionId === active?.executionId).map(item => ({ root: `spec:${item.sourceId}`, commit: item.commit, remoteVerified: item.remoteVerified })),
  ];
  if (sub === "plan") {
    const plan = await planDelivery(options);
    const withWarnings = { ...plan, warnings: dedupe([...policyWarnings, ...(plan.warnings || [])]) };
    if (!plan.ok && !loaded.exists && linked) withWarnings.next = { action: "run", command: `policy infer --cwd "${toSlash(root)}" (spec repository has no workflow policy), or deliver with --explicit commit|push` };
    return plan.card ? { ...withWarnings, ...(await storeAndRender(state, session, plan.card, active?.executionId)) } : withWarnings;
  }
  if (sub === "apply") {
    const applied = await applyDelivery({ ...options, planHash: args["plan-hash"], pushOnly: Boolean(args["push-only"]) });
    if (!applied.ok) return applied;
    const result = { ...applied, warnings: dedupe([...policyWarnings, ...(applied.warnings || [])]) };
    const delivery = { commit: result.commit, remoteSha: result.remoteSha, pushedAt: result.pushed ? new Date().toISOString() : null };
    Object.assign(active, { delivery });
    await save(active);
    if (linked && active.sourceRoot) {
      const sourceState = path.join(active.sourceRoot, ".agrimap-agent");
      const current = (await readSessionState(sourceState, session)).specDeliveries || {};
      await updateSessionState(sourceState, session, { specDeliveries: { ...current, [active.sourceId]: { executionId: active.executionId, sourceId: active.sourceId, commit: result.commit, remoteVerified: Boolean(result.remoteVerified), branch: result.branch } } });
    }
    result.commits = commits(result);
    const lastDelivery = {
      executionId: active.executionId, taskId: active.taskId ?? null, objective: active.objective, branch: result.branch, remoteBranch: result.remoteBranch,
      base: active.base || null, workType: active.workType || null, commit: result.commit, remoteSha: result.remoteSha, remoteVerified: result.remoteVerified,
      header: result.header, files: result.files, verification: result.verification, warnings: result.warnings, preexistingDirty: active.preexistingDirty || [],
      identity: { requestedBy: active.requestedBy, requesterId: active.requesterId ?? null, identitySource: active.identitySource, model: active.model, modelLabel: active.modelLabel, role: active.role, agent: active.agent, provider: active.provider, workflowDepth: active.workflowDepth, artifactVersion: active.artifactVersion, risk: active.risk },
      deliveredAt: new Date().toISOString(),
    };
    await updateSessionState(state, session, { lastDelivery });
    await logForActive(ctx, state, active, {
      event: "delivered", summary: `Delivered ${result.branch} @${String(result.commit).slice(0, 7)}${result.remoteVerified ? " (remote verified)" : ""}`,
      reason: `branch=${result.branch}; remoteBranch=${result.remoteBranch}; commit=${result.commit}; remoteVerified=${result.remoteVerified}`,
      files: result.files, warnings: result.warnings,
    });
    if (!linked) await ctx.appendRecent(state, active, "delivered", `${result.branch} @${String(result.commit).slice(0, 7)}`);
    return result;
  }
  return { ok: false, message: "Use deliver plan|apply." };
}

// ---------------------------------------------------------------- integrate

async function integrateCommand(ctx, sub, args, root) {
  const gitError = requireGit(ctx, root);
  if (gitError) return gitError;
  const state = path.join(root, ".agrimap-agent");
  const session = safeSession(args.session);
  const { active } = await activeFor(ctx, state, session);
  const sessionState = await readSessionState(state, session);
  const delivery = sessionState.lastDelivery || (active?.delivery ? { ...active, ...active.delivery, executionId: active.executionId } : null);
  const loaded = await loadPolicy(root);
  const policy = loaded.validation?.ok ? loaded.policy : null;
  // Finish any interrupted job cleanup of this Leader first (5.0.1); idempotent.
  if (session) await resumeCleanups({ root, state, session });
  if (args.job && args.job !== true) {
    if (sub !== "apply") return { ok: false, message: "Use integrate apply --job <id> --verification passed --evidence <checks>." };
    return integrateJobCommand(ctx, args, { root, state, session, active });
  }
  if (sub === "options") {
    const result = await integrationOptions({ root, policy, delivery });
    if (!result.ok) return result;
    return { ...result, ...(await storeAndRender(state, session, result.card, delivery?.executionId)) };
  }
  // Release M (4.9.6): finished work branches into the local integration branch.
  if (sub === "pending") return pendingWork({ root, policy, target: text(args.target) });
  if (sub === "gather") {
    const gather = { root, policy, target: text(args.target), mode: text(args.mode), include: list(args.branches), exclude: list(args.exclude), scope: text(args.scope) || "release", sessionBranches: [delivery?.branch, active?.branch].filter(Boolean) };
    if (args._action === "plan") {
      const plan = await planGather(gather);
      return plan.card ? { ...plan, ...(await storeAndRender(state, session, plan.card, active?.executionId)) } : plan;
    }
    if (args._action !== "apply") return { ok: false, message: "Use integrate gather plan|apply." };
    const result = await applyGather({ ...gather, planHash: text(args["plan-hash"]) });
    if (!result.ok) return result.card ? { ...result, ...(await storeAndRender(state, session, result.card, active?.executionId)) } : result;
    if (active && result.merged.length) {
      await logForActive(ctx, state, active, {
        event: "integrated", summary: `Gathered ${result.merged.length} work branches into local ${result.target}`,
        reason: result.merged.map(item => `${item.name}@${item.sha.slice(0, 7)}`).join("; ").slice(0, 400), warnings: result.warnings,
      });
    }
    return result;
  }
  const options = {
    root, state, policy, active, delivery, intent: String(args.intent || "integrate"), branch: args.branch && args.branch !== true ? String(args.branch) : null,
    target: args.target && args.target !== true ? String(args.target) : null, whenGreen: Boolean(args["when-green"]), confirmUnverified: Boolean(args["confirm-unverified"]),
    confirmTarget: Boolean(args["confirm-target"]), choice: args.choice && args.choice !== true ? String(args.choice) : null, ackRequired: await rootAck(root, session),
  };
  if (sub === "plan") {
    const plan = await planIntegration(options);
    return plan.card ? { ...plan, ...(await storeAndRender(state, session, plan.card, delivery?.executionId)) } : plan;
  }
  if (sub !== "apply") return { ok: false, message: "Use integrate options|plan|apply|pending|gather." };
  const result = await applyIntegration({ ...options, planHash: args["plan-hash"], stage: args.stage && args.stage !== true ? String(args.stage) : null });
  if (!result.ok) return result.card ? { ...result, ...(await storeAndRender(state, session, result.card, delivery?.executionId)) } : result;
  if (options.intent === "park" && active) await ctx.appendRecent(state, active, "parked", "Work branch parked; resume with the same session.");
  const integrated = result.intent === "integrate" && (result.mergeSha || result.pr) && !result.stage;
  if (integrated) {
    const identity = delivery?.identity || active || {};
    await logForActive(ctx, state, { ...identity, executionId: delivery?.executionId || active?.executionId, taskId: delivery?.taskId ?? active?.taskId ?? null }, {
      event: "integrated", summary: `Integrated ${result.source || delivery?.branch} into ${result.target || ""}${result.autoMerge ? " (auto-merge enabled)" : ""}`.slice(0, 240),
      reason: `method=${result.method || "pull-request"}; pr=${result.pr?.url || result.pr?.number || "none"}; mergeSha=${result.mergeSha || "pending"}; remoteVerified=${Boolean(result.remoteVerified)}`,
      warnings: result.warnings,
    });
    await updateSessionState(state, session, { lastCard: undefined, lastDelivery: delivery ? { ...delivery, integrated: { target: result.target, mergeSha: result.mergeSha || null, pr: result.pr || null, at: new Date().toISOString() } } : undefined });
    const rule = policy?.integration?.deleteBranchAfterMerge || "ask";
    if (rule === "ask" && result.remoteVerified) {
      const card = {
        kind: "integration", topic: "git/delete-branch", risk: "R3", confidence: "high",
        question: `ลบ branch ${result.source} หลัง merge ไหม`, impact: "branch ที่ merge แล้วไม่จำเป็นต้องเก็บ",
        checked: [`${result.target} มี ${String(result.sourceSha || "").slice(0, 7)} แล้ว`],
        options: [
          { id: "1", label: "ลบทั้ง local และ remote", effect: "integrate plan --intent abandon --choice both", value: "both" },
          { id: "2", label: "เก็บไว้", effect: "ไม่ลบอะไร", value: "keep" },
        ],
        recommended: "1", recommendedReason: "merge แล้ว", blocking: true, default: null, recordAs: "none", paths: [], expiresHours: 24,
      };
      return { ...result, ...(await storeAndRender(state, session, card, delivery?.executionId)) };
    }
    if (rule === "always" && result.method === "local-merge") {
      const current = defaultRun("git", ["branch", "--show-current"], { cwd: root }).stdout.trim();
      if (current === result.source) return { ...result, deletedBranch: false, warnings: [...(result.warnings || []), { code: "BRANCH_CHECKED_OUT", subject: result.source, fix: "switch away, then integrate plan --intent abandon --choice both" }] };
      defaultRun("git", ["branch", "-d", result.source], { cwd: root });
      defaultRun("git", ["push", "origin", "--delete", delivery?.remoteBranch || result.source], { cwd: root });
      return { ...result, deletedBranch: true };
    }
  }
  return result;
}

// ------------------------------------------------------------------ release

// 4.9.8: R preflight (read-only, one question round) and the history-preserving
// develop sync used at R and again right before the D push (AGENTS.release.md §6.5).
async function releaseCommand(ctx, sub, args, root) {
  const gitError = requireGit(ctx, root);
  if (gitError) return gitError;
  const state = path.join(root, ".agrimap-agent");
  const session = safeSession(args.session);
  const { active } = await activeFor(ctx, state, session);
  const loaded = await loadPolicy(root);
  const policy = loaded.validation?.ok ? loaded.policy : null;
  const lastDelivery = (await readSessionState(state, session)).lastDelivery;
  if (sub === "preflight") {
    const result = await releasePreflight({ root, policy, include: list(args.branches), sessionBranches: [lastDelivery?.branch, active?.branch].filter(Boolean) });
    const cards = [];
    for (const card of result.questions || []) cards.push(await storeAndRender(state, session, card, active?.executionId));
    return cards.length ? { ...result, cards } : result;
  }
  if (sub !== "sync") return { ok: false, message: "Use release preflight|sync plan|sync apply." };
  const options = { root };
  if (args._action === "plan") {
    const plan = await planReleaseSync(options);
    return plan.card ? { ...plan, ...(await storeAndRender(state, session, plan.card, active?.executionId)) } : plan;
  }
  if (args._action !== "apply") return { ok: false, message: "Use release sync plan|apply." };
  const result = await applyReleaseSync({ ...options, planHash: text(args["plan-hash"]) });
  if (result.ok && active && result.merged.length) {
    await logForActive(ctx, state, active, {
      event: "integrated", summary: `Synced local develop with ${result.merged.map(item => item.ref).join(", ")}`.slice(0, 240),
      reason: result.merged.map(item => `${item.ref}@${item.sha.slice(0, 7)} -> ${item.mergeSha.slice(0, 7)} (${item.changed} files)`).join("; ").slice(0, 400),
    });
  }
  return result;
}

// ------------------------------------------------------------------ project

async function projectCommand(ctx, sub, args, root) {
  const state = path.join(root, ".agrimap-agent");
  if (sub === "show") return { ok: true, ...(await loadProject(root)) };
  const gitError = requireGit(ctx, root);
  if (gitError) return gitError;
  if (sub === "infer") return inferProject(root, { sessionCwd: args["session-cwd"] && args["session-cwd"] !== true ? String(args["session-cwd"]) : null });
  if (sub === "init") {
    const overrides = await readInput(args.input) || {};
    if (args.inferred) {
      const inferred = await inferProject(root);
      return initProject(root, String(args.mode || inferred.proposal.developmentMode), overrides, null, { inferred: true, inference: inferred.proposal.inference || { confidence: inferred.confidence, evidence: inferred.evidence, at: bangkokParts().date } });
    }
    return initProject(root, String(args.mode || ""), overrides, await ctx.resolveRequester(state, args));
  }
  if (sub === "set") return setProjectValue(root, args.key, args.value, await ctx.resolveRequester(state, args));
  return { ok: false, message: "Use project show|infer|init|set." };
}

// -------------------------------------------------------------------- local

async function localCommand(ctx, sub, args, root) {
  const gitError = requireGit(ctx, root);
  if (gitError) return gitError;
  if (sub === "show") return { ok: true, ...(await loadLocalMemory(root)) };
  if (sub === "set-path") {
    const kind = String(args.kind || "spec");
    const id = String(args.id || "");
    const target = args.path && args.path !== true ? String(args.path) : "";
    let version = null;
    if (kind === "spec") {
      const check = await verifySpecPath(root, id, target);
      if (!check.ok) return check;
      version = check.version;
    }
    try { return { ok: true, ...(await setLocalPath(root, { kind, id, path: target, version, date: bangkokParts().date })) }; } catch (error) { return { ok: false, code: error.message }; }
  }
  if (sub === "note") {
    try { return { ok: true, ...(await addWorkingNote(root, { text: args.text, date: bangkokParts().date })) }; } catch (error) { return { ok: false, code: error.message }; }
  }
  return { ok: false, message: "Use local show|set-path|note." };
}

// --------------------------------------------------------------------- spec

async function pendingSemanticCards(state, active) {
  const pending = [];
  for (const cardId of active?.specPendingCards || []) {
    const card = await readJsonFile(path.join(state, "runtime", "cards", `${safeSession(cardId)}.json`));
    if (card && card.status !== "closed") pending.push({ cardId });
  }
  return pending;
}

// The first write of spec sync into a separate spec repository links this
// execution there, with that repository's dirty files snapshotted first.
async function linkSpecRoots(ctx, root, session, active, sources) {
  const linkedRoots = [];
  for (const source of sources.filter(item => item.kind === "external" && item.git)) {
    const top = defaultRun("git", ["rev-parse", "--show-toplevel"], { cwd: path.resolve(source.dir) });
    if (!top.ok) continue;
    const specRoot = path.resolve(top.stdout.trim());
    const specState = path.join(specRoot, ".agrimap-agent");
    const current = (await readSessionState(specState, session)).linkedExecution;
    if (current?.executionId !== active.executionId) {
      const { delivery: _delivery, branch: _branch, remoteBranch: _remote, base: _base, baseSha: _sha, spec: _spec, specSync: _sync, specSyncAttempt: _attempt, preexistingDirty: _pre, ...identity } = active;
      await updateSessionState(specState, session, {
        linkedExecution: { ...identity, workType: "docs", sourceRoot: root, sourceId: source.id, preexistingDirty: await snapshotDirty(specRoot), linkedAt: new Date().toISOString() },
      });
      await writeSessionPointer(session, [root, specRoot]);
    }
    linkedRoots.push({ id: source.id, root: toSlash(specRoot) });
  }
  if (linkedRoots.length) {
    const state = path.join(root, ".agrimap-agent");
    const byRoot = (await readSessionState(state, session)).activeByRoot || {};
    for (const item of linkedRoots) byRoot[item.root] = { executionId: active.executionId, sourceId: item.id };
    await updateSessionState(state, session, { activeByRoot: byRoot });
  }
  return linkedRoots;
}

async function specCommand(ctx, sub, args, root) {
  const gitError = requireGit(ctx, root);
  if (gitError) return gitError;
  const flags = await governanceFlags(root);
  if (!flags.specSync) return { ok: true, skipped: true, reason: "governance.specSync is false: no spec read/sync gate" };
  const state = path.join(root, ".agrimap-agent");
  const session = safeSession(args.session);
  const sessionCwd = text(args["session-cwd"]) || root;
  const { active, save } = await activeFor(ctx, state, session);
  if (sub === "context") {
    const result = await specContext({ root, sessionCwd, tasks: list(args.tasks), query: text(args.query) || "", paths: list(args.paths) });
    if (result.ok && active && save) { active.spec = result.record; await save(active); }
    return result;
  }
  if (sub === "check") return specCheck({ root, sessionCwd, source: text(args.source), limit: Math.min(200, Number(args.limit) || 50) });
  // Owner answer Q-4.7.0-03: no card. A one-off spec instruction in code-first
  // becomes the standing rule at once and is reported as decided for you.
  if (sub === "standing") {
    const project = await loadProject(root);
    const card = specStandingCard({ profile: project.profile, paths: list(args.paths) });
    const every = card.options.find(option => option.id === "1");
    const result = await applyProjectPatch(root, every.value, await ctx.resolveRequester(state, args));
    if (!result.ok) return result;
    return { ok: true, applied: every.value, written: result.written, decidedForYou: `อัปเดต spec ให้ทุกงานแล้ว (${every.effect}) — เปลี่ยนได้โดยบอก "ไม่ต้องแตะ spec" (project set specs.sync off)` };
  }
  if (sub === "semantic") {
    const card = specSemanticCard({ ids: list(args.tasks), finding: text(args.finding) || "", evidence: list(args.evidence) });
    const stored = await storeAndRender(state, session, card, active?.executionId);
    if (active && save && stored.cardId) { active.specPendingCards = [...new Set([...(active.specPendingCards || []), stored.cardId])]; await save(active); }
    return { ok: true, ...stored };
  }
  if (sub !== "sync") return { ok: false, message: "Use spec context|sync plan|sync apply|check|standing|semantic." };
  const action = text(args._action) || (args["plan-hash"] ? "apply" : "plan");
  const project = await loadProject(root);
  const sync = project.profile?.specs?.sync || (project.profile?.developmentMode === "code-first" ? "off" : "auto");
  if (sync === "off" && !args.once) {
    return { ok: false, code: "SPEC_SYNC_OFF", message: "This project does not edit specs unless asked. When the requester asked this time, pass --once and ask `spec standing` once.", next: { action: "run", command: "spec sync plan --once …, then spec standing" } };
  }
  const options = {
    root, sessionCwd, active, tasks: list(args.tasks), status: text(args.status), evidence: [].concat(args.evidence && args.evidence !== true ? String(args.evidence).split(/,(?=[A-Z][A-Z0-9-]*\d=)/) : []),
    deviation: text(args.deviation), date: bangkokParts().date, pendingCards: await pendingSemanticCards(state, active),
  };
  if (action === "plan") {
    const plan = await planSpecSync(options);
    const parseProblem = !plan.ok ? plan.code !== "EVIDENCE_PATH_INVALID" && plan.code !== "STATUS_SEMANTIC_INVALID" : !plan.files.length && plan.warnings.some(item => /PARSE_FAILED|FILE_MISSING|NOT_FOUND/.test(item.code));
    if (parseProblem && active && save) {
      active.specSyncAttempt = { at: new Date().toISOString(), code: plan.code || "SPEC_SYNC_INCOMPLETE", warnings: dedupe([...(plan.warnings || []), { code: "SPEC_NOT_SYNCED", subject: plan.code || "spec", fix: "fix the warning, then spec sync plan again" }]) };
      await save(active);
    }
    return plan.ok ? { ...plan, warnings: dedupe(plan.warnings) } : plan;
  }
  if (action !== "apply") return { ok: false, message: "Use spec sync plan|apply." };
  if (!active?.executionId) return { ok: false, code: "NO_ACTIVE_EXECUTION", message: "Start the execution first so the sync is attributed.", next: { action: "run", command: "start" } };
  const preview = await planSpecSync(options);
  if (!preview.ok) return preview;
  const writesExternal = preview.files.some(file => file.kind === "external");
  const linkedRoots = writesExternal && preview.planHash === args["plan-hash"] ? await linkSpecRoots(ctx, root, session, active, preview.sources) : [];
  const result = await applySpecSync({ ...options, planHash: text(args["plan-hash"]) });
  if (!result.ok) return result;
  active.specSync = { appliedAt: result.appliedAt, files: result.files.map(file => `${file.source}:${file.file}`), items: result.updated.map(item => item.id), specLine: result.specLine, warnings: dedupe(result.warnings) };
  delete active.specSyncAttempt;
  await save(active);
  await logForActive(ctx, state, active, {
    event: "changed", milestone: "spec-sync", summary: `Spec sync: ${result.specLine.replace(/^- Spec: /, "")}`.slice(0, 240),
    reason: `sources=${[...new Set(result.files.map(file => file.source))].join(",") || "none"}; files=${result.files.length}`, files: [...result.files.map(file => (file.kind === "repo" ? file.path : `spec:${file.source}/${file.file}`)), ...(result.decisionRef ? [result.decisionRef] : [])],
    warnings: active.specSync.warnings,
  });
  return { ...result, warnings: dedupe(result.warnings), linkedRoots, next: linkedRoots.length ? { action: "run", command: `deliver plan --cwd <each linked root> --session ${session}, then deliver the code repository` } : { action: "run", command: "deliver plan" } };
}

// ------------------------------------------------------------------- recall

async function recallCommand(ctx, sub, args, root) {
  const flags = await governanceFlags(root);
  if (!flags.decisionMemory) return { ok: true, skipped: true, reason: "governance.decisionMemory is false", matches: [] };
  const config = await readJsonFile(path.join(root, ".agrimap-agent", "config.json"));
  return recall({ root, topic: text(args.topic), paths: list(args.paths), kind: text(args.kind), limit: Number(args.limit) || 5, learning: config?.learning || {} });
}

export const GOVERNANCE_COMMANDS = Object.freeze(["context", "policy", "decide", "branch", "deliver", "integrate", "release", "project", "local", "spec", "recall"]);

export async function runGovernanceCommand(command, sub, args, root, ctx) {
  try {
    if (command === "context") return await contextCommand(ctx, args);
    const handlers = { policy: policyCommand, decide: decideCommand, branch: branchCommand, deliver: deliverCommand, integrate: integrateCommand, release: releaseCommand, project: projectCommand, local: localCommand, spec: specCommand, recall: recallCommand };
    return await handlers[command](ctx, sub, args, root);
  } catch (error) {
    return { ok: false, code: error.code || "COMMAND_FAILED", message: String(error.message || error) };
  }
}
