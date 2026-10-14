#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { appendRecord as appendFile, writeRecord as writeFile, redactValue } from './sensitive-recording.mjs';
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs } from "./cli-args.mjs";
import {
  confirmationExpiry,
  DEFAULT_CONFIRMATION_HOURS,
  IDENTITY_SCHEMA_VERSION,
  isIdentitySource,
  localAuditMetadata,
  readConfirmedIdentity,
} from "./identity.mjs";
import { isLogEvent, logEventError, MILESTONE_TYPES, QA_FAILED_EVENT } from "./log-events.mjs";
import { loadTaskArtifactSchema } from "./task-artifact-schema.mjs";
import { selectWorkflow, instructionProfile } from './governance-policy.mjs';
import { applyBootstrap } from './project-bootstrap.mjs';
import { ensureStateIgnore } from './local-memory.mjs';
import { snapshotDirty } from './git-flow.mjs';
import { instructionChain, readRequired } from './instruction-chain.mjs';
import { GOVERNANCE_COMMANDS, runGovernanceCommand } from './governance-commands.mjs';
import { GOVERNANCE_SESSION_FIELDS, readSessionState } from './session-state.mjs';
import { gitPlace, listPending, mergeSavepoint, parseSavepoint, renderSavepoint, savepointItems } from './savepoint.mjs';

const AUDIT_SCHEMA_VERSION = 4;
const SUPPORTED_AUDIT_SCHEMA_VERSIONS = new Set([1, 2, 3, AUDIT_SCHEMA_VERSION]);
const TERMINAL_AUDIT_EVENTS = new Set([QA_FAILED_EVENT, "blocked", "cancelled", "completed"]);
const TASK_WORKFLOW_DEPTHS = new Set(["standard", "regulated"]);
const LOG_TYPES = new Set(["request", "action", "decision", "verification", "result", "error"]);
const DEFAULT_PROJECT_TIME_ZONE = "Asia/Bangkok";
const CHECKPOINT_FIELD_BUDGETS = Object.freeze({
  summary: 240,
  reason: 400,
  concerns: 400,
  verificationItems: 8,
  verificationItem: 300,
});
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const taskArtifactSchema = await loadTaskArtifactSchema(skillRoot);
const TRACKED_WORKFLOW_DEPTHS = new Set(taskArtifactSchema.workflowDepths || ["light", "standard", "regulated"]);
const completionTemplateTokenNames = new Set();
for (const definition of Object.values(taskArtifactSchema.artifacts || {})) {
  const template = await readFile(path.join(skillRoot, "assets", "templates", definition.template), "utf8");
  for (const token of template.match(/\{\{[^{}\r\n]+\}\}/g) || []) {
    completionTemplateTokenNames.add(token.slice(2, -2).trim());
  }
}

function workspaceRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return path.resolve(cwd);
  }
}

function safeSessionId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function safeTaskId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function firstValue(...values) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function executionIdentity(args = {}, fallback = {}) {
  const role = firstValue(args.role, fallback.role, "leader");
  return {
    model: firstValue(args.model, args.modelName, args["model-name"], fallback.model, "unknown"),
    modelLabel: firstValue(args.modelLabel, args["model-label"], fallback.modelLabel, "not-configured"),
    role,
    agent: firstValue(args.agent, args.agentName, args["agent-name"], fallback.agent, role === "leader" ? "primary" : role),
    provider: firstValue(args.provider, fallback.provider, "unknown"),
  };
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function renderAssetTemplate(fileName, replacements = {}) {
  let content = await readFile(path.join(skillRoot, "assets", "templates", fileName), "utf8");
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(`{{${key}}}`, String(value));
  }
  return content.endsWith("\n") ? content : `${content}\n`;
}

async function renderTaskArtifact(artifactName, replacements = {}) {
  const definition = taskArtifactSchema.artifacts?.[artifactName];
  if (!definition?.template) throw new Error(`Task artifact schema is missing a template for ${artifactName}.`);
  return renderAssetTemplate(definition.template, replacements);
}

function now() {
  return new Date().toISOString();
}

function zonedParts(timestamp = now(), timeZone = DEFAULT_PROJECT_TIME_ZONE) {
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
    year: value.year,
    month: value.month,
    day: value.day,
    hour: value.hour,
    minute: value.minute,
    second: value.second,
    period: `${value.year}-${value.month}`,
    date: `${value.year}-${value.month}-${value.day}`,
    runId: `${value.day}${value.hour}${value.minute}${value.second}`,
  };
}

async function workspaceConfig(state) {
  return readJson(path.join(state, "config.json")).catch(() => ({}));
}

function stateRelative(state, filePath) {
  return path.relative(state, filePath).replace(/\\/g, "/");
}

function executionSlug(active = {}) {
  return taskSubjectSlug(active.slug || active.objective || active.operation || "work") || "work";
}

function activeMemoryPaths(state, active = {}) {
  const executionId = safeTaskId(active.executionId || active.taskId);
  const period = String(active.period || "").trim();
  const slug = executionSlug(active);
  const current = active.currentMemoryPath
    ? path.join(state, active.currentMemoryPath)
    : period && executionId
      ? path.join(state, "memory", "current", period, `${executionId}-${slug}.md`)
      : path.join(state, "memory", "current", `${executionId}.md`);
  const recent = active.recentMemoryPath
    ? path.join(state, active.recentMemoryPath)
    : period && executionId
      ? path.join(state, "memory", "recent", period, `${executionId}-${slug}.md`)
      : path.join(state, "memory", "recent", `${executionId}.md`);
  return { current, recent };
}

async function findExecutionMemoryPath(state, tier, executionId, period, explicitPath = "") {
  if (explicitPath) {
    const explicit = path.join(state, explicitPath);
    if (await exists(explicit)) return explicit;
  }
  if (period) {
    const directory = path.join(state, "memory", tier, period);
    const match = (await readdir(directory).catch(() => []))
      .filter((name) => name === `${executionId}.md` || (name.startsWith(`${executionId}-`) && name.endsWith(".md")))
      .sort()[0];
    if (match) return path.join(directory, match);
  }
  const legacy = path.join(state, "memory", tier, `${executionId}.md`);
  return await exists(legacy) ? legacy : null;
}

async function findTaskPath(state, taskId, active = {}) {
  if (!taskId) return null;
  if (active.taskPath) {
    const explicit = path.join(state, active.taskPath);
    if (await exists(explicit)) return explicit;
  }
  const period = String(active.period || "").trim();
  const candidates = [
    ...(period ? [
      path.join(state, "tasks", period, taskId),
      path.join(state, "tasks", "complete", period, taskId),
      path.join(state, "tasks", "cancelled", period, taskId),
    ] : []),
    path.join(state, "tasks", taskId),
  ];
  for (const candidate of candidates) if (await exists(candidate)) return candidate;
  for (const bucket of ["", "complete", "cancelled"]) {
    const root = bucket ? path.join(state, "tasks", bucket) : path.join(state, "tasks");
    for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || !/^\d{4}-\d{2}$/.test(entry.name)) continue;
      const candidate = path.join(root, entry.name, taskId);
      if (await exists(candidate)) return candidate;
    }
  }
  return null;
}

// ddHHmmss has one-second resolution. A generated ID that collides moves to the
// next free second (bootstrap AGENTS.md §9.2); an explicit ID never changes.
async function reserveExecutionId(state, preferredId, timestamp, timeZone) {
  if (preferredId) return reserveExecutionIdOnce(state, preferredId, timestamp, timeZone);
  const base = new Date(timestamp).getTime();
  let result;
  for (let offset = 0; offset < 60; offset += 1) {
    result = await reserveExecutionIdOnce(state, null, new Date(base + offset * 1000).toISOString(), timeZone);
    if (result.ok || result.code !== "RUN_ID_COLLISION") return result;
  }
  return result;
}

async function reserveExecutionIdOnce(state, preferredId, timestamp, timeZone) {
  const parts = zonedParts(timestamp, timeZone);
  const executionId = safeTaskId(preferredId || parts.runId);
  const reservation = path.join(state, "runtime", "reservations", parts.period, executionId);
  try {
    await mkdir(reservation, { recursive: false });
  } catch (error) {
    if (error?.code === "ENOENT") {
      await mkdir(path.dirname(reservation), { recursive: true });
      try {
        await mkdir(reservation, { recursive: false });
      } catch (nested) {
        if (nested?.code === "EEXIST") return { ok: false, code: "RUN_ID_COLLISION", executionId, period: parts.period };
        throw nested;
      }
    } else if (error?.code === "EEXIST") {
      return { ok: false, code: "RUN_ID_COLLISION", executionId, period: parts.period };
    } else {
      throw error;
    }
  }
  return { ok: true, executionId, period: parts.period, localDate: parts.date, reservation };
}

function confirmationHours(value) {
  if (!Number(value)) return 0;
  return Math.min(168, Math.max(1, Number(value) || DEFAULT_CONFIRMATION_HOURS));
}

function taskSubjectSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 5)
    .join("-")
    .slice(0, 60);
}

function defaultTaskId(operation, subject) {
  return `${now().replace(/[-:TZ.]/g, "").slice(0, 14)}-${taskSubjectSlug(subject) || operation || "task"}`;
}

async function ensureLayout(root, bootstrap = false) {
  const state = path.join(root, ".agrimap-agent");
  // Runtime events must not initialize a project or populate unused directories.
  await mkdir(state, { recursive: true });
  if (!bootstrap) {
    await ensureStateIgnore(state);
    return state;
  }
  const directories = [
    "decisions",
    "knowledge",
    "knowledge/drafts/sql",
    "logs",
    "memory/current",
    "memory/recent",
    "prompts",
    "instructions",
    "reports",
    "policy",
    "runtime/active",
    "runtime/sessions",
    "runtime/reservations",
  ];
  await Promise.all(directories.map((directory) => mkdir(path.join(state, directory), { recursive: true })));

  await ensureStateIgnore(state);

  const configPath = path.join(state, "config.json");
  const existingConfig = await readJson(configPath).catch(() => ({}));
  const nextConfig = {
      ...existingConfig,
      schemaVersion: 2,
      stateScope: "target-project",
      installDirectoryWrites: false,
      aiGateway: "disabled",
      retentionDays: Number(existingConfig.retentionDays) || 30,
      trackConciseLogs: true,
      timeZone: existingConfig.timeZone || DEFAULT_PROJECT_TIME_ZONE,
      activation: {
        auto: existingConfig.activation?.auto === true,
      },
      identity: {
        mode: "confirmed-user-workspace",
        runtimePath: ".agrimap-agent/runtime/sessions",
        confirmationHours: DEFAULT_CONFIRMATION_HOURS,
        gitRequesterSuggestion: true,
      },
      memory: {
        projectPath: ".agrimap-agent/memory/project.md",
        currentTaskPath: ".agrimap-agent/memory/current/YYYY-MM/<run-id>-<slug>.md",
        recentPath: ".agrimap-agent/memory/recent/YYYY-MM/<run-id>-<slug>.md",
        // Completed work is read from history and recent memory; appending it to
        // project.md made every work branch conflict.
        completedWorkInProjectMd: existingConfig.memory?.completedWorkInProjectMd === true,
      },
      logs: {
        mode: "per-execution",
        path: ".agrimap-agent/logs/YYYY-MM/YYYY-MM-DD/<execution-id>.jsonl",
      },
      governance: {
        workflowPolicy: true,
        delivery: true,
        decisionMemory: true,
        guards: true,
        projectMode: true,
        specSync: true,
        ...(existingConfig.governance || {}),
        // 4.6.0 wrote specSync:false as an unused default; 4.7.0 turns it on once.
        ...(existingConfig.governance?.specSync === false && !existingConfig.governance?.specSyncDefault ? { specSync: true } : {}),
        specSyncDefault: "4.7.0",
        // Same for the decisionMemory:false default written before 4.8.0.
        ...(existingConfig.governance?.decisionMemory === false && !existingConfig.governance?.decisionMemoryDefault ? { decisionMemory: true } : {}),
        decisionMemoryDefault: "4.8.0",
        // Same for the guards:false default written before 4.9.0.
        ...(existingConfig.governance?.guards === false && !existingConfig.governance?.guardsDefault ? { guards: true } : {}),
        guardsDefault: "4.9.0",
      },
      tasks: {
        activePath: ".agrimap-agent/tasks/YYYY-MM/<task-id>",
        completePath: ".agrimap-agent/tasks/complete/YYYY-MM/<task-id>",
        cancelledPath: ".agrimap-agent/tasks/cancelled/YYYY-MM/<task-id>",
      },
      prompts: {
        mode: "conversation-raw-and-versioned-results",
        rawHistoryPath: ".agrimap-agent/prompts/YYYY-MM/<conversation-id>/history.md",
        resultPath: ".agrimap-agent/prompts/YYYY-MM/<conversation-id>/<context>-vNNN.md",
        aiAnswersInRawHistory: false,
      },
      instructions: { path: ".agrimap-agent/instructions/YYYY-MM/<task-id>" },
      reports: { path: ".agrimap-agent/reports/YYYY-MM/<run-id>-<context>.md" },
      skip: {
        directories: [".git", "bin", "obj", "node_modules", "dist", "coverage"],
        extensions: [".dll", ".exe", ".pdb", ".so", ".dylib", ".class"],
      },
    };
  if (JSON.stringify(existingConfig) !== JSON.stringify(nextConfig)) await writeJson(configPath, nextConfig);

  const memoryPath = path.join(state, "memory", "project.md");
  if (!(await exists(memoryPath))) {
    await writeFile(memoryPath, "# Project memory\n\n- No durable project context recorded.\n", "utf8");
  }

  for (const file of ["index.jsonl", "frontend-reuse.jsonl"]) {
    const indexPath = path.join(state, "knowledge", file);
    if (!(await exists(indexPath))) await writeFile(indexPath, "", "utf8");
  }
  const serviceOwnershipPath = path.join(state, "knowledge", "service-ownership.yaml");
  if (!(await exists(serviceOwnershipPath))) {
    await writeFile(
      serviceOwnershipPath,
      "schema_version: 1\nsource_of_trust: .agrimap-agent/knowledge/service-ownership.yaml\nupdated_at: null\nupdated_by: null\nservices: []\n",
      "utf8",
    );
  }

  const referenceLibrary = {
    "db-schema": "# db-schema references\n\nOwner-provided database DDL: tables, views, and procedures (for example `TABLE_ORDER.sql`, `UM_USER_Q.sql`).\n\nAgents load matching files here as `FACT` before any SQL or data-touching work and must never infer a table, column, type, key, or constraint that is not present in a loaded reference. If the needed schema is missing, the agent names it and asks instead of guessing.\n\nBackend work that only calls a stored procedure is data-touching work: load the procedure file, then the tables and lookups it reads or writes, and trace `THROW` codes back to the validation gate and column that raised them before explaining a failure.\n",
    "api-contracts": "# api-contracts references\n\nOpenAPI/Swagger documents, `.proto` files, and representative request/response samples.\n\nAgents load matching contracts here as `FACT` for integration and cross-service work instead of inferring payload shapes.\n",
    docs: "# docs references\n\nBusiness and domain documents: requirements, business rules, glossaries, and process notes.\n\nAgents treat requester-supplied documents and decision-owner-approved references as `FACT` only with evidence pointers for scope and acceptance decisions.\n",
    design: "# design references\n\nDesign tokens, brand identity, and UI guidelines.\n\nAgents load these as `FACT` for design-affecting work and never invent a new visual language while a loaded token or identity answers the question. When this folder is empty, agents fall back to tokens already present in the codebase and record `missing-owner-example`.\n",
  };
  for (const [directory, readme] of Object.entries(referenceLibrary)) {
    const referencePath = path.join(state, "knowledge", "references", directory);
    await mkdir(referencePath, { recursive: true });
    const readmePath = path.join(referencePath, "README.md");
    if (!(await exists(readmePath))) await writeFile(readmePath, readme, "utf8");
  }
  const sqlDraftReadmePath = path.join(state, "knowledge", "drafts", "sql", "README.md");
  if (!(await exists(sqlDraftReadmePath))) {
    await writeFile(
      sqlDraftReadmePath,
      "# SQL drafts\n\nAI-generated or exploratory SQL stored here is tentative, non-authoritative, and not a deployable product artifact. Organize drafts below one domain directory when an explicit `output_owner=knowledge-draft` decision authorizes the write.\n\nAgents must never load this directory as schema `FACT`, caller compatibility evidence, or deployed behavior. Promote content to `.agrimap-agent/knowledge/references/db-schema/` only after the decision owner explicitly approves it as a reference; preserve the approved evidence pointer.\n",
      "utf8",
    );
  }
  return state;
}

function sessionIdentityPath(state, sessionId) {
  return path.join(state, "runtime", "sessions", `${safeSessionId(sessionId)}.json`);
}

function activeTaskPath(state, sessionId) {
  return path.join(state, "runtime", "active", `${safeSessionId(sessionId)}.json`);
}

async function identify(state, args) {
  const sessionId = safeSessionId(args.session);
  const requestedBy = String(args.requestedBy || args["requested-by"] || args.owner || "").trim();
  if (!sessionId || !requestedBy) {
    return { ok: false, needsSession: !sessionId, needsRequester: !requestedBy, message: "--session and --requested-by are required (--owner remains a legacy alias)." };
  }
  const identitySource = String(args.source || args.identitySource || args["identity-source"] || "manual-confirmed").trim();
  if (!isIdentitySource(identitySource) || identitySource === "legacy-migrated") {
    return { ok: false, code: "INVALID_IDENTITY_SOURCE", message: "--source must be manual-confirmed or git-config-confirmed." };
  }
  const config = await readJson(path.join(state, "config.json")).catch(() => ({}));
  const hours = confirmationHours(args.confirmationHours || args["confirmation-hours"] || config?.identity?.confirmationHours);
  const confirmedAt = now();
  const identity = {
    schemaVersion: IDENTITY_SCHEMA_VERSION,
    sessionId,
    requestedBy,
    requesterId: String(args.requesterId || args["requester-id"] || "").trim() || null,
    identitySource,
    confirmedAt,
    expiresAt: confirmationExpiry(confirmedAt, hours),
    ...executionIdentity(args),
    ...localAuditMetadata(),
    updatedAt: confirmedAt,
  };
  // Preserve governance fields (acks, cards, delivery) stored in the same file.
  const previous = await readJson(sessionIdentityPath(state, sessionId)).catch(() => ({}));
  const preserved = Object.fromEntries(GOVERNANCE_SESSION_FIELDS.filter((key) => previous?.[key] !== undefined).map((key) => [key, previous[key]]));
  await writeJson(sessionIdentityPath(state, sessionId), { ...identity, ...preserved });
  const local = localAuditMetadata();
  const userKey = safeSessionId(`${local.machine}-${local.osUser}`);
  await writeJson(path.join(state, 'runtime', 'users', `${userKey}.json`), identity);
  return { ok: true, identity };
}

async function sessionIdentity(state, sessionId, defaultProvider = "unknown") {
  if (!sessionId) return null;
  return readConfirmedIdentity(state, sessionId, {defaultProvider});
}

function gitRequesterSuggestion(root) {
  try {
    const requestedBy = execFileSync("git", ["config", "--get", "user.name"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return requestedBy ? { requestedBy, source: "git-config-unconfirmed" } : null;
  } catch {
    return null;
  }
}

async function resolveRequester(state, args) {
  const explicit = String(args.requestedBy || args["requested-by"] || args.owner || "").trim();
  if (explicit) return explicit;
  const sessionId = safeSessionId(args.session);
  if (!sessionId) return null;
  try {
    const identity = await sessionIdentity(state, sessionId, args.provider);
    return identity && !identity.expired ? identity.requestedBy : null;
  } catch {
    return null;
  }
}

async function gitStatus(root) {
  try {
    return execFileSync("git", ["status", "--short"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function gitOutput(root, args, options = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "ignore"],
        input: options.input,
      }).trim(),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error?.stdout || "").trim(),
    };
  }
}

function gitAuditSnapshot(root) {
  const repository = gitOutput(root, ["rev-parse", "--is-inside-work-tree"]);
  if (!repository.ok || repository.stdout !== "true") return { gitHead: null, gitDirty: null };
  const head = gitOutput(root, ["rev-parse", "HEAD"]);
  const status = gitOutput(root, ["status", "--porcelain=v1"]);
  return {
    gitHead: head.ok && /^[0-9a-f]{40,64}$/i.test(head.stdout) ? head.stdout : null,
    gitDirty: status.ok ? Boolean(status.stdout) : null,
  };
}

function auditSchemaVersion(event) {
  return Number(event?.schema_version ?? event?.schemaVersion);
}

function normalizeAuditEvent(event = {}) {
  if (auditSchemaVersion(event) >= 4 || Object.hasOwn(event, "execution_id")) {
    return {
      schemaVersion: auditSchemaVersion(event),
      timestamp: event.timestamp,
      executionId: event.execution_id,
      taskId: event.task_id ?? null,
      requestedBy: event.requester,
      requesterId: event.requester_id ?? null,
      identitySource: event.identity_source,
      model: event.model,
      modelLabel: event.model_label ?? "not-configured",
      role: event.role,
      agent: event.agent,
      provider: event.provider,
      workflowDepth: event.workflow_depth,
      artifactVersion: event.artifact_version,
      verificationStatus: event.verification_status,
      risk: event.risk,
      event: event.event,
      milestone: event.milestone,
      logType: event.log_type,
      summary: event.message,
      message: event.message,
      reason: event.reason,
      request: event.request,
      files: event.files,
      verification: event.verification,
      gitHead: event.git_head ?? null,
      gitDirty: event.git_dirty ?? null,
      precedents: event.precedents ?? [],
      questionsAvoided: event.questions_avoided ?? 0,
    };
  }
  return { ...event, executionId: event.executionId || event.taskId, logType: event.logType || null };
}

function auditEventIssues(rawEvent) {
  const issues = [];
  const schemaVersion = auditSchemaVersion(rawEvent);
  if (!SUPPORTED_AUDIT_SCHEMA_VERSIONS.has(schemaVersion)) {
    issues.push({ field: schemaVersion >= 4 ? "schema_version" : "schemaVersion", reason: "unsupported" });
  }
  const event = normalizeAuditEvent(rawEvent);
  if (schemaVersion >= 4) {
    const requiredFields = ["timestamp", "executionId", "requestedBy", "identitySource", "model", "role", "agent", "provider", "workflowDepth", "event", "logType", "message", "reason"];
    for (const field of requiredFields) if (!String(event[field] || "").trim()) issues.push({ field, reason: "missing" });
    if (event.workflowDepth !== "light" && !String(event.taskId || "").trim()) issues.push({ field: "task_id", reason: "required-for-tracked-depth" });
    if (event.workflowDepth === "light" && event.taskId !== null) issues.push({ field: "task_id", reason: "must-be-null-for-light" });
    if (!LOG_TYPES.has(event.logType)) issues.push({ field: "log_type", reason: "invalid" });
  }
  const requiredFields = ["timestamp", "taskId", "requestedBy", "identitySource", "model", "role", "agent", "provider", "event", "summary", "reason"];
  if (schemaVersion < 4) for (const field of requiredFields) if (!String(event[field] || "").trim()) issues.push({ field, reason: "missing" });
  if (!Number.isFinite(Date.parse(event.timestamp)) || new Date(event.timestamp).toISOString() !== event.timestamp) {
    issues.push({ field: "timestamp", reason: "must-be-iso-utc" });
  }
  if (!isLogEvent(event.event)) issues.push({ field: "event", reason: "invalid" });
  if (!isIdentitySource(event.identitySource)) issues.push({ field: "identitySource", reason: "invalid" });
  if (event.event === "created" && !String(event.request || "").trim()) {
    issues.push({ field: "request", reason: "missing-on-created-event" });
  }
  if (schemaVersion >= 3) {
    if (!TRACKED_WORKFLOW_DEPTHS.has(String(event.workflowDepth || "").toLowerCase())) {
      issues.push({ field: "workflowDepth", reason: "missing-or-invalid" });
    }
    const milestoneEvents = new Set(["changed", "verified", "decision", "qa-finding"]);
    if (milestoneEvents.has(event.event) && !MILESTONE_TYPES.includes(event.milestone)) {
      issues.push({ field: "milestone", reason: "missing-or-invalid" });
    }
    if (!milestoneEvents.has(event.event) && event.milestone !== undefined) {
      issues.push({ field: "milestone", reason: "forbidden-on-created-or-terminal-event" });
    }
  }
  if (!Array.isArray(event.files)) issues.push({ field: "files", reason: "must-be-array" });
  else if (schemaVersion >= 2) {
    if (event.files.some((file) => typeof file !== "string" || !file.trim())) {
      issues.push({ field: "files", reason: "must-contain-nonblank-paths" });
    }
    if (event.event === "changed" && event.milestone !== "work-branch" && !event.files.some((file) => typeof file === "string" && file.trim())) {
      issues.push({ field: "files", reason: "required-on-changed-event" });
    }
  }
  if (!Array.isArray(event.verification)) issues.push({ field: "verification", reason: "must-be-array" });
  if (schemaVersion >= 2 && schemaVersion < 4 && !Object.hasOwn(rawEvent, "gitHead")) issues.push({ field: "gitHead", reason: "missing" });
  if (schemaVersion >= 2 && schemaVersion < 4 && !Object.hasOwn(rawEvent, "gitDirty")) issues.push({ field: "gitDirty", reason: "missing" });
  if (schemaVersion >= 4 && !Object.hasOwn(rawEvent, "git_head")) issues.push({ field: "git_head", reason: "missing" });
  if (schemaVersion >= 4 && !Object.hasOwn(rawEvent, "git_dirty")) issues.push({ field: "git_dirty", reason: "missing" });
  if (event.gitHead !== null && event.gitHead !== undefined && !/^[0-9a-f]{40,64}$/i.test(String(event.gitHead))) {
    issues.push({ field: "gitHead", reason: "invalid" });
  }
  if (event.gitDirty !== null && event.gitDirty !== undefined && typeof event.gitDirty !== "boolean") {
    issues.push({ field: "gitDirty", reason: "must-be-boolean-or-null" });
  }
  return issues;
}

async function appendLog(state, event) {
  if (!isLogEvent(event.event)) {
    const error = new TypeError(logEventError(event.event).message);
    error.code = "INVALID_LOG_EVENT";
    throw error;
  }
  const { machine: _machine, osUser: _osUser, ...trackableEvent } = event;
  const timestamp = now();
  const gitSnapshot = gitAuditSnapshot(path.dirname(state));
  const config = await workspaceConfig(state);
  const local = zonedParts(timestamp, config.timeZone || DEFAULT_PROJECT_TIME_ZONE);
  const logType = trackableEvent.logType
    || (trackableEvent.event === "created" ? "request"
      : trackableEvent.event === "decision" ? "decision"
        : trackableEvent.event === "verified" ? "verification"
          : TERMINAL_AUDIT_EVENTS.has(trackableEvent.event) ? "result"
            : trackableEvent.event === "qa-finding" ? "error" : "action");
  const record = {
    schema_version: AUDIT_SCHEMA_VERSION,
    timestamp,
    execution_id: trackableEvent.executionId || trackableEvent.taskId,
    task_id: trackableEvent.workflowDepth === "light" ? null : trackableEvent.taskId,
    workflow_depth: trackableEvent.workflowDepth,
    ...(trackableEvent.artifactVersion ? {artifact_version:trackableEvent.artifactVersion} : {}),
    ...(trackableEvent.verificationStatus ? {verification_status:trackableEvent.verificationStatus} : {}),
    ...(trackableEvent.risk ? {risk:trackableEvent.risk} : {}),
    requester: trackableEvent.requestedBy,
    requester_id: trackableEvent.requesterId ?? null,
    identity_source: trackableEvent.identitySource,
    model: trackableEvent.model,
    model_label: trackableEvent.modelLabel || "not-configured",
    role: trackableEvent.role,
    agent: trackableEvent.agent,
    provider: trackableEvent.provider,
    event: trackableEvent.event,
    ...(trackableEvent.milestone ? { milestone: trackableEvent.milestone } : {}),
    log_type: logType,
    message: trackableEvent.summary,
    reason: trackableEvent.reason,
    ...(trackableEvent.request ? { request: trackableEvent.request } : {}),
    files: trackableEvent.files || [],
    verification: trackableEvent.verification || [],
    ...(Array.isArray(trackableEvent.warnings) && trackableEvent.warnings.length ? { warnings: trackableEvent.warnings.map((item) => typeof item === "string" ? { code: item } : item) } : {}),
    ...(Array.isArray(trackableEvent.precedents) && trackableEvent.precedents.length ? { precedents: trackableEvent.precedents } : {}),
    ...(Number(trackableEvent.questionsAvoided) > 0 ? { questions_avoided: Number(trackableEvent.questionsAvoided) } : {}),
    git_head: gitSnapshot.gitHead,
    git_dirty: gitSnapshot.gitDirty,
  };
  const issues = auditEventIssues(record);
  if (issues.length > 0) {
    const error = new TypeError(`Audit event is incomplete: ${issues.map((issue) => `${issue.field}:${issue.reason}`).join(", ")}`);
    error.code = "INVALID_AUDIT_EVENT";
    error.issues = issues;
    throw error;
  }
  // One file per execution per day: parallel work branches never append to the
  // same file, so merging them cannot conflict. Readers are recursive.
  const directory = path.join(state, "logs", local.period, local.date);
  await mkdir(directory, { recursive: true });
  const executionFile = safeTaskId(record.execution_id) || `_session-${safeSessionId(trackableEvent.sessionId).slice(0, 8) || "unknown"}`;
  const logPath = path.join(directory, `${executionFile}.jsonl`);
  const lockPath = `${logPath}.lock`;
  let lock = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      lock = await open(lockPath, "wx");
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  if (!lock) throw new Error(`Could not acquire audit log lock: ${stateRelative(state, lockPath)}`);
  try {
    await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
  return stateRelative(state, logPath);
}

async function init(root, args) {
  const bootstrap = args.bootstrap ? await applyBootstrap({ target: root, kind: args.kind }) : null;
  if (bootstrap && !bootstrap.ok) return { ok: false, code: 'BOOTSTRAP_CONFLICT', entries: bootstrap.entries.map(({content,...entry}) => entry) };
  const state = await ensureLayout(root, true);
  let identity = null;
  if (args.session && (args.requestedBy || args["requested-by"] || args.owner)) {
    const result = await identify(state, args);
    if (!result.ok) return result;
    identity = result.identity;
  } else if (args.session) {
    identity = await sessionIdentity(state, safeSessionId(args.session), args.provider);
  }
  const needsRequester = !identity?.requestedBy || identity.expired;
  return {
    ok: true,
    root,
    state,
    identity,
    needsRequester,
    bootstrap: bootstrap ? { applied: true, version: bootstrap.version } : null,
    suggestedRequester: needsRequester ? gitRequesterSuggestion(root) : null,
  };
}

async function start(root, args) {
  const operation = String(args.operation || "task").trim().toLowerCase();
  let selection;
  try {
    selection = selectWorkflow({ operation, action: args.action, tracking: Boolean(args.tracking), risk: args.risk, depth: args.depth || args['workflow-depth'], persist: Boolean(args.persist) });
  } catch (error) { return { ok: false, code: error.message }; }
  if (!selection.depth) return { ok: true, started: false, workflowDepth: null, reason: selection.reason };
  const state = await ensureLayout(root);
  const config = await workspaceConfig(state);
  const workflowDepth = selection.depth;
  if (!TRACKED_WORKFLOW_DEPTHS.has(workflowDepth)) {
    return { ok: false, code: "INVALID_WORKFLOW_DEPTH", message: "--depth must be light, standard, or regulated when starting task state." };
  }
  const sessionId = safeSessionId(args.session);
  if (!sessionId) {
    return { ok: false, needsSession: true, message: "A stable --session is required so concurrent project users do not collide." };
  }
  const objective = String(args.title || args.objective || "").trim();
  if (!objective) {
    return { ok: false, code: "REQUEST_OBJECTIVE_REQUIRED", needsObjective: true, message: "--title or --objective is required so the durable audit can record what was requested." };
  }

  if (args.owner || args.requestedBy || args['requested-by']) {
    const identity = await identify(state, args);
    if (!identity.ok) return identity;
  }
  const confirmedIdentity = await sessionIdentity(state, sessionId, args.provider);
  if (!confirmedIdentity || confirmedIdentity.expired) {
    return {
      ok: false,
      needsRequester: true,
      identityExpired: Boolean(confirmedIdentity?.expired),
      lastRequester: confirmedIdentity?.requestedBy || null,
      suggestedRequester: gitRequesterSuggestion(root),
      message: confirmedIdentity?.expired
        ? "No usable local confirmation remains. Reuse a confirmed requester from the current conversation via --requested-by; ask once only if that evidence is also missing or conflicting."
        : "No local requester confirmation found. Reuse confirmed conversation identity via --requested-by before asking the human once.",
    };
  }
  const requestedBy = confirmedIdentity.requestedBy;
  const execution = executionIdentity(args, confirmedIdentity);

  const activePath = activeTaskPath(state, sessionId);
  if (await exists(activePath)) {
    return { ok: false, activeTask: await readJson(activePath), message: "This session already has an active task." };
  }
  // Snapshot before this command writes anything: delivery never stages these.
  const inGit = gitOutput(root, ["rev-parse", "--is-inside-work-tree"]).stdout === "true";
  const preexistingDirty = inGit ? await snapshotDirty(root) : [];
  const startWarnings = inGit && (await readRequired(root, sessionId, await instructionChain(root, []))).length ? ["INSTRUCTIONS_UNACKNOWLEDGED"] : [];

  const startedAt = now();
  const reservation = await reserveExecutionId(
    state,
    args.execution || args["execution-id"] || args.task,
    startedAt,
    config.timeZone || DEFAULT_PROJECT_TIME_ZONE,
  );
  if (!reservation.ok) {
    return {
      ok: false,
      ...reservation,
      message: "The project-local ddHHmmss execution ID is already reserved. Retry with a new second; never merge two runs.",
    };
  }
  const executionId = reservation.executionId;
  const taskId = TASK_WORKFLOW_DEPTHS.has(workflowDepth) ? executionId : null;
  const slug = taskSubjectSlug(args.subject || objective) || operation || "work";
  // 5.0.1: v3 tracked work keeps its state in the savepoint (memory/current), not
  // tasks/<id>/task.md; only an explicit legacy run still gets a task directory.
  const taskPath = taskId && args['legacy-artifacts'] ? path.join(state, "tasks", reservation.period, taskId) : null;
  if (taskId && await findTaskPath(state, taskId)) {
    await rm(reservation.reservation, { recursive: true, force: true });
    return {
      ok: false,
      code: "TASK_ID_EXISTS",
      taskId,
      message: "This task ID already has tracked artifacts. Retry with a new execution ID so requester and request history cannot be mixed.",
    };
  }
  if (taskPath) await mkdir(taskPath, { recursive: true });

  const scaffoldReplacements = {
    "brief.md": {
      task_id: taskId,
      requested_by: requestedBy,
      requester_id_or_not_recorded: confirmedIdentity.requesterId || "Not recorded",
      identity_source: confirmedIdentity.identitySource,
      requester_authority: args.requesterAuthority || args["requester-authority"] || "unknown",
      decision_owner_or_not_required: args.decisionOwner || args["decision-owner"] || "unresolved",
      authority_evidence_or_not_required: args.authorityEvidence || args["authority-evidence"] || "unresolved",
      session_id: sessionId,
      model_label_or_not_configured: execution.modelLabel,
      actual_model_or_unknown: execution.model,
      role: execution.role,
      agent_name: execution.agent,
      provider: execution.provider,
      operation,
      workflow_depth: workflowDepth,
      objective,
      scope: String(args.scope || objective).trim(),
      non_goals: String(args.nonGoals || args["non-goals"] || "No additional work outside the stated objective.").trim(),
      target_kind: String(args.targetKind || args["target-kind"] || "general").trim(),
      backend_profile: String(args.backendProfile || args["backend-profile"] || "not-applicable").trim(),
      logic_impact: String(args.logicImpact || args["logic-impact"] || "authorized-by-request").trim(),
      workspace_mode: String(args.workspaceMode || args["workspace-mode"] || "current-worktree").trim(),
      integration_owner: String(args.integrationOwner || args["integration-owner"] || requestedBy).trim(),
      branch_name: String(args.branch || "current").trim(),
      file_ownership: String(args.fileOwnership || args["file-ownership"] || "Leader owns the files required by the approved scope.").trim(),
      input_manifest: String(args.inputs || objective).trim(),
      approved_decisions: String(args.decisions || "Execute only the approved objective and preserve unrelated behavior.").trim(),
      service_ids_from_canonical_ownership_file_or_not_applicable: String(args.services || "Not applicable.").trim(),
      open_concerns: String(args.concerns || "None recorded at task start.").trim(),
    },
    "checklists.md": { task_id: taskId },
  };
  if (taskPath && args['legacy-artifacts']) {
    for (const artifactName of taskArtifactSchema.scaffoldOrder || []) {
      const requiredForDepths = taskArtifactSchema.artifacts?.[artifactName]?.requiredForDepths || [];
      if (!requiredForDepths.includes(workflowDepth)) continue;
      const artifactPath = path.join(taskPath, artifactName);
      if (!(await exists(artifactPath))) {
        await writeFile(artifactPath, await renderTaskArtifact(artifactName, scaffoldReplacements[artifactName] || {}), "utf8");
      }
    }
  }

  const active = {
    artifactVersion: args['legacy-artifacts'] ? 2 : 3,
    depthReason: selection.reason,
    risk: args.risk || '',
    instructionProfile: instructionProfile({ taskProfile: args.profile }).profile,
    reportRequested: Boolean(args.report),
    executionId,
    runId: executionId,
    taskId,
    period: reservation.period,
    localDate: reservation.localDate,
    slug,
    operation,
    workflowDepth,
    objective,
    sessionId,
    requestedBy,
    requesterId: confirmedIdentity.requesterId,
    identitySource: confirmedIdentity.identitySource,
    requesterAuthority: scaffoldReplacements["brief.md"].requester_authority,
    decisionOwner: scaffoldReplacements["brief.md"].decision_owner_or_not_required,
    authorityEvidence: scaffoldReplacements["brief.md"].authority_evidence_or_not_required,
    ...execution,
    startedAt,
    taskPath: taskPath ? stateRelative(state, taskPath) : null,
    currentMemoryPath: `memory/current/${reservation.period}/${executionId}-${slug}.md`,
    recentMemoryPath: `memory/recent/${reservation.period}/${executionId}-${slug}.md`,
    preexistingDirty,
  };
  await writeJson(activePath, active);
  const memoryPaths = activeMemoryPaths(state, active);
  await mkdir(path.dirname(memoryPaths.current), { recursive: true });
  await mkdir(path.dirname(memoryPaths.recent), { recursive: true });
  await writeFile(
    memoryPaths.current,
    renderSavepoint({
      ...execution,
      executionId,
      taskId,
      workflowDepth,
      requestedBy,
      objective,
      status: "started",
      session: sessionId,
      branch: gitPlace(root),
      updated: startedAt,
      done: [],
      remaining: savepointItems(args.remaining || args.acceptance || ""),
      next: String(args.next || "").trim() || null,
      decisions: [],
      checkpoint: { milestone: "started", at: startedAt, summary: objective },
    }),
    "utf8",
  );
  await writeFile(
    memoryPaths.recent,
    `# Recent execution journal\n\n- Execution ID: \`${executionId}\`\n- Task ID: ${taskId ? `\`${taskId}\`` : "not-applicable"}\n- Workflow depth: \`${workflowDepth}\`\n- Requested by: ${requestedBy}\n- Request: ${objective}\n- Source status: current and valid at ${startedAt}\n\n## Events\n\n- ${startedAt} · started · ${objective}\n`,
    "utf8",
  );
  await appendLog(state, {
    executionId,
    taskId,
    requestedBy,
    requesterId: confirmedIdentity.requesterId,
    identitySource: confirmedIdentity.identitySource,
    ...execution,
    workflowDepth,
    event: "created",
    artifactVersion: active.artifactVersion,
    risk: active.risk,
    summary: `Started ${operation} task.`,
    request: objective,
    reason: objective,
    files: [],
    verification: [],
  });

  const dirty = await gitStatus(root);
  return {
    ok: true,
    activeTask: active,
    warnings: startWarnings,
    commitReminder: dirty ? "Preserve unrelated working-copy changes; current scope remains authoritative." : null,
  };
}

function listValue(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function compactCheckpointText(value, maximum) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1)}…`;
}

function compactVerification(values) {
  return values
    .slice(0, CHECKPOINT_FIELD_BUDGETS.verificationItems)
    .map((value) => compactCheckpointText(value, CHECKPOINT_FIELD_BUDGETS.verificationItem));
}

async function checkpoint(root, args) {
  const executionId = safeTaskId(args.execution || args["execution-id"] || args.task);
  const rawSummary = String(args.summary || "").trim();
  const summary = compactCheckpointText(rawSummary, CHECKPOINT_FIELD_BUDGETS.summary);
  if (!executionId || !rawSummary) return { ok: false, message: "--execution (or compatibility --task) and --summary are required." };
  const event = String(args.event || "changed").trim();
  if (!isLogEvent(event)) return logEventError(event);
  if (event === "created" || TERMINAL_AUDIT_EVENTS.has(event)) {
    return { ok: false, code: "CHECKPOINT_EVENT_NOT_MILESTONE", message: "start owns created; complete|close owns terminal events. checkpoint accepts only durable intermediate milestones." };
  }
  const defaultMilestone = event === "decision"
    ? "scope-decision"
    : event === "verified" || event === "qa-finding"
      ? "verification-gate"
      : "acceptance-slice";
  const milestone = String(args.milestone || defaultMilestone).trim().toLowerCase();
  const allowedMilestonesByEvent = {
    changed: new Set(["acceptance-slice", "integration"]),
    decision: new Set(["scope-decision"]),
    verified: new Set(["verification-gate"]),
    "qa-finding": new Set(["verification-gate"]),
  };
  if (!MILESTONE_TYPES.includes(milestone) || !allowedMilestonesByEvent[event]?.has(milestone)) {
    return { ok: false, code: "INVALID_MILESTONE", message: `--milestone must match event ${event}: ${[...(allowedMilestonesByEvent[event] || [])].join("|") || "none"}.` };
  }
  const files = listValue(args.files);
  if (event === "changed" && files.length === 0) {
    return {
      ok: false,
      code: "CHANGED_FILES_REQUIRED",
      message: "A changed checkpoint requires --files so later history can distinguish what the executor claims to have changed.",
    };
  }
  const state = await ensureLayout(root);
  const activeMatch = await findActiveForTask(state, executionId, safeSessionId(args.session));
  if (activeMatch?.ambiguous) return activeTaskAmbiguityError(executionId, activeMatch.matches);
  if (!activeMatch?.active) return { ok: false, code: "ACTIVE_EXECUTION_NOT_FOUND", message: "No active execution matches this ID/session." };
  const active = activeMatch.active;
  if (event === 'verified') {
    const status = args.status || 'passed';
    if (!['passed','failed','blocked','not-applicable'].includes(status)) return { ok: false, code: 'INVALID_VERIFICATION_STATUS' };
  }
  const taskId = active.taskId || null;
  const taskPath = taskId ? await findTaskPath(state, taskId, active) : null;
  if (active.artifactVersion !== 3 && taskPath && await exists(path.join(taskPath, "result.md"))) {
    return {
      ok: false,
      code: "PREMATURE_RESULT_ARTIFACT",
      message: "result.md is closure-only and must be written after implementation, verification, and applicable QA checkpoints.",
    };
  }
  if (active.artifactVersion !== 3 && taskPath && (
    ["changed", "decision"].includes(event)
    && await exists(path.join(taskPath, "qa.md"))
    && await countTaskEvents(state, executionId, "qa-finding") === 0
  )) {
    return {
      ok: false,
      code: "PREMATURE_QA_ARTIFACT",
      message: "qa.md is verification-phase evidence and must not exist during scope or implementation checkpoints.",
    };
  }
  if (event === "qa-finding") {
    if (files.length > 0) {
      return {
        ok: false,
        code: "QA_FINDING_PRODUCT_FILES_FORBIDDEN",
        message: "qa-finding is verification-only evidence and must not claim changed product files.",
      };
    }
    if (await countTaskEvents(state, executionId, "qa-finding") >= Number(args['repair-budget'] || 3)) {
      return {
        ok: false,
        code: "QA_CORRECTION_LIMIT",
        message: 'Repair budget exhausted. Record unresolved evidence; never report a false pass.',
      };
    }
  }

  const taskIdentity = taskPath ? await taskAuditIdentity(taskPath) : {};
  const requestedBy = active.requestedBy || taskIdentity.requestedBy || await resolveRequester(state, args);
  if (!requestedBy) return { ok: false, needsRequester: true, message: "Requester is missing from the session and task brief." };

  const execution = executionIdentity(args, active);
  const requesterId = active.requesterId || taskIdentity.requesterId || null;
  const identitySource = active.identitySource || taskIdentity.identitySource || "legacy-migrated";
  const request = active.objective || taskIdentity.request || null;
  const rawVerification = listValue(args.verification);
  const verification = compactVerification(rawVerification);
  const rawReason = String(args.reason || "Durable milestone checkpoint.");
  const reason = compactCheckpointText(rawReason, CHECKPOINT_FIELD_BUDGETS.reason);
  const rawConcerns = String(args.concerns || "None recorded.");
  const concerns = compactCheckpointText(rawConcerns, CHECKPOINT_FIELD_BUDGETS.concerns);
  const timestamp = now();
  const memoryPaths = activeMemoryPaths(state, active);
  await mkdir(path.dirname(memoryPaths.current), { recursive: true });
  await mkdir(path.dirname(memoryPaths.recent), { recursive: true });
  const previous = parseSavepoint(await readFile(memoryPaths.current, "utf8").catch(() => ""));
  const savepoint = mergeSavepoint(previous, {
    // A changed acceptance slice is done work unless the caller lists it explicitly.
    done: args.done ?? (event === "changed" ? summary : undefined),
    remaining: args.remaining,
    next: args.next,
    decisions: args.decisions ?? (event === "decision" ? summary : undefined),
  });
  await writeFile(memoryPaths.current, renderSavepoint({
    ...execution,
    ...savepoint,
    executionId,
    taskId,
    workflowDepth: active.workflowDepth || taskIdentity.workflowDepth || "regulated",
    requestedBy,
    objective: request || "Not recorded (legacy task)",
    status: args.status || "in-progress",
    session: active.sessionId || null,
    branch: gitPlace(root),
    updated: timestamp,
    checkpoint: { milestone, at: timestamp, summary, files, verification, concerns },
  }), "utf8");
  if (!(await exists(memoryPaths.recent))) {
    await writeFile(memoryPaths.recent, `# Recent execution journal\n\n- Execution ID: \`${executionId}\`\n- Task ID: ${taskId ? `\`${taskId}\`` : "not-applicable"}\n- Workflow depth: \`${active.workflowDepth}\`\n- Requested by: ${requestedBy}\n- Request: ${request}\n\n## Events\n`, "utf8");
  }
  await appendFile(memoryPaths.recent, `\n- ${timestamp} · ${event}/${milestone} · ${summary}\n`, "utf8");
  await appendLog(state, {
    executionId,
    taskId,
    requestedBy,
    requesterId,
    identitySource,
    ...execution,
    workflowDepth: active.workflowDepth || taskIdentity.workflowDepth || "regulated",
    event,
    artifactVersion: active.artifactVersion,
    verificationStatus: event === 'verified' ? args.status || 'passed' : undefined,
    risk: active.risk,
    milestone,
    summary,
    reason,
    files,
    verification,
    precedents: listValue(args.precedent),
  });
  const compaction = {
    summaryTruncated: rawSummary.replace(/\s+/g, " ") !== summary,
    reasonTruncated: rawReason.trim().replace(/\s+/g, " ") !== reason,
    concernsTruncated: rawConcerns.trim().replace(/\s+/g, " ") !== concerns,
    verificationItemsOmitted: Math.max(0, rawVerification.length - verification.length),
    verificationItemsTruncated: rawVerification.slice(0, verification.length)
      .filter((item, index) => item.trim().replace(/\s+/g, " ") !== verification[index]).length,
  };
  if (event === 'verified') {
    active.verificationStatus = args.status || 'passed';
    active.verificationAgent = args.agent || active.agent;
    await writeJson(activeMatch.activePath, active);
  }
  return { ok: true, executionId, taskId, milestone, requestedBy, requesterId, identitySource, ...execution, memory: stateRelative(state, memoryPaths.current), recent: stateRelative(state, memoryPaths.recent), compaction };
}

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(entryPath));
    else files.push(entryPath);
  }
  return files;
}

async function countTaskEvents(state, executionId, eventName) {
  let count = 0;
  const logFiles = (await filesUnder(path.join(state, "logs"))).filter((file) => file.endsWith(".jsonl"));
  for (const file of logFiles) {
    for (const line of (await readFile(file, "utf8")).split(/\r?\n/).filter(Boolean)) {
      try {
        const raw = JSON.parse(line);
        const entry = normalizeAuditEvent(raw);
        if (
          (entry.executionId === executionId || entry.taskId === executionId)
          && entry.event === eventName
          && SUPPORTED_AUDIT_SCHEMA_VERSIONS.has(auditSchemaVersion(raw))
          && auditEventIssues(raw).length === 0
        ) count += 1;
      } catch {
        // Invalid audit lines remain diagnostic and never consume the correction allowance.
      }
    }
  }
  return count;
}

async function recordedTaskFiles(state, executionId) {
  const recorded = new Set();
  const logFiles = (await filesUnder(path.join(state, "logs"))).filter((file) => file.endsWith(".jsonl"));
  for (const file of logFiles) {
    for (const line of (await readFile(file, "utf8")).split(/\r?\n/).filter(Boolean)) {
      try {
        const raw = JSON.parse(line);
        const event = normalizeAuditEvent(raw);
        const versioned = SUPPORTED_AUDIT_SCHEMA_VERSIONS.has(auditSchemaVersion(raw));
        if (
          event.executionId !== executionId && event.taskId !== executionId
          || !versioned
          || TERMINAL_AUDIT_EVENTS.has(event.event)
          || auditEventIssues(raw).length > 0
        ) continue;
        for (const changedFile of event.files) {
          const normalized = typeof changedFile === "string" ? changedFile.trim() : "";
          if (normalized) recorded.add(normalized);
        }
      } catch {
        // Invalid lines are reported by validation/history and never supply file attribution.
      }
    }
  }
  return [...recorded];
}

async function auditEvidenceForExecution(state, executionId) {
  const events = [];
  const failures = [];
  const logFiles = (await filesUnder(path.join(state, "logs"))).filter((file) => file.endsWith(".jsonl"));
  for (const file of logFiles) {
    const source = stateRelative(state, file);
    const lines = (await readFile(file, "utf8")).split(/\r?\n/).filter(Boolean);
    for (let index = 0; index < lines.length; index += 1) {
      try {
        const raw = JSON.parse(lines[index]);
        const event = normalizeAuditEvent(raw);
        if (event.executionId !== executionId && event.taskId !== executionId) continue;
        const issues = auditEventIssues(raw);
        for (const issue of issues) failures.push({ source, line: index + 1, ...issue });
        if (issues.length === 0) events.push({ ...event, source, line: index + 1 });
      } catch {
        // Daily log lines unrelated to this execution cannot be attributed without valid JSON.
      }
    }
  }
  return { events, failures };
}

function auditStorageStatus(root, logFiles) {
  const repository = gitOutput(root, ["rev-parse", "--is-inside-work-tree"]);
  const relativeLogs = logFiles
    .map((file) => path.relative(root, file).replace(/\\/g, "/"))
    .sort((a, b) => a.localeCompare(b));
  if (!repository.ok || repository.stdout !== "true") {
    return {
      status: relativeLogs.length ? "local-only-no-git" : "no-logs",
      gitRepository: false,
      logFileCount: relativeLogs.length,
      trackedCount: 0,
      ignoredCount: 0,
      workingTreeChanges: [],
      recoverableFromCurrentCommit: false,
      note: "Logs exist only in this local filesystem because the target is not a Git worktree.",
    };
  }

  const trackedOutput = gitOutput(root, ["ls-files", "--", ".agrimap-agent/logs"]);
  const tracked = new Set(trackedOutput.stdout.split(/\r?\n/).filter(Boolean).map((file) => file.replace(/\\/g, "/")));
  const ignoredOutput = relativeLogs.length
    ? gitOutput(root, ["check-ignore", "--stdin"], { input: `${relativeLogs.join("\n")}\n` })
    : { stdout: "" };
  const ignored = new Set(ignoredOutput.stdout.split(/\r?\n/).filter(Boolean).map((file) => file.replace(/\\/g, "/")));
  const workingTree = gitOutput(root, ["status", "--porcelain=v1", "--", ".agrimap-agent/logs"]);
  const workingTreeChanges = workingTree.stdout.split(/\r?\n/).filter(Boolean);
  const trackedCount = relativeLogs.filter((file) => tracked.has(file)).length;
  const ignoredCount = relativeLogs.filter((file) => ignored.has(file)).length;
  const allTracked = relativeLogs.length > 0 && trackedCount === relativeLogs.length;
  const recoverableFromCurrentCommit = allTracked && workingTreeChanges.length === 0;

  let status = "no-logs";
  if (relativeLogs.length > 0 && allTracked) status = recoverableFromCurrentCommit ? "tracked-clean" : "tracked-with-working-tree-changes";
  else if (trackedCount > 0) status = "partially-tracked";
  else if (ignoredCount > 0) status = "local-only-ignored";
  else if (relativeLogs.length > 0) status = "untracked";

  const notes = {
    "no-logs": "No durable audit log files exist yet.",
    "tracked-clean": "All audit logs are present in the current Git commit; remote/team recovery still depends on pushing that commit.",
    "tracked-with-working-tree-changes": "Audit logs are tracked but have staged or unstaged changes that are not fully recoverable from the current commit.",
    "partially-tracked": "Only some audit logs are tracked; history is incomplete for another clone.",
    "local-only-ignored": "Audit logs are ignored by Git and will not be available in another clone or to teammates.",
    untracked: "Audit logs are not ignored, but they have not been added to Git and are local-only.",
  };
  return {
    status,
    gitRepository: true,
    logFileCount: relativeLogs.length,
    trackedCount,
    ignoredCount,
    workingTreeChanges,
    recoverableFromCurrentCommit,
    note: notes[status],
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markdownField(content, label) {
  return content.match(new RegExp(`^\\s*-\\s*${escapeRegExp(label)}:\\s*(.*?)\\s*$`, "im"))?.[1]?.trim() || "";
}

function plainMarkdownValue(value) {
  const normalized = String(value || "").trim();
  return normalized.startsWith("`") && normalized.endsWith("`")
    ? normalized.slice(1, -1).trim()
    : normalized;
}

function placeholderValueReason(value) {
  const normalized = plainMarkdownValue(value);
  if (!normalized) return "missing";
  if (unresolvedTemplateTokens(normalized).length > 0) return "template-placeholder";
  if (/^<[^<>\r\n]+>$/.test(normalized)) return "angle-placeholder";
  if (/^(?:todo|tbd|tbc|fixme)\.?$/i.test(normalized)) return "todo-placeholder";
  if (/^unresolved\.?$/i.test(normalized)) return "unresolved-placeholder";
  if (/^define before implementation\.?$/i.test(normalized)) return "scaffold-placeholder";
  if (/^[a-z][a-z0-9-]*(?:\|[a-z][a-z0-9-]*)+$/i.test(normalized)) return "unresolved-choice";
  return null;
}

function markdownSection(content, heading) {
  const lines = String(content || "").split(/\r?\n/);
  const expected = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "i");
  const start = lines.findIndex((line) => expected.test(line));
  if (start < 0) return "";
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^#{1,6}\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n").trim();
}

function unresolvedTemplateTokens(content) {
  return [...new Set(String(content || "").match(/\{\{[^{}\r\n]+\}\}/g) || [])]
    .filter((token) => completionTemplateTokenNames.has(token.slice(2, -2).trim()));
}

function standaloneScaffoldReasons(content) {
  const reasons = new Set();
  let inFence = false;
  for (const rawLine of String(content || "").split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(rawLine)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    let line = rawLine.trim();
    line = line.replace(/^(?:>\s*)+/, "");
    line = line.replace(/^(?:[-*+]|\d+[.)])\s+/, "");
    line = line.replace(/^\[[ xX]\]\s*/, "");
    if (!line) continue;
    const reason = placeholderValueReason(line);
    if (reason) reasons.add(reason);
  }
  return [...reasons];
}

function optionalMarkdownField(content, label) {
  const value = plainMarkdownValue(markdownField(content, label));
  return value && !/^not recorded$/i.test(value) ? value : null;
}

async function taskAuditIdentity(taskPath) {
  const brief = await readFile(path.join(taskPath, "brief.md"), "utf8").catch(() => "");
  return {
    requestedBy: optionalMarkdownField(brief, "Requested by"),
    requesterId: optionalMarkdownField(brief, "Requester ID"),
    identitySource: optionalMarkdownField(brief, "Identity source"),
    request: optionalMarkdownField(brief, "Objective"),
    sessionId: optionalMarkdownField(brief, "Session"),
    workflowDepth: optionalMarkdownField(brief, "Workflow depth"),
  };
}

async function priorPassedQaRuns(state, currentTaskId, coverageKey) {
  const normalizedCoverageKey = String(coverageKey || "").trim().toLowerCase();
  if (!normalizedCoverageKey) return [];
  const completedAt = new Map();
  const logFiles = (await filesUnder(path.join(state, "logs"))).filter((file) => file.endsWith(".jsonl"));
  for (const file of logFiles) {
    for (const line of (await readFile(file, "utf8")).split(/\r?\n/).filter(Boolean)) {
      try {
        const raw = JSON.parse(line);
        const event = normalizeAuditEvent(raw);
        if (event.taskId === currentTaskId || event.event !== "completed" || auditEventIssues(raw).length > 0) continue;
        const timestamp = Date.parse(event.timestamp);
        if (Number.isFinite(timestamp) && timestamp > (completedAt.get(event.taskId) || 0)) completedAt.set(event.taskId, timestamp);
      } catch {
        // Invalid audit lines cannot establish prior completion or QA counter state.
      }
    }
  }

  const runs = [];
  for (const [taskId, timestamp] of completedAt) {
    const priorPath = await findTaskPath(state, taskId);
    const qa = priorPath ? await readFile(path.join(priorPath, "qa.md"), "utf8").catch(() => "") : "";
    if (plainMarkdownValue(markdownField(qa, "Status")).toLowerCase() !== "passed") continue;
    if (plainMarkdownValue(markdownField(qa, "Coverage key")).toLowerCase() !== normalizedCoverageKey) continue;
    const recordedMode = plainMarkdownValue(markdownField(qa, "QA mode")).toLowerCase();
    const mode = recordedMode === "fast" ? "light" : recordedMode;
    if (!new Set(["light", "full"]).has(mode)) continue;
    runs.push({ taskId, timestamp, mode });
  }
  return runs.sort((left, right) => left.timestamp - right.timestamp || left.taskId.localeCompare(right.taskId));
}

async function validate(root, args) {
  const state = path.join(root, ".agrimap-agent");
  const executionId = safeTaskId(args.execution || args["execution-id"] || args.task);
  if (!executionId) return { ok: false, message: "--execution (or compatibility --task) is required." };
  const activeMatch = await findActiveForTask(state, executionId, safeSessionId(args.session));
  if (activeMatch?.ambiguous) return activeTaskAmbiguityError(executionId, activeMatch.matches);
  const recordedEvidence = await auditEvidenceForExecution(state, executionId);
  const original = recordedEvidence.events.find(event => event.event === 'created');
  const lastVerification = recordedEvidence.events.filter(event => event.event === 'verified').at(-1);
  const active = activeMatch?.active || (original?.artifactVersion === 3 ? { artifactVersion:3, taskId:original.taskId, executionId, workflowDepth:original.workflowDepth, risk:original.risk, agent:original.agent, verificationStatus:lastVerification?.verificationStatus, verificationAgent:lastVerification?.agent } : {});
  const taskId = Object.hasOwn(active, 'taskId') ? active.taskId : (String(args.depth || args['workflow-depth'] || active.workflowDepth || '').toLowerCase() === 'light' ? null : executionId);
  const taskPath = taskId ? await findTaskPath(state, taskId, active) : null;
  const artifactDefinitions = taskArtifactSchema.artifacts || {};
  const briefPreview = taskPath ? await readFile(path.join(taskPath, "brief.md"), "utf8").catch(() => "") : "";
  const workflowDepth = String(args.depth || args["workflow-depth"] || active.workflowDepth || optionalMarkdownField(briefPreview, "Workflow depth") || "regulated").toLowerCase();
  if (!TRACKED_WORKFLOW_DEPTHS.has(workflowDepth)) {
    return { ok: false, executionId, taskId, workflowDepth, contentFailures: [{ file: "brief.md", field: "Workflow depth", reason: "invalid-enum" }] };
  }
  const evidence = recordedEvidence;
  const created = evidence.events.find((event) => event.event === "created" && eventRequest(event));
  const memoryPaths = activeMemoryPaths(state, { ...active, executionId, taskId });
  const memoryRecorded = await exists(memoryPaths.current) || await exists(memoryPaths.recent)
    || Boolean(await findExecutionMemoryPath(state, 'recent', executionId, original?.timestamp ? zonedParts(original.timestamp, (await workspaceConfig(state)).timeZone || DEFAULT_PROJECT_TIME_ZONE).period : null));
  if (active.artifactVersion === 3) {
    const failures = [];
    const warnings = [];
    if (!created || !memoryRecorded) failures.push('missing-execution-evidence');
    // Tracked runs started before 5.0.1 keep their task.md gate.
    if (taskPath) {
      const task = await readFile(path.join(taskPath, 'task.md'), 'utf8').catch(() => '');
      if (!task || /- \[ \]/.test(task) || !/## Result\s+\S/.test(task) || /## Result\s+Pending\./.test(task)) failures.push('task-not-complete');
    }
    const savepoint = parseSavepoint(await readFile(memoryPaths.current, 'utf8').catch(() => ''));
    if (savepoint.remaining.length) warnings.push('savepoint-remaining-items');
    if (!evidence.events.some(event => event.event === 'verified')) failures.push('verification-evidence-required');
    if (!['passed','not-applicable'].includes(active.verificationStatus)) failures.push('verification-not-passed');
    if (active.risk === 'independent-assurance' && active.verificationAgent === active.agent) failures.push('independent-verifier-required');
    return { ok: !failures.length && !evidence.failures.length, executionId, taskId, workflowDepth, contentFailures: failures, auditFailures: evidence.failures, warnings, remaining: savepoint.remaining };
  }
  if (workflowDepth === "light") {
    const leakedTaskPath = await findTaskPath(state, executionId, active);
    const contentFailures = [];
    if (taskId !== null) contentFailures.push({ field: "task_id", reason: "light-must-not-have-task-id" });
    if (leakedTaskPath) contentFailures.push({ field: "task-directory", reason: "light-must-not-create-task-artifacts" });
    return {
      ok: contentFailures.length === 0 && evidence.failures.length === 0 && Boolean(created) && memoryRecorded,
      executionId,
      taskId: null,
      workflowDepth,
      taskArtifacts: "not-applicable",
      contentFailures,
      auditFailures: evidence.failures,
      taskLogged: evidence.events.length > 0,
      createdRequestRecorded: Boolean(created),
      requesterRecorded: Boolean(created?.requestedBy || active.requestedBy),
      memoryRecorded,
    };
  }
  if (!taskPath) return { ok: false, executionId, taskId, workflowDepth, missing: ["task-directory"], contentFailures: [] };
  const required = Object.entries(artifactDefinitions)
    .filter(([, definition]) => definition.requiredForCompletion && (definition.requiredForDepths || []).includes(workflowDepth))
    .map(([file]) => file);
  const missing = [];
  for (const file of required) {
    if (!(await exists(path.join(taskPath, file)))) missing.push(file);
  }

  const artifacts = {};
  for (const file of required) {
    artifacts[file] = await readFile(path.join(taskPath, file), "utf8").catch(() => "");
  }
  const brief = artifacts["brief.md"] || "";
  const checklist = artifacts["checklists.md"] || artifacts["checklist.md"] || "";
  const qa = artifacts["qa.md"] || "";
  const result = artifacts["result.md"] || "";
  const placeholderFailures = [];
  for (const [file, content] of Object.entries(artifacts)) {
    for (const token of unresolvedTemplateTokens(content)) placeholderFailures.push({ file, token });
  }

  const contentFailures = [];
  const requireField = (file, content, label) => {
    const value = markdownField(content, label);
    const reason = placeholderValueReason(value);
    if (reason) contentFailures.push({ file, field: label, reason });
    return plainMarkdownValue(value);
  };
  const requireSection = (file, content, heading) => {
    const value = markdownSection(content, heading);
    if (!value) {
      contentFailures.push({ file, field: heading, reason: "missing" });
    } else {
      for (const reason of standaloneScaffoldReasons(value)) {
        contentFailures.push({ file, field: heading, reason });
      }
    }
    return value;
  };

  const artifactFields = {};
  let checklistItems = [];
  let unchecked = [];
  for (const [file, definition] of Object.entries(artifactDefinitions)) {
    if (!required.includes(file)) continue;
    const content = artifacts[file] || "";
    artifactFields[file] = {};
    for (const field of definition.requiredFields || []) {
      const value = requireField(file, content, field.label);
      artifactFields[file][field.label] = value;
      const normalized = value.toLowerCase();
      if (field.enum && !field.enum.map((item) => String(item).toLowerCase()).includes(normalized)) {
        contentFailures.push({ file, field: field.label, reason: "invalid-enum" });
      }
      if (field.const !== undefined && normalized !== String(field.const).toLowerCase()) {
        contentFailures.push({ file, field: field.label, reason: "const-mismatch" });
      }
    }
    for (const heading of definition.requiredSections || []) requireSection(file, content, heading);
    for (const [fieldLabel, cases] of Object.entries(definition.requiredSectionsByField || {})) {
      const selected = String(artifactFields[file][fieldLabel] || "").toLowerCase();
      for (const heading of cases[selected] || []) requireSection(file, content, heading);
    }
    if (definition.kind === "checklist") {
      checklistItems = content.split(/\r?\n/)
        .map((line) => line.match(/^\s*- \[([ xX])\]\s*(.*?)\s*$/))
        .filter(Boolean);
      unchecked = content.split(/\r?\n/).filter((line) => /^\s*- \[ \]/.test(line));
      if (checklistItems.length < Number(definition.minimumItems || 1)) {
        contentFailures.push({ file, field: "checkboxes", reason: "missing" });
      }
      for (const item of checklistItems) {
        const reason = placeholderValueReason(item[2]);
        if (reason) contentFailures.push({ file, field: "checkbox", reason });
      }
    }
  }

  const rules = taskArtifactSchema.crossArtifactRules || {};
  const regulated = workflowDepth === String(rules.regulatedDepth || "regulated");
  const artifactTaskId = artifactFields["brief.md"]?.[rules.taskIdField] || "";
  if (artifactTaskId !== taskId) contentFailures.push({ file: "brief.md", field: rules.taskIdField, reason: "task-id-mismatch" });
  const requestedBy = artifactFields["brief.md"]?.[rules.requesterField] || "";
  const decisionOwner = artifactFields["brief.md"]?.[rules.decisionOwnerField] || "";
  const briefWorkflowDepth = String(artifactFields["brief.md"]?.[rules.workflowDepthField] || "").toLowerCase();
  const resultWorkflowDepth = String(artifactFields["result.md"]?.[rules.workflowDepthField] || "").toLowerCase();
  if (briefWorkflowDepth !== workflowDepth) contentFailures.push({ file: "brief.md", field: rules.workflowDepthField, reason: "depth-mismatch" });
  if (resultWorkflowDepth !== workflowDepth) contentFailures.push({ file: "result.md", field: rules.workflowDepthField, reason: "depth-mismatch" });
  const qaStatus = String(artifactFields["qa.md"]?.[rules.qaStatusField] || "").toLowerCase();
  const qaMode = String(artifactFields["qa.md"]?.[rules.qaModeField] || "").toLowerCase();
  const qaAccepted = regulated ? (rules.acceptedQaStatuses || []).includes(qaStatus) : true;
  if (regulated && !qaAccepted) contentFailures.push({ file: "qa.md", field: rules.qaStatusField, reason: "not-accepted" });
  const patterns = artifactFields["qa.md"]?.[rules.patternField] || "";
  if (regulated && /^none(?:\s+applicable)?\.?$/i.test(patterns)) {
    contentFailures.push({ file: "qa.md", field: rules.patternField, reason: "none-requires-reason" });
  }

  for (const file of [...(regulated ? ["qa.md"] : []), "result.md"]) {
    const artifactRequester = artifactFields[file]?.[rules.requesterField] || "";
    if (requestedBy && artifactRequester && requestedBy !== artifactRequester) {
      contentFailures.push({ file, field: rules.requesterField, reason: "requester-mismatch" });
    }
    const artifactDecisionOwner = artifactFields[file]?.[rules.decisionOwnerField] || "";
    if (decisionOwner && artifactDecisionOwner && decisionOwner !== artifactDecisionOwner) {
      contentFailures.push({ file, field: rules.decisionOwnerField, reason: "decision-owner-mismatch" });
    }
  }

  const qaIdentity = (rules.qaIdentityFields || []).map((label) => String(artifactFields["qa.md"]?.[label] || "").toLowerCase());
  const implementationIdentity = (rules.implementationIdentityFields || []).map((label) => String(artifactFields["qa.md"]?.[label] || "").toLowerCase());
  if (regulated && qaStatus === "passed" && qaIdentity.length && qaIdentity.every((value, index) => value === implementationIdentity[index])) {
    contentFailures.push({ file: "qa.md", field: "QA identity", reason: "not-independent" });
  }

  const lightSequence = String(artifactFields["qa.md"]?.[rules.lightSequenceField] || "");
  if (regulated && qaMode === "full" && lightSequence !== String(rules.fullLightSequence)) {
    contentFailures.push({ file: "qa.md", field: rules.lightSequenceField, reason: "full-must-reset-counter" });
  }
  if (regulated && qaMode === "light" && !(rules.lightAllowedSequences || []).map(String).includes(lightSequence)) {
    contentFailures.push({ file: "qa.md", field: rules.lightSequenceField, reason: "light-sequence-limit" });
  }
  const coverageKey = artifactFields["qa.md"]?.[rules.coverageKeyField] || "";
  const priorQaRuns = regulated ? await priorPassedQaRuns(state, taskId, coverageKey) : [];
  let priorConsecutiveLight = 0;
  for (const run of priorQaRuns) priorConsecutiveLight = run.mode === "full" ? 0 : priorConsecutiveLight + 1;
  const expectedLightSequence = priorConsecutiveLight + 1;
  if (regulated && qaMode === "light" && priorConsecutiveLight >= (rules.lightAllowedSequences || []).length) {
    contentFailures.push({ file: "qa.md", field: rules.qaModeField, reason: "historical-full-required" });
  } else if (regulated && qaMode === "light" && lightSequence !== String(expectedLightSequence)) {
    contentFailures.push({ file: "qa.md", field: rules.lightSequenceField, reason: "historical-sequence-mismatch" });
  }

  const resultQaStatus = String(artifactFields["result.md"]?.[rules.resultQaStatusField] || "").toLowerCase();
  if (regulated && (!qaAccepted || resultQaStatus !== qaStatus)) {
    contentFailures.push({ file: "result.md", field: rules.resultQaStatusField, reason: "qa-status-mismatch" });
  } else if (!regulated && resultQaStatus !== "not-applicable") {
    contentFailures.push({ file: "result.md", field: rules.resultQaStatusField, reason: "standard-requires-not-applicable" });
  }
  const resultQaMode = String(artifactFields["result.md"]?.[rules.resultQaModeField] || "").toLowerCase();
  if (regulated && resultQaMode !== qaMode) contentFailures.push({ file: "result.md", field: rules.resultQaModeField, reason: "qa-mode-mismatch" });
  if (!regulated && resultQaMode !== "not-applicable") contentFailures.push({ file: "result.md", field: rules.resultQaModeField, reason: "standard-requires-not-applicable" });
  const deliveryBoundary = String(artifactFields["result.md"]?.[rules.deliveryBoundaryField] || "").toLowerCase();
  if (!regulated && (rules.fullQaBoundaries || []).includes(deliveryBoundary)) {
    contentFailures.push({ file: "result.md", field: rules.deliveryBoundaryField, reason: "requires-regulated-depth" });
  } else if (regulated && (rules.fullQaBoundaries || []).includes(deliveryBoundary) && qaMode !== "full") {
    contentFailures.push({ file: "result.md", field: rules.deliveryBoundaryField, reason: "requires-full-qa" });
  }

  const taskLogged = evidence.events.some((event) => Boolean(event.requestedBy));
  const createdRequestRecorded = Boolean(created);
  const auditFailures = [...evidence.failures];
  for (const event of evidence.events) {
    if (requestedBy && event.requestedBy && requestedBy !== event.requestedBy) {
      auditFailures.push({ source: event.source, line: event.line, field: "requestedBy", reason: "task-brief-mismatch" });
    }
  }

  return {
    ok: missing.length === 0
      && unchecked.length === 0
      && placeholderFailures.length === 0
      && contentFailures.length === 0
      && qaAccepted
      && taskLogged
      && createdRequestRecorded
      && auditFailures.length === 0
      && Boolean(requestedBy)
      && memoryRecorded,
    executionId,
    taskId,
    missing,
    unchecked,
    checklistItems: checklistItems.length,
    placeholderFailures,
    contentFailures,
    qaAccepted,
    workflowDepth,
    qaCounter: {
      coverageKey,
      priorPassedRuns: priorQaRuns,
      priorConsecutiveLight,
      expectedLightSequence,
    },
    taskLogged,
    createdRequestRecorded,
    auditFailures,
    requesterRecorded: Boolean(requestedBy),
    memoryRecorded,
  };
}

async function findActiveForTask(state, taskId, sessionId) {
  if (sessionId) {
    const activePath = activeTaskPath(state, sessionId);
    if (await exists(activePath)) {
      const active = await readJson(activePath);
      if (active.taskId === taskId || active.executionId === taskId) return { active, activePath };
    }
    return null;
  }
  const activeDirectory = path.join(state, "runtime", "active");
  const matches = [];
  for (const file of await readdir(activeDirectory).catch(() => [])) {
    if (!file.endsWith(".json")) continue;
    const candidatePath = path.join(activeDirectory, file);
    const candidate = await readJson(candidatePath).catch(() => null);
    if (candidate?.taskId === taskId || candidate?.executionId === taskId) matches.push({ active: candidate, activePath: candidatePath });
  }
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  return { ambiguous: true, matches };
}

function activeTaskAmbiguityError(taskId, matches) {
  return {
    ok: false,
    code: "AMBIGUOUS_ACTIVE_TASK",
    needsSession: true,
    taskId,
    sessions: matches.map(({ active, activePath }) => ({
      sessionId: active?.sessionId || path.basename(activePath, ".json"),
      requestedBy: active?.requestedBy || null,
      activePath: activePath.replace(/\\/g, "/"),
    })),
    message: "Multiple sessions have this task active; pass --session so requester and execution attribution cannot be inherited from the wrong session.",
  };
}

async function appendRecentTerminal(state, active, status, summary) {
  const memoryPaths = activeMemoryPaths(state, active);
  await mkdir(path.dirname(memoryPaths.recent), { recursive: true });
  if (!(await exists(memoryPaths.recent))) {
    await writeFile(memoryPaths.recent, `# Recent execution journal\n\n- Execution ID: \`${active.executionId || active.taskId}\`\n- Task ID: ${active.taskId ? `\`${active.taskId}\`` : "not-applicable"}\n- Workflow depth: \`${active.workflowDepth}\`\n- Requested by: ${active.requestedBy}\n- Request: ${active.objective}\n\n## Events\n`, "utf8");
  }
  const current = await readFile(memoryPaths.recent, "utf8");
  if (!current.includes(` · ${status} · ${summary}`)) {
    await appendFile(memoryPaths.recent, `\n- ${now()} · ${status} · ${summary}\n`, "utf8");
  }
  return memoryPaths;
}

async function updateProjectMemory(state, active, status, reportPath) {
  if ((await workspaceConfig(state)).memory?.completedWorkInProjectMd !== true) return null;
  const projectPath = path.join(state, "memory", "project.md");
  const executionId = active.executionId || active.taskId;
  const date = zonedParts(now(), (await workspaceConfig(state)).timeZone || DEFAULT_PROJECT_TIME_ZONE).date;
  const line = `- ${date} · ${status} · ${active.objective} (execution \`${executionId}\`; report \`${stateRelative(state, reportPath)}\`)`;
  let content = await readFile(projectPath, "utf8").catch(() => "# Project memory\n\n## Completed work\n");
  if (!content.includes("## Completed work")) content = `${content.trimEnd()}\n\n## Completed work\n`;
  if (!content.includes(`execution \`${executionId}\``)) content = `${content.trimEnd()}\n${line}\n`;
  await writeFile(projectPath, content, "utf8");
  return stateRelative(state, projectPath);
}

async function writeCanonicalExecutionReport(state, active, status, files, verification, taskPath = null) {
  if (active.artifactVersion === 3 && !active.reportRequested) return activeMemoryPaths(state, active).recent;
  const executionId = active.executionId || active.taskId;
  const config = await workspaceConfig(state);
  const startedLocal = zonedParts(active.startedAt || now(), config.timeZone || DEFAULT_PROJECT_TIME_ZONE);
  const period = active.period || startedLocal.period;
  const slug = executionSlug(active);
  const reportPath = path.join(state, "reports", period, `${executionId}-${slug}.md`);
  const memoryPaths = activeMemoryPaths(state, active);
  const finishedAt = now();
  const finishedLocal = zonedParts(finishedAt, config.timeZone || DEFAULT_PROJECT_TIME_ZONE);
  const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(active.startedAt || finishedAt));
  const duration = `~${Math.max(1, Math.round(durationMs / 60_000))} minute(s)`;
  const finalStatus = status === "completed"
    ? "✅ COMPLETED"
    : status === "blocked"
      ? "⚠️ PARTIAL"
      : "❌ FAILED";
  const terminalBucket = status === "completed" ? "complete" : status === "blocked" ? null : "cancelled";
  const taskFolder = active.taskId
    ? `\`.agrimap-agent/${terminalBucket ? `tasks/${terminalBucket}/${period}/${active.taskId}/` : `${stateRelative(state, taskPath)}/`}\``
    : "not-applicable (light workflow; no tasks/**)";
  const promptSource = active.promptPath
    ? `\`.agrimap-agent/${String(active.promptPath).replace(/^\.agrimap-agent[\\/]/, "").replace(/\\/g, "/")}\``
    : "not-recorded";
  const taskArtifacts = active.artifactVersion === 3 ? ["task.md"] : ["brief.md", "analysis.md", "checklists.md", "qa.md", "result.md"];
  const taskStatusRows = active.taskId
    ? (await Promise.all(taskArtifacts.map(async (fileName) => {
        const present = taskPath ? await exists(path.join(taskPath, fileName)) : false;
        return `| \`${fileName}\` | ${present ? "✅" : "⏳"} | ${present ? "recorded" : "not recorded at terminal report time"} |`;
      }))).join("\n")
    : taskArtifacts.map((fileName) => `| \`${fileName}\` | ➖ | not applicable for light workflow |`).join("\n");
  const modifiedBlocks = files.length
    ? files.map((file) => `### \`${file}\`\n\n| Change Type | Detail |\n|---|---|\n| REPLACED | Changed or verified by terminal execution evidence |`).join("\n\n")
    : "### —\n\n| Change Type | Detail |\n|---|---|\n| — | No modified-file attribution recorded |";
  const verificationSummary = verification.length
    ? `Verification recorded: ${verification.join("; ")}.`
    : "No executable verification detail was recorded; the report does not invent one.";
  const summary = status === "completed"
    ? `The authorized objective completed and its terminal evidence was recorded. ${verificationSummary} Unrelated logic and requester-owned changes remained outside scope.`
    : `The execution closed as ${status} without claiming completion. ${verificationSummary} Remaining work is preserved in terminal evidence rather than hidden or inferred.`;
  const completionChecklist = [
    active.taskId ? "- [x] `result.md` terminal state checked" : "- [x] `result.md` correctly not applicable for light workflow",
    `- [x] Recent memory updated at \`.agrimap-agent/${stateRelative(state, memoryPaths.recent)}\``,
    "- [x] Completed work stays in history and recent memory; `memory/project.md` keeps facts only",
    `- [x] Current memory removed at terminal close: \`.agrimap-agent/${stateRelative(state, memoryPaths.current)}\``,
    `- [x] Terminal audit event written under \`.agrimap-agent/logs/${finishedLocal.period}/${finishedLocal.date}/${executionId}.jsonl\``,
    `- [x] Prompt source retained immutably: ${promptSource}`,
    active.taskId
      ? `- [x] Task terminal destination recorded: ${taskFolder}`
      : "- [x] Task folder correctly omitted for light workflow",
  ].join("\n");
  const report = await renderAssetTemplate("execution-report.md", {
    TASK_TITLE: active.objective,
    SESSION_ID: active.sessionId || "not-recorded",
    TASK_ID: active.taskId || "not-applicable (light workflow)",
    PROVIDER: active.provider || "unknown",
    MODEL: active.model || "unknown",
    MODE: `${active.operation || "unspecified"} / workflow_depth=${active.workflowDepth}`,
    STARTED_AT: `${startedLocal.date} ${startedLocal.hour}:${startedLocal.minute}:${startedLocal.second}`,
    FINISHED_AT: `${finishedLocal.date} ${finishedLocal.hour}:${finishedLocal.minute}:${finishedLocal.second}`,
    DURATION: duration,
    FINAL_STATUS: finalStatus,
    RECENT_MEMORY_PATH: `.agrimap-agent/${stateRelative(state, memoryPaths.recent)}`,
    TASK_FOLDER_PATH: taskFolder,
    PROMPT_SOURCE_PATH: promptSource,
    REPORT_PATH: `.agrimap-agent/${stateRelative(state, reportPath)}`,
    OBJECTIVES: `1. ${active.objective}`,
    FILES_READ_ROWS: "| — | Read-file attribution was not captured; no list was inferred |",
    FILES_GENERATED_ROWS: "| — | Generated-file attribution was not captured separately |",
    FILES_MODIFIED_BLOCKS: modifiedBlocks,
    ISSUES_ROWS: status === "completed"
      ? "| — | — | No unresolved terminal issue recorded | — |"
      : `| HIGH | — | Execution closed as ${status} | See terminal audit reason and recent memory |`,
    TASK_STATUS_ROWS: taskStatusRows,
    SUMMARY: summary,
    COMPLETION_CHECKLIST: completionChecklist,
  });
  if (/\{\{[A-Z_]+\}\}/.test(report)) throw new Error("Execution report template contains an unresolved placeholder.");
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, report, "utf8");
  return reportPath;
}

async function moveTaskToTerminal(state, active, bucket) {
  if (!active.taskId) return null;
  const source = await findTaskPath(state, active.taskId, active);
  if (!source) return null;
  const config = await workspaceConfig(state);
  const period = active.period || zonedParts(active.startedAt || now(), config.timeZone || DEFAULT_PROJECT_TIME_ZONE).period;
  const destination = path.join(state, "tasks", bucket, period, active.taskId);
  if (path.resolve(source) === path.resolve(destination)) return destination;
  if (await exists(destination)) throw new Error(`Terminal task destination already exists: ${stateRelative(state, destination)}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(source, destination);
  return destination;
}

async function complete(root, args) {
  const executionId = safeTaskId(args.execution || args["execution-id"] || args.task);
  const validation = await validate(root, { ...args, execution: executionId });
  if (!validation.ok) return validation;
  const state = path.join(root, ".agrimap-agent");
  const activeMatch = await findActiveForTask(state, executionId, safeSessionId(args.session));
  if (activeMatch?.ambiguous) return activeTaskAmbiguityError(executionId, activeMatch.matches);
  if (!activeMatch?.active) return { ok: false, code: "ACTIVE_EXECUTION_NOT_FOUND", message: "Completion requires active execution state." };
  const active = { ...activeMatch.active, executionId, taskId: validation.taskId, workflowDepth: validation.workflowDepth };
  const taskPath = active.taskId ? await findTaskPath(state, active.taskId, active) : null;
  const taskIdentity = taskPath ? await taskAuditIdentity(taskPath) : {};
  const requestedBy = active.requestedBy || taskIdentity.requestedBy;
  const execution = executionIdentity(args, active);
  const files = await recordedTaskFiles(state, executionId);
  const verification = (await auditEvidenceForExecution(state, executionId)).events.filter(e => e.event === 'verified').flatMap(e => e.verification || []);
  const priorTerminal = (await auditEvidenceForExecution(state, executionId)).events.some((event) => event.event === "completed");
  // Cards suppressed by a precedent in this execution (decision memory, P3).
  const avoidedSession = safeSessionId(args.session) || activeMatch.session || null;
  const avoided = avoidedSession ? ((await readSessionState(state, avoidedSession)).questionsAvoided || []).filter((item) => item.executionId === executionId) : [];
  if (!priorTerminal) await appendLog(state, {
    executionId,
    taskId: active.taskId,
    requestedBy,
    requesterId: active.requesterId || taskIdentity.requesterId || null,
    identitySource: active.identitySource || taskIdentity.identitySource || "legacy-migrated",
    ...execution,
    workflowDepth: active.workflowDepth,
    event: "completed",
    summary: "Execution passed its completion gate.",
    reason: active.workflowDepth === "regulated"
      ? "Tracked artifacts, regulated QA, memory, and audit evidence are complete."
      : active.workflowDepth === "standard"
        ? "Tracked artifacts, proportional QA, memory, and audit evidence are complete."
        : "Artifactless light execution has memory and audit evidence.",
    files,
    verification,
    precedents: [...new Set([...listValue(args.precedent), ...avoided.map((item) => item.precedent)])],
    questionsAvoided: avoided.length,
  });
  const finalSavepoint = parseSavepoint(await readFile(activeMemoryPaths(state, active).current, "utf8").catch(() => ""));
  const memoryPaths = await appendRecentTerminal(state, active, "completed", finalSavepoint.done.length
    ? `Completion gate passed. Done: ${finalSavepoint.done.slice(-5).join("; ")}`
    : "Completion gate passed.");
  const reportPath = await writeCanonicalExecutionReport(state, active, "completed", files, verification, taskPath);
  const projectMemory = active.artifactVersion === 3 && !active.taskId && !active.reportRequested ? null : await updateProjectMemory(state, active, "completed", reportPath);
  const archivedTaskPath = await moveTaskToTerminal(state, active, "complete");
  await rm(memoryPaths.current, { force: true });
  await rm(activeMatch.activePath, { force: true });
  return {
    ok: true,
    executionId,
    taskId: active.taskId,
    requestedBy,
    recentMemory: stateRelative(state, memoryPaths.recent),
    projectMemory,
    report: active.artifactVersion === 3 && !active.reportRequested ? null : stateRelative(state, reportPath),
    archivedTask: archivedTaskPath ? stateRelative(state, archivedTaskPath) : null,
    promptsMoved: false,
  };
}

async function closeTask(root, args) {
  const executionId = safeTaskId(args.execution || args["execution-id"] || args.task);
  const status = String(args.status || "").trim();
  const allowed = new Set([QA_FAILED_EVENT, "blocked", "cancelled"]);
  if (!executionId || !allowed.has(status)) return { ok: false, message: `--execution (or compatibility --task) and --status ${QA_FAILED_EVENT}|blocked|cancelled are required.` };
  const state = await ensureLayout(root);
  const activeMatch = await findActiveForTask(state, executionId, safeSessionId(args.session));
  if (activeMatch?.ambiguous) return activeTaskAmbiguityError(executionId, activeMatch.matches);
  if (!activeMatch?.active) return { ok: false, code: "ACTIVE_EXECUTION_NOT_FOUND", message: "No active execution matches this ID/session." };
  const active = { ...activeMatch.active, executionId, taskId: activeMatch.active.taskId || null };
  const taskPath = active.taskId ? await findTaskPath(state, active.taskId, active) : null;
  const taskIdentity = taskPath ? await taskAuditIdentity(taskPath) : {};
  const requestedBy = active.requestedBy || taskIdentity.requestedBy;
  if (!requestedBy) return { ok: false, needsRequester: true, message: "Requester is missing from active state and the task brief." };
  if (status === QA_FAILED_EVENT && active.artifactVersion !== 3) {
    const nextPrompt = String(args.nextPrompt || args["next-prompt"] || "").trim();
    const nextPromptPath = nextPrompt ? path.resolve(root, nextPrompt) : "";
    const promptsRoot = path.resolve(state, "instructions");
    const promptRelative = nextPromptPath ? path.relative(promptsRoot, nextPromptPath) : "";
    if (!nextPromptPath || promptRelative.startsWith("..") || path.isAbsolute(promptRelative) || !(await exists(nextPromptPath))) {
      return { ok: false, message: "--next-prompt must point to an existing generated instruction under .agrimap-agent/instructions/." };
    }
  }
  const execution = executionIdentity(args, active);
  const files = await recordedTaskFiles(state, executionId);
  const reason = String(args.reason || (status === "blocked" ? "Execution is paused and remains current." : "Closed without claiming completion.")).trim();
  const priorTerminal = (await auditEvidenceForExecution(state, executionId)).events.some((event) => event.event === status);
  if (!priorTerminal) await appendLog(state, {
    executionId,
    taskId: active.taskId,
    requestedBy,
    requesterId: active.requesterId || taskIdentity.requesterId || null,
    identitySource: active.identitySource || taskIdentity.identitySource || "legacy-migrated",
    ...execution,
    workflowDepth: active.workflowDepth || taskIdentity.workflowDepth || "regulated",
    event: status,
    summary: status === "blocked" ? "Execution is blocked and remains active." : `Execution closed as ${status}.`,
    reason,
    files,
    verification: status === QA_FAILED_EVENT ? [`Next instruction: ${args.nextPrompt || args["next-prompt"]}`] : [],
  });
  const memoryPaths = await appendRecentTerminal(state, active, status, reason);
  if (status === "blocked") {
    // The savepoint stays and says why work stopped, so any session can resume it.
    const previous = parseSavepoint(await readFile(memoryPaths.current, "utf8").catch(() => ""));
    if (previous.executionId) {
      await writeFile(memoryPaths.current, renderSavepoint({
        ...execution, ...previous, taskId: active.taskId, objective: previous.objective || active.objective,
        status: "blocked", updated: now(), branch: gitPlace(root),
        checkpoint: { milestone: "blocked", at: now(), summary: reason, concerns: reason },
      }), "utf8");
    }
    return { ok: true, executionId, taskId: active.taskId, status, complete: false, remainsCurrent: true, currentMemory: stateRelative(state, memoryPaths.current), recentMemory: stateRelative(state, memoryPaths.recent) };
  }
  const reportPath = await writeCanonicalExecutionReport(state, active, status, files, [], taskPath);
  const archivedTaskPath = await moveTaskToTerminal(state, active, "cancelled");
  await rm(memoryPaths.current, { force: true });
  await rm(activeMatch.activePath, { force: true });
  return {
    ok: true,
    executionId,
    taskId: active.taskId,
    requestedBy,
    status,
    complete: false,
    recentMemory: stateRelative(state, memoryPaths.recent),
    projectMemory: null,
    report: active.artifactVersion === 3 && !active.reportRequested ? null : stateRelative(state, reportPath),
    archivedTask: archivedTaskPath ? stateRelative(state, archivedTaskPath) : null,
    promptsMoved: false,
    nextPrompt: status === QA_FAILED_EVENT ? args.nextPrompt || args["next-prompt"] : null,
  };
}

function auditBoundary(value, kind) {
  const raw = String(value || "").trim();
  if (!raw) return { value: null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = Date.parse(`${raw}T00:00:00.000Z`);
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== raw) {
      return { error: `${kind} must be a valid YYYY-MM-DD date or ISO 8601 timestamp.` };
    }
    return { value: kind === "to" ? parsed + 86_400_000 : parsed, bareDate: true };
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    return { error: `${kind} timestamp must be ISO 8601 with Z or an explicit UTC offset.` };
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return { error: `${kind} must be a valid YYYY-MM-DD date or ISO 8601 timestamp.` };
  return { value: kind === "to" ? parsed + 1 : parsed, bareDate: false };
}

function displayIso(value) {
  return Number.isFinite(value) ? new Date(value).toISOString() : null;
}

function eventRequest(event) {
  return String(event.request || (event.event === "created" ? event.reason : "") || "").trim() || null;
}

async function history(root, args) {
  const state = path.join(root, ".agrimap-agent");
  const fromInput = auditBoundary(args.from, "from");
  const toInput = auditBoundary(args.to, "to");
  if (fromInput.error || toInput.error) {
    return { ok: false, code: "INVALID_TIME_RANGE", message: fromInput.error || toInput.error };
  }

  let fromMs = fromInput.value;
  let toExclusiveMs = toInput.value;
  const daysRaw = args.days;
  let days = null;
  if (daysRaw !== undefined) {
    days = Number(daysRaw);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      return { ok: false, code: "INVALID_DAYS", message: "--days must be an integer from 1 to 3650." };
    }
    const end = Date.now() + 1;
    if (toExclusiveMs === null) toExclusiveMs = end;
    if (fromMs === null) fromMs = toExclusiveMs - days * 86_400_000;
  }
  if (fromMs !== null && toExclusiveMs !== null && fromMs >= toExclusiveMs) {
    return { ok: false, code: "INVALID_TIME_RANGE", message: "The start of the time range must be before its end." };
  }

  const requesterFilter = String(args.requester || args.owner || "").trim();
  const requesterIdFilter = String(args.requesterId || args["requester-id"] || "").trim();
  const taskFilter = safeTaskId(args.task);
  const eventFilter = String(args.event || "").trim();
  if (eventFilter && !isLogEvent(eventFilter)) return logEventError(eventFilter);

  const logFiles = (await filesUnder(path.join(state, "logs")))
    .filter((file) => file.endsWith(".jsonl"))
    .sort((a, b) => a.localeCompare(b));
  const allEvents = [];
  const invalidLines = [];
  for (const file of logFiles) {
    const source = path.relative(root, file).replace(/\\/g, "/");
    const lines = (await readFile(file, "utf8")).split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].trim()) continue;
      try {
        const raw = JSON.parse(lines[index]);
        const timestampMs = Date.parse(raw.timestamp);
        if (!Number.isFinite(timestampMs)) {
          invalidLines.push({ source, line: index + 1, reason: "invalid-or-missing-timestamp" });
          continue;
        }
        const schemaVersion = auditSchemaVersion(raw);
        const versioned = Object.hasOwn(raw, "schema_version") || Object.hasOwn(raw, "schemaVersion");
        if (versioned) {
          const issues = auditEventIssues(raw);
          for (const issue of issues) {
            invalidLines.push({ source, line: index + 1, reason: `audit-${issue.field}-${issue.reason}` });
          }
          if (issues.length > 0) continue;
        }
        const event = versioned ? normalizeAuditEvent(raw) : raw;
        allEvents.push({
          ...event,
          source,
          line: index + 1,
          timestampMs,
          timestampUtc: new Date(timestampMs).toISOString(),
          evidenceLevel: versioned ? "versioned-workflow-log" : "legacy-unverified",
        });
      } catch {
        invalidLines.push({ source, line: index + 1, reason: "invalid-json" });
      }
    }
  }
  allEvents.sort((a, b) => a.timestampMs - b.timestampMs || a.source.localeCompare(b.source) || a.line - b.line);

  const filtered = allEvents.filter((event) => {
    if (fromMs !== null && event.timestampMs < fromMs) return false;
    if (toExclusiveMs !== null && event.timestampMs >= toExclusiveMs) return false;
    if (requesterFilter && String(event.requestedBy || "").localeCompare(requesterFilter, undefined, { sensitivity: "accent" }) !== 0) return false;
    if (requesterIdFilter && String(event.requesterId || "") !== requesterIdFilter) return false;
    if (taskFilter && event.taskId !== taskFilter && event.executionId !== taskFilter) return false;
    if (eventFilter && event.event !== eventFilter) return false;
    return true;
  });

  const requesterMap = new Map();
  for (const event of filtered) {
    const requestedBy = String(event.requestedBy || "Unknown requester");
    const key = event.requesterId
      ? `id:${event.requesterId}`
      : `name:${requestedBy.toLocaleLowerCase()}`;
    const entry = requesterMap.get(key) || {
      requestedBy,
      requesterIds: new Set(),
      eventCount: 0,
      executionIds: new Set(),
      taskIds: new Set(),
      firstAt: event.timestampUtc,
      lastAt: event.timestampUtc,
    };
    if (event.requesterId) entry.requesterIds.add(event.requesterId);
    entry.eventCount += 1;
    if (event.executionId || event.taskId) entry.executionIds.add(event.executionId || event.taskId);
    if (event.taskId) entry.taskIds.add(event.taskId);
    entry.lastAt = event.timestampUtc;
    requesterMap.set(key, entry);
  }

  const executionIds = [...new Set(filtered.map((event) => event.executionId || event.taskId).filter(Boolean))];
  const tasks = [];
  for (const executionId of executionIds) {
    const matching = filtered.filter((event) => (event.executionId || event.taskId) === executionId);
    const completeHistory = allEvents.filter((event) => (event.executionId || event.taskId) === executionId);
    const versionedHistory = completeHistory.filter((event) => event.evidenceLevel === "versioned-workflow-log");
    const legacyHistory = completeHistory.filter((event) => event.evidenceLevel === "legacy-unverified");
    const attributionHistory = versionedHistory.filter((event) => !TERMINAL_AUDIT_EVENTS.has(event.event));
    const created = versionedHistory.find((event) => event.event === "created")
      || completeHistory.find((event) => event.event === "created")
      || completeHistory[0];
    const recordedFiles = [...new Set(attributionHistory.flatMap((event) => Array.isArray(event.files) ? event.files : [])
      .map((file) => typeof file === "string" ? file.trim() : "").filter(Boolean))];
    const legacyClaimedFiles = [...new Set(legacyHistory.flatMap((event) => Array.isArray(event.files) ? event.files : [])
      .map((file) => typeof file === "string" ? file.trim() : "").filter(Boolean))];
    const gitHeads = [...new Set(versionedHistory.map((event) => event.gitHead).filter(Boolean))];
    const legacyActors = [...new Set(legacyHistory.map((event) => String(event.actor || "").trim()).filter(Boolean))];
    const executorMap = new Map();
    for (const event of versionedHistory) {
      if (![event.model, event.role, event.agent, event.provider].some((value) => String(value || "").trim())) continue;
      const executor = {
        model: String(event.model || "unknown"),
        modelLabel: String(event.modelLabel || "not-recorded"),
        role: String(event.role || "unknown"),
        agent: String(event.agent || "unknown"),
        provider: String(event.provider || "unknown"),
      };
      const key = `${executor.model}\u0000${executor.modelLabel}\u0000${executor.role}\u0000${executor.agent}\u0000${executor.provider}`;
      const existing = executorMap.get(key) || { ...executor, eventCount: 0, firstAt: event.timestampUtc, lastAt: event.timestampUtc };
      existing.eventCount += 1;
      existing.lastAt = event.timestampUtc;
      executorMap.set(key, existing);
    }
    const taskId = created?.taskId || matching.find((event) => event.taskId)?.taskId || null;
    const activeMatch = await findActiveForTask(state, executionId);
    const taskPath = taskId ? await findTaskPath(state, taskId, activeMatch?.active || {}) : null;
    const briefIdentity = taskPath ? await taskAuditIdentity(taskPath) : {};
    const period = activeMatch?.active?.period || zonedParts(created?.timestamp || now()).period;
    const currentMemory = await findExecutionMemoryPath(state, "current", executionId, period, activeMatch?.active?.currentMemoryPath);
    const recentMemory = await findExecutionMemoryPath(state, "recent", executionId, period, activeMatch?.active?.recentMemoryPath);
    const reportFiles = (await filesUnder(path.join(state, "reports", period))).filter((file) => path.basename(file).startsWith(`${executionId}-`) && file.endsWith(".md"));
    const artifactCandidates = {
      task: taskPath ? path.join(taskPath, "task.md") : null,
      brief: taskPath ? path.join(taskPath, "brief.md") : null,
      analysis: taskPath ? path.join(taskPath, "analysis.md") : null,
      checklists: taskPath ? path.join(taskPath, "checklists.md") : null,
      qa: taskPath ? path.join(taskPath, "qa.md") : null,
      result: taskPath ? path.join(taskPath, "result.md") : null,
      currentMemory,
      recentMemory,
      report: reportFiles[0] || null,
    };
    const artifacts = {};
    for (const [name, file] of Object.entries(artifactCandidates)) {
      artifacts[name] = file && await exists(file) ? path.relative(root, file).replace(/\\/g, "/") : null;
    }
    artifacts.logSources = [...new Set(completeHistory.map((event) => event.source))];
    tasks.push({
      executionId,
      taskId,
      workflowDepth: created?.workflowDepth || matching[0]?.workflowDepth || null,
      requestedBy: created?.requestedBy || briefIdentity.requestedBy || null,
      requesterId: created?.requesterId || briefIdentity.requesterId || null,
      identitySource: created?.identitySource || briefIdentity.identitySource || null,
      request: eventRequest(created || {}) || briefIdentity.request || null,
      firstAt: matching[0]?.timestampUtc || null,
      lastAt: matching.at(-1)?.timestampUtc || null,
      eventCount: matching.length,
      events: [...new Set(matching.map((event) => event.event))],
      recordedFiles,
      legacyClaimedFiles,
      executors: [...executorMap.values()],
      legacyActors,
      gitHeads,
      artifacts,
    });
  }

  const events = filtered.map(({ timestampMs, ...event }) => event);
  const auditStorage = auditStorageStatus(root, logFiles);
  const versionedEventCount = allEvents.filter((event) => event.evidenceLevel === "versioned-workflow-log").length;
  const legacyEventCount = allEvents.length - versionedEventCount;
  return {
    ok: true,
    timeBasis: "UTC",
    timestampSemantics: "events[].timestamp preserves the recorded value; events[].timestampUtc, requester/task ranges, and filters use normalized UTC.",
    rangeSemantics: "--from is inclusive; --to YYYY-MM-DD includes the whole UTC date; --days is a rolling 24-hour window.",
    attributionSemantics: {
      requestedBy: "Confirmed human who requested the task; not proof of who edited or committed files.",
      executionIdentity: "Actual model, optional configurable model label, role, agent, and provider recorded by the workflow event.",
      recordedFiles: "Paths claimed by valid versioned non-terminal workflow events; not filesystem or Git authorship proof.",
      legacyClaimedFiles: "Paths found only in unversioned legacy events; visible for diagnosis but never promoted into versioned attribution or closure events.",
      gitContext: "gitHead/gitDirty describe repository state when a versioned event was appended; use Git history/blame separately for commit authorship.",
      integrity: "Project-controlled JSONL is not cryptographically tamper-evident; inspect Git history or an external audit system when adversarial integrity matters.",
    },
    auditStorage,
    evidence: {
      versionedEventCount,
      legacyEventCount,
      invalidLineCount: invalidLines.length,
      includedEventCount: allEvents.length,
    },
    filters: {
      requester: requesterFilter || null,
      requesterId: requesterIdFilter || null,
      taskId: taskFilter || null,
      event: eventFilter || null,
      from: displayIso(fromMs),
      toExclusive: displayIso(toExclusiveMs),
      days,
    },
    count: events.length,
    requesters: [...requesterMap.values()].map((entry) => ({
      ...entry,
      executionIds: [...entry.executionIds],
      requesterIds: [...entry.requesterIds],
      taskIds: [...entry.taskIds],
    })),
    tasks,
    events,
    invalidLines,
  };
}

async function prune(root) {
  const state = path.join(root, ".agrimap-agent");
  const configPath = path.join(state, "config.json");
  if (!(await exists(configPath))) {
    return {
      ok: true,
      pruned: false,
      reason: "config-missing",
      retentionDays: null,
      removed: [],
      logsPreserved: true,
    };
  }

  let config;
  try {
    config = await readJson(configPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        ok: true,
        pruned: false,
        reason: "config-missing",
        retentionDays: null,
        removed: [],
        logsPreserved: true,
      };
    }
    const code = error instanceof SyntaxError ? "INVALID_CONFIG" : "CONFIG_READ_FAILED";
    return {
      ok: false,
      pruned: false,
      code,
      message: code === "INVALID_CONFIG"
        ? ".agrimap-agent/config.json is not valid JSON."
        : ".agrimap-agent/config.json could not be read.",
      retentionDays: null,
      removed: [],
      logsPreserved: true,
    };
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {
      ok: false,
      pruned: false,
      code: "INVALID_CONFIG",
      message: ".agrimap-agent/config.json must contain a JSON object.",
      retentionDays: null,
      removed: [],
      logsPreserved: true,
    };
  }
  const retentionDays = Math.min(30, Math.max(10, Number(config.retentionDays) || 30));
  const recent = path.join(state, "memory", "recent");
  const threshold = Date.now() - retentionDays * 86_400_000;
  const removed = [];
  for (const filePath of await filesUnder(recent)) {
    const details = await stat(filePath);
    if (details.isFile() && details.mtimeMs < threshold) {
      await rm(filePath, { force: true });
      removed.push(stateRelative(state, filePath));
    }
  }
  return { ok: true, pruned: true, retentionDays, removed, logsPreserved: true };
}

// Savepoint (5.0.1): record where unfinished work stands without an audit event.
async function savepoint(root, args) {
  const executionId = safeTaskId(args.execution || args["execution-id"] || args.task);
  if (!executionId) return { ok: false, message: "--execution is required." };
  const state = await ensureLayout(root);
  const activeMatch = await findActiveForTask(state, executionId, safeSessionId(args.session));
  if (activeMatch?.ambiguous) return activeTaskAmbiguityError(executionId, activeMatch.matches);
  if (!activeMatch?.active) return { ok: false, code: "ACTIVE_EXECUTION_NOT_FOUND", message: "No active execution matches this ID/session; use pending and resume first." };
  const active = activeMatch.active;
  const memoryPaths = activeMemoryPaths(state, active);
  const previous = parseSavepoint(await readFile(memoryPaths.current, "utf8").catch(() => ""));
  const merged = mergeSavepoint(previous, { done: args.done, remaining: args.remaining, next: args.next, decisions: args.decisions });
  const timestamp = now();
  await mkdir(path.dirname(memoryPaths.current), { recursive: true });
  await writeFile(memoryPaths.current, renderSavepoint({
    ...executionIdentity(args, active),
    ...merged,
    executionId,
    taskId: active.taskId,
    workflowDepth: active.workflowDepth,
    requestedBy: active.requestedBy,
    objective: active.objective,
    status: args.status || previous.status || "in-progress",
    session: active.sessionId || null,
    branch: gitPlace(root),
    updated: timestamp,
    checkpoint: { milestone: "savepoint", at: timestamp, summary: String(args.summary || merged.next || "Savepoint recorded.").trim() },
  }), "utf8");
  await appendRecentTerminal(state, active, "savepoint", merged.next || "Savepoint recorded.");
  return { ok: true, executionId, savepoint: stateRelative(state, memoryPaths.current), done: merged.done, remaining: merged.remaining, next: merged.next };
}

async function pending(root) {
  const state = path.join(root, ".agrimap-agent");
  if (!(await exists(state))) return { ok: true, pending: [] };
  return { ok: true, pending: await listPending(state) };
}

// Resume (5.0.1): attach an unfinished execution to this session. The runtime
// pointer moves; nothing is copied, so one execution never has two owners.
const RESUME_TAKEOVER_MS = 10 * 60_000;

async function resume(root, args) {
  const executionId = safeTaskId(args.execution || args["execution-id"] || args.task);
  const sessionId = safeSessionId(args.session);
  if (!executionId || !sessionId) return { ok: false, message: "--execution and --session are required." };
  const state = await ensureLayout(root);
  const entry = (await listPending(state)).find(item => item.executionId === executionId);
  if (!entry) return { ok: false, code: "SAVEPOINT_NOT_FOUND", message: "No unfinished execution has this ID; run pending to list them." };
  const targetPath = activeTaskPath(state, sessionId);
  const current = await readJson(targetPath).catch(() => null);
  if (current && current.executionId !== executionId) {
    return { ok: false, code: "SESSION_BUSY", activeExecution: current.executionId, message: "This session already owns another execution; savepoint or complete it first." };
  }
  const match = await findActiveForTask(state, executionId, null);
  if (match?.ambiguous) return activeTaskAmbiguityError(executionId, match.matches);
  let active = match?.active || null;
  if (match && match.activePath !== targetPath) {
    const idleMs = Date.now() - (await stat(match.activePath)).mtimeMs;
    if (idleMs < RESUME_TAKEOVER_MS && !args["take-over"]) {
      return { ok: false, code: "EXECUTION_RECENTLY_ACTIVE", ownerSession: path.basename(match.activePath, ".json"), message: "Another session touched this execution in the last 10 minutes; confirm it is closed, then retry with --take-over." };
    }
  }
  if (!active) {
    // Runtime state is local and may be gone; rebuild it from the savepoint and its created event.
    const created = (await auditEvidenceForExecution(state, executionId)).events.find(event => event.event === "created");
    const sp = parseSavepoint(await readFile(path.join(state, entry.path), "utf8"));
    const [, period, file] = entry.path.match(/^memory\/current\/(?:(\d{4}-\d{2})\/)?(.+)$/) || [];
    active = {
      artifactVersion: created?.artifactVersion || 3,
      executionId,
      runId: executionId,
      taskId: created?.taskId ?? null,
      period: period || null,
      slug: String(file || "").replace(/^\d+-?/, "").replace(/\.md$/, "") || "work",
      operation: "execute",
      workflowDepth: sp.workflowDepth || created?.workflowDepth || "light",
      objective: sp.objective || created?.request || "",
      requestedBy: sp.requestedBy || created?.requestedBy,
      requesterId: created?.requesterId || null,
      identitySource: created?.identitySource || "legacy-migrated",
      risk: created?.risk || "",
      startedAt: created?.timestamp || sp.updated,
      currentMemoryPath: entry.path,
      recentMemoryPath: entry.path.replace(/^memory\/current\//, "memory/recent/"),
      preexistingDirty: [],
    };
  }
  active = { ...active, sessionId, resumedAt: now() };
  await writeJson(targetPath, active);
  if (match && match.activePath !== targetPath) await rm(match.activePath, { force: true });
  const memoryPaths = activeMemoryPaths(state, active);
  const previous = parseSavepoint(await readFile(memoryPaths.current, "utf8").catch(() => ""));
  await writeFile(memoryPaths.current, renderSavepoint({
    ...executionIdentity(args, active), ...previous, executionId, taskId: active.taskId, workflowDepth: active.workflowDepth,
    requestedBy: active.requestedBy, objective: previous.objective || active.objective,
    status: "in-progress", session: sessionId, branch: gitPlace(root), updated: now(),
    checkpoint: { milestone: "resumed", at: now(), summary: `Resumed in session ${sessionId}.` },
  }), "utf8");
  await appendRecentTerminal(state, active, "resumed", `session ${sessionId}`);
  return {
    ok: true,
    executionId,
    objective: active.objective,
    branch: entry.branch,
    next: previous.next,
    remaining: previous.remaining,
    done: previous.done,
    savepoint: stateRelative(state, memoryPaths.current),
    message: entry.branch && entry.branch.split(" @ ")[0] !== gitPlace(root).split(" @ ")[0] ? `Savepoint was on ${entry.branch}; switch there before continuing.` : null,
  };
}

async function executionSummaries(state, executionId) {
  const { events } = await auditEvidenceForExecution(state, executionId);
  return events.filter((event) => ["changed", "verified"].includes(event.event) && event.milestone !== "work-branch").map((event) => event.summary).filter(Boolean).slice(-5);
}

const command = process.argv[2];
const subcommand = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : null;
// Redact before objective slugs and checkpoint truncation can expose fragments.
const args = redactValue(parseCliArgs(process.argv.slice(3)));
// Third word of two-level commands such as `spec sync plan`.
if (subcommand && process.argv[4] && !process.argv[4].startsWith("--")) args._action = process.argv[4];
const root = workspaceRoot(args.cwd || process.cwd());
let result;

switch (command) {
  case "requester": {
    const identity = await readConfirmedIdentity(path.join(root, '.agrimap-agent'), args.session, {defaultProvider: args.provider});
    result = {ok:true, identity, needsRequester: !identity || identity.expired,
      message: 'Read-only local attribution lookup. Reuse confirmed conversation identity when local evidence is missing; identity does not grant release approval.'};
    break;
  }
  case "init":
    result = await init(root, args);
    break;
  case "identify": {
    const state = await ensureLayout(root);
    result = await identify(state, args);
    break;
  }
  case "start":
    result = await start(root, args);
    break;
  case "checkpoint":
    result = await checkpoint(root, args);
    break;
  case "validate":
    result = await validate(root, args);
    break;
  case "complete":
    result = await complete(root, args);
    break;
  case "close":
    result = await closeTask(root, args);
    break;
  case "history":
    result = await history(root, args);
    break;
  case "prune":
    result = await prune(root);
    break;
  case "savepoint":
    result = await savepoint(root, args);
    break;
  case "pending":
    result = await pending(root);
    break;
  case "resume":
    result = await resume(root, args);
    break;
  default:
    result = GOVERNANCE_COMMANDS.includes(command)
      ? await runGovernanceCommand(command, subcommand, args, root, {
        appendLog,
        ensureLayout,
        activeTaskPath,
        resolveRequester,
        executionSummaries,
        isGitRoot: (target) => gitOutput(target, ["rev-parse", "--show-toplevel"]).ok,
        appendRecent: (state, active, status, summary) => appendRecentTerminal(state, active, status, summary),
      })
      : { ok: false, message: `Use requester, init, identify, start, checkpoint, savepoint, pending, resume, validate, complete, close, history, prune, ${GOVERNANCE_COMMANDS.join(", ")}.` };
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
