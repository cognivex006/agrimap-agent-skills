#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { LOG_EVENTS, MILESTONE_TYPES, QA_FAILED_EVENT } from "../skills/agrimap-agent-skills/scripts/log-events.mjs";
import {
  renderTaskArtifactSchemaDocs,
  taskArtifactRequiredSections,
  taskArtifactSchemaIssues,
} from "../skills/agrimap-agent-skills/scripts/task-artifact-schema.mjs";
import {
  operationConfigIssues,
  operationEntrypointPath,
  renderAliasSkill,
  renderAntigravitySkill,
  renderGeminiCommandPrompt,
  renderOperationAliasesModule,
  renderOperationIndex,
  renderOperationEntrypoint,
} from "./operation-entrypoints.mjs";
import {
  applyAgentsRoutingSection,
  applyMarkedBlock,
  loadRouting,
  renderRoutingReference,
  renderSqlContextBlock,
  SQL_CONTEXT_END,
  SQL_CONTEXT_START,
} from "../skills/agrimap-agent-skills/scripts/skill-routing.mjs";

const root = process.cwd();
const errors = [];
const agyManifest = JSON.parse(await readFile(path.join(root, 'plugin.json'), 'utf8'));
if (agyManifest.name !== 'agrimap-agent-skills' || Object.keys(agyManifest).some(key => !['name', 'description'].includes(key))) {
  errors.push('plugin.json: invalid Antigravity root manifest');
}
const { validateDocumentation } = await import('./validate-docs.mjs');
errors.push(...(await validateDocumentation(root)).errors);

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function parseJson(relativePath) {
  try {
    return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
  } catch (error) {
    errors.push(`${relativePath}: ${error.message}`);
    return null;
  }
}

async function filesUnder(directory) {
  const result = [];
  if (!(await exists(directory))) return result;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(entryPath));
    else result.push(entryPath);
  }
  return result;
}

function hookCommands(value) {
  if (Array.isArray(value)) return value.flatMap(hookCommands);
  if (!value || typeof value !== "object") return [];
  return [
    ...(typeof value.command === "string" ? [value.command] : []),
    ...Object.entries(value)
      .filter(([key]) => key !== "command")
      .flatMap(([, child]) => hookCommands(child)),
  ];
}

for (const required of [
  ".rgignore",
  ".gitignore",
  "skills/agrimap-agent-skills/SKILL.md",
  "plugins/agrimap-agent-skills/.codex-plugin/plugin.json",
  "plugins/agrimap-agent-skills/.claude-plugin/plugin.json",
  "plugins/agrimap-agent-skills/hooks/codex-hooks.json",
  "plugins/agrimap-agent-skills/hooks/claude-hooks.json",
  ".agents/plugins/marketplace.json",
  ".claude-plugin/marketplace.json",
  "gemini-extension.json",
  "plugin.json",
  "hooks/hooks.json",
  "skills/agrimap-agent-skills/references/patterns/conflict-resolution.md",
  "skills/agrimap-agent-skills/references/analysis-discipline.md",
  "skills/agrimap-agent-skills/references/glossary.md",
  "skills/agrimap-agent-skills/references/lifecycle-core.md",
  "skills/agrimap-agent-skills/references/goal-rules.md",
  "skills/agrimap-agent-skills/references/prompt.md",
  "skills/agrimap-agent-skills/references/application-url-matrix.md",
  "skills/agrimap-agent-skills/references/service-url-matrix.md",
  "skills/agrimap-agent-skills/references/runtime-core.md",
  "skills/agrimap-agent-skills/references/backend-engineer.md",
  "skills/agrimap-agent-skills/references/db-schema-context.md",
  "skills/agrimap-agent-skills/references/service-ownership.md",
  "skills/agrimap-agent-skills/references/evals/sql-scenarios.md",
  "skills/agrimap-agent-skills/scripts/log-events.mjs",
  "skills/agrimap-agent-skills/scripts/operation-aliases.mjs",
  "skills/agrimap-agent-skills/scripts/install-sqlfluff.mjs",
  "skills/agrimap-agent-skills/scripts/identity.mjs",
  "skills/agrimap-agent-skills/scripts/task-artifact-schema.mjs",
  "skills/agrimap-agent-skills/scripts/agm-prompt-version.mjs",
  "skills/agrimap-agent-skills/scripts/token-coverage.mjs",
  "skills/agrimap-agent-skills/scripts/sql-contract-preflight.mjs",
  "skills/agrimap-agent-skills/scripts/validate-sql-artifacts.mjs",
  "skills/agrimap-agent-skills/scripts/mcp-server.mjs",
  "skills/agrimap-agent-skills/assets/task-artifact-schema.json",
  "skills/agrimap-agent-skills/assets/passive-skill-map.json",
  "skills/agrimap-agent-skills/assets/skill-routing.json",
  "skills/agrimap-agent-skills/scripts/skill-routing.mjs",
  "skills/agrimap-agent-skills/scripts/skill-gate.mjs",
  "skills/agrimap-agent-skills/references/skill-routing.md",
  "tests/unit/skill-routing.test.mjs",
  "tests/unit/skill-gate.test.mjs",
  "skills/agrimap-agent-skills/assets/token-coverage-scenarios.json",
  "skills/agrimap-agent-skills/assets/templates/service-ownership.yaml",
  "skills/agrimap-agent-skills/assets/templates/execution-report.md",
  "tests/README.md",
  "tests/helpers/harness.mjs",
  "tests/unit/cli-args.test.mjs",
  "tests/unit/extract-code-blocks.test.mjs",
  "tests/unit/fe-scenarios.test.mjs",
  "tests/unit/feature-lifecycle-policy.test.mjs",
  "tests/unit/governance-policy.test.mjs",
  "tests/unit/operation-contracts.test.mjs",
  "tests/unit/prompt-version.test.mjs",
  "tests/unit/qa-policy.test.mjs",
  "tests/unit/sql-artifacts.test.mjs",
  "tests/unit/sql-contract-preflight.test.mjs",
  "tests/unit/sql-scenarios.test.mjs",
  "tests/unit/sqlfluff-install.test.mjs",
  "tests/unit/task-artifact-schema.test.mjs",
  "tests/unit/verify-golden.test.mjs",
  "tests/unit/mcp-server.test.mjs",
  "tests/integration/package/usage.test.mjs",
  "tests/integration/workspace/workspace.test.mjs",
  "tests/integration/workspace/cases/bootstrap-and-prune.mjs",
  "tests/integration/workspace/cases/identity-and-checkpoint.mjs",
  "tests/integration/workspace/cases/hooks.mjs",
  "tests/integration/workspace/cases/completion.mjs",
  "tests/integration/workspace/cases/history.mjs",
  "tests/integration/workspace/cases/frontend-reuse.mjs",
  "tools/operation-entrypoints.mjs",
  "docs/USAGE.md",
  "plugins/agrimap-agent-skills/docs/USAGE.md",
  "examples/inputs/LONG-REQUEST.md",
  "examples/inputs/references/checkout-flow.svg",
  "plugins/agrimap-agent-skills/examples/inputs/references/checkout-flow.svg",
]) {
  if (!(await exists(path.join(root, required)))) errors.push(`${required}: missing`);
}

const gitignore = await readFile(path.join(root, ".gitignore"), "utf8");
if (!/^\.tmp-\*\/$/m.test(gitignore)) errors.push(".gitignore must keep .tmp-*/ as a residue safety net.");
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name.startsWith(".tmp-")) errors.push(`Workspace temp residue is forbidden: ${entry.name}`);
}

for (const legacyTestRunner of ["tools/test-scripts.mjs", "tools/test-usage-examples.mjs"]) {
  if (await exists(path.join(root, legacyTestRunner))) errors.push(`${legacyTestRunner}: obsolete monolithic test runner found`);
}

const packageManifest = await parseJson("package.json");
const operations = await parseJson("config/operations.json");
const codexPlugin = await parseJson("plugins/agrimap-agent-skills/.codex-plugin/plugin.json");
const claudePlugin = await parseJson("plugins/agrimap-agent-skills/.claude-plugin/plugin.json");
const codexMarketplace = await parseJson(".agents/plugins/marketplace.json");
const claudeMarketplace = await parseJson(".claude-plugin/marketplace.json");
const geminiExtension = await parseJson("gemini-extension.json");
const geminiHooks = await parseJson("hooks/hooks.json");
const codexHooks = await parseJson("plugins/agrimap-agent-skills/hooks/codex-hooks.json");
const claudeHooks = await parseJson("plugins/agrimap-agent-skills/hooks/claude-hooks.json");
const taskArtifactSchema = await parseJson("skills/agrimap-agent-skills/assets/task-artifact-schema.json");
const passiveSkillMap = await parseJson("skills/agrimap-agent-skills/assets/passive-skill-map.json");
const rgIgnore = await readFile(path.join(root, ".rgignore"), "utf8");
const generatedMirrorIgnore = "/plugins/agrimap-agent-skills/skills/agrimap-agent-skills/**";
if (!rgIgnore.split(/\r?\n/).includes(generatedMirrorIgnore)) errors.push(`.rgignore must exclude the generated canonical mirror: ${generatedMirrorIgnore}`);

if (operations) {
  for (const issue of operationConfigIssues(operations)) errors.push(`Operation config: ${issue}`);
  const operationIndexPath = path.join(root, "skills", "agrimap-agent-skills", "references", "operation-index.md");
  if (!(await exists(operationIndexPath))) {
    errors.push(`${path.relative(root, operationIndexPath)}: operation routing index missing; run npm run sync.`);
  } else if (await readFile(operationIndexPath, "utf8") !== renderOperationIndex(operations)) {
    errors.push(`${path.relative(root, operationIndexPath)}: operation routing index is stale; run npm run sync.`);
  }
  const operationAliasesPath = path.join(root, "skills", "agrimap-agent-skills", "scripts", "operation-aliases.mjs");
  if (!(await exists(operationAliasesPath))) {
    errors.push(`${path.relative(root, operationAliasesPath)}: operation alias registry missing; run npm run sync.`);
  } else if (await readFile(operationAliasesPath, "utf8") !== renderOperationAliasesModule(operations)) {
    errors.push(`${path.relative(root, operationAliasesPath)}: operation alias registry is stale; run npm run sync.`);
  }
  for (const item of operations.operations || []) {
    const agyPath = path.join(root, 'skills', `${item.name}.md`);
    if (!await exists(agyPath) || await readFile(agyPath, 'utf8') !== renderAntigravitySkill(item)) {
      errors.push(`skills/${item.name}.md: missing or stale Antigravity skill; run npm run sync.`);
    }
    const entrypointPath = operationEntrypointPath(path.join(root, "skills", "agrimap-agent-skills"), item);
    if (!(await exists(entrypointPath))) {
      errors.push(`${path.relative(root, entrypointPath)}: compact operation entrypoint missing; run npm run sync.`);
    } else if (await readFile(entrypointPath, "utf8") !== renderOperationEntrypoint(item)) {
      errors.push(`${path.relative(root, entrypointPath)}: compact operation entrypoint is stale; run npm run sync.`);
    }
    const aliasPath = path.join(root, "plugins", "agrimap-agent-skills", "skills", item.name, "SKILL.md");
    if (await exists(aliasPath) && await readFile(aliasPath, "utf8") !== renderAliasSkill(item)) {
      errors.push(`${path.relative(root, aliasPath)}: generated compact alias is stale; run npm run sync.`);
    }
    const commandPath = path.join(root, "commands", `${item.name}.toml`);
    if (await exists(commandPath)) {
      const expected = `description = ${JSON.stringify(item.description)}\nprompt = ${JSON.stringify(renderGeminiCommandPrompt(item))}\n`;
      if (await readFile(commandPath, "utf8") !== expected) errors.push(`${path.relative(root, commandPath)}: generated compact Gemini command is stale; run npm run sync.`);
    }
  }
}

// Skill routing registry (4.9.5): one source for the reference, bootstrap §0 and sql-context recipes.
try {
  const routing = loadRouting();
  const raw = routing.raw;
  const skills = new Set([raw.router, ...(operations?.operations || []).map((item) => item.name)]);
  if (raw.schemaVersion !== 1) errors.push("skill-routing.json must use schemaVersion 1.");
  for (const host of ["claude", "codex", "antigravity"]) if (!raw.hosts.some((item) => item.id === host && item.pattern.includes("{skill}"))) errors.push(`skill-routing.json: host ${host} needs a {skill} pattern.`);
  for (const lane of raw.lanes) if (!skills.has(lane.skill)) errors.push(`skill-routing.json: lane ${lane.id} names unknown skill ${lane.skill}.`);
  for (const intent of raw.intents) {
    for (const skill of [intent.single, intent.cross].filter((value) => value !== "{lane}")) if (!skills.has(skill)) errors.push(`skill-routing.json: intent ${intent.id} names unknown skill ${skill}.`);
  }
  if (JSON.stringify([...raw.displayOrder].sort()) !== JSON.stringify(raw.intents.map((intent) => intent.id).sort())) errors.push("skill-routing.json: displayOrder must list every intent once.");
  const referencePath = path.join(root, "skills/agrimap-agent-skills/references/skill-routing.md");
  if (!(await exists(referencePath)) || await readFile(referencePath, "utf8") !== renderRoutingReference(routing)) errors.push("references/skill-routing.md is missing or stale; run npm run sync.");
  const coreAgents = await readFile(path.join(root, "skills/agrimap-agent-skills/assets/bootstrap/AGENTS.md"), "utf8");
  if (applyAgentsRoutingSection(coreAgents, routing) !== coreAgents) errors.push("Bootstrap AGENTS.md §0 routing block is stale; run npm run sync.");
  const sqlContext = await readFile(path.join(root, "skills/agrimap-agent-skills/references/sql-context-readonly.md"), "utf8");
  if (applyMarkedBlock(sqlContext, SQL_CONTEXT_START, SQL_CONTEXT_END, renderSqlContextBlock(routing)) !== sqlContext) errors.push("sql-context-readonly.md recipe block is stale; run npm run sync.");
} catch (error) {
  errors.push(`Skill routing registry invalid: ${error.message}`);
}

if (passiveSkillMap) {
  if (passiveSkillMap.schemaVersion !== 1 || !Array.isArray(passiveSkillMap.capabilities)) errors.push("Passive skill map must use schemaVersion 1 with a capabilities array.");
  const capabilities = passiveSkillMap.capabilities || [];
  const ids = capabilities.map((item) => item.id);
  if (new Set(ids).size !== ids.length) errors.push("Passive capability IDs must be unique.");
  for (const requiredId of ["goal-rules", "refactor-guard", "test-decision", "design-discipline", "sql-explain"]) {
    if (!ids.includes(requiredId)) errors.push(`Passive skill map missing ${requiredId}.`);
  }
  for (const capability of capabilities) {
    for (const field of ["id", "reference", "activation", "authorityEffect", "conflicts"]) {
      if (!String(capability?.[field] || "").trim()) errors.push(`Passive capability ${capability?.id || "unknown"} missing ${field}.`);
    }
    for (const field of ["operations", "actions", "requiredInputs", "evidenceOutput"]) {
      if (!Array.isArray(capability?.[field]) || capability[field].length === 0) errors.push(`Passive capability ${capability?.id || "unknown"} requires non-empty ${field}.`);
    }
    if (capability?.grantsProductWrite !== false) errors.push(`Passive capability ${capability?.id || "unknown"} must set grantsProductWrite=false.`);
    const referenceFile = String(capability?.reference || "").split("#", 1)[0];
    if (referenceFile && !(await exists(path.join(root, "skills", "agrimap-agent-skills", "references", referenceFile)))) errors.push(`Passive capability ${capability?.id} reference is missing: ${referenceFile}.`);
  }
  const goalRules = capabilities.find((item) => item.id === "goal-rules");
  const requiredGoalOperations = ["analyze", "architect", "be", "diagnose", "fe", "sql", "execute", "plan", "qa", "prompt", "release", "doctor"];
  if (JSON.stringify(goalRules?.operations) !== JSON.stringify(requiredGoalOperations)) errors.push("goal-rules operation mapping is incomplete or reordered unexpectedly.");
  for (const operation of requiredGoalOperations) {
    const item = operations?.operations?.find((candidate) => candidate.operation === operation);
    if (!item?.references?.some((reference) => reference.path === "goal-rules.md")) errors.push(`${operation} must load mandatory goal-rules.md.`);
  }
}


if (!packageManifest.scripts.test.includes("npm run validate") || !packageManifest.scripts["test:unit"].includes("v3-governance.test.mjs")) errors.push("v3 validation and behavioral tests must be release gates.");
for (const issue of taskArtifactSchemaIssues(taskArtifactSchema)) errors.push(issue);
if (taskArtifactSchema.runtimeArtifactVersion !== 3) errors.push("Runtime artifact schema must be v3.");
for (const file of ["README.md", "docs/USAGE.md"]) {
  if (!(await readFile(path.join(root,file),"utf8")).includes(renderTaskArtifactSchemaDocs(taskArtifactSchema).trim())) errors.push(file + ": stale artifact schema documentation");
}
const bootstrapRoot = path.join(root,"skills/agrimap-agent-skills/assets/bootstrap");
const bootstrapManifest = JSON.parse(await readFile(path.join(bootstrapRoot,"manifest.json"),"utf8"));
if (bootstrapManifest.version !== packageManifest.version) errors.push("Bootstrap version drift");
const { createHash } = await import("node:crypto");
for (const item of bootstrapManifest.files) {
  const content = await readFile(path.join(bootstrapRoot,item.source));
  if (createHash("sha256").update(content).digest("hex") !== item.sha256) errors.push("Bootstrap hash drift: " + item.source);
}
for (const item of operations.operations) {
  for (const ref of [...(item.references || []), ...(item.conditionalReferences || [])]) {
    const relative = typeof ref === "string" ? ref : ref.path;
    if (relative && !(await exists(path.join(root,"skills/agrimap-agent-skills/references",relative.split("#")[0])))) errors.push("Missing operation reference: " + relative);
  }
}
const rootIgnore = await readFile(path.join(root, ".gitignore"), "utf8").catch(() => "");
if (!rootIgnore.split(/\r?\n/).includes(".agrimap-agent/")) errors.push("Development repository must ignore its entire local .agrimap-agent state.");

const goldenManifest = await parseJson("skills/agrimap-agent-skills/references/patterns/golden/manifest.json");
if (goldenManifest?.annotation !== "../conflict-resolution.md") errors.push("Golden manifest does not point to the canonical conflict annotation.");
if (packageManifest?.repository?.url !== "git+https://github.com/cognivex006/agrimap-agent-skills.git") errors.push("Package repository URL is invalid.");

const referenceRoot = path.join(root, "skills", "agrimap-agent-skills", "references");
for (const file of (await filesUnder(referenceRoot)).filter((candidate) => candidate.endsWith(".md") && !candidate.includes(`${path.sep}patterns${path.sep}golden${path.sep}`))) {
  const content = await readFile(file, "utf8");
  if (content.split(/\r?\n/).length > 100 && !/^## (?:สารบัญ|Table of contents|Contents)\s*$/m.test(content.split(/\r?\n/).slice(0, 45).join("\n"))) {
    errors.push(`${path.relative(root, file)}: reference over 100 lines must include a top-level table of contents near the start.`);
  }
}
for (const file of (await filesUnder(path.join(referenceRoot, "patterns", "golden"))).filter((candidate) => candidate.endsWith(".json"))) {
  try {
    JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    errors.push(`${path.relative(root, file)}: .json golden file is not strict JSON: ${error.message}`);
  }
}

if (await exists(path.join(root, ".agm"))) errors.push("Legacy .agm directory must not exist.");
if (await exists(path.join(root, ".agrimap-agent", "owner.json"))) errors.push("Shared owner.json must not exist.");
if (await exists(path.join(root, ".agrimap-agent", "runtime", "active-task.json"))) errors.push("Shared active-task.json must not exist.");

for (const [label, manifest] of [["Codex", codexPlugin], ["Claude", claudePlugin], ["Gemini", geminiExtension]]) {
  if (manifest && manifest.name !== "agrimap-agent-skills") errors.push(`${label} manifest name differs from agrimap-agent-skills.`);
  if (manifest && manifest.version !== packageManifest?.version) errors.push(`${label} manifest version differs from package version ${packageManifest?.version}.`);
}
if (codexMarketplace?.plugins?.[0]?.source?.path !== "./plugins/agrimap-agent-skills") errors.push("Codex marketplace source path is invalid.");
if (claudeMarketplace?.plugins?.[0]?.source !== "./plugins/agrimap-agent-skills") errors.push("Claude marketplace source path is invalid.");
if (claudeMarketplace?.plugins?.[0]?.version !== packageManifest?.version) errors.push(`Claude marketplace version differs from package version ${packageManifest?.version}.`);
if (!geminiHooks?.hooks?.SessionStart || !geminiHooks?.hooks?.BeforeAgent) errors.push("Gemini context hooks are incomplete.");
const geminiMcpServers = geminiExtension?.mcpServers;
const geminiMcpNames = geminiMcpServers ? Object.keys(geminiMcpServers) : [];
if (geminiMcpNames.length !== 1 || geminiMcpNames[0] !== "agrimap") {
  errors.push("Gemini extension must declare exactly one MCP server named `agrimap` (no underscore) to serve bundled references.");
} else {
  const agrimapServer = geminiMcpServers.agrimap;
  const mcpArgs = Array.isArray(agrimapServer?.args) ? agrimapServer.args.join(" ") : "";
  if (agrimapServer?.command !== "node") errors.push("Gemini MCP server must launch with `node`.");
  if (!mcpArgs.includes("${extensionPath}") || !mcpArgs.includes("scripts") || !mcpArgs.includes("mcp-server.mjs")) {
    errors.push("Gemini MCP server args must resolve mcp-server.mjs through ${extensionPath}.");
  }
}
if (packageManifest && !packageManifest?.scripts?.["test:unit"]?.includes("mcp-server.test.mjs")) errors.push("Gemini MCP server test is not wired into the automated unit suite.");
if (codexPlugin?.hooks !== "./hooks/codex-hooks.json") errors.push("Codex manifest must select the Codex-specific hook file.");
if (claudePlugin?.hooks !== "./hooks/claude-hooks.json") errors.push("Claude manifest must select the Claude-specific hook file.");
if (await exists(path.join(root, "plugins", "agrimap-agent-skills", "hooks", "hooks.json"))) errors.push("Ambiguous default plugin hooks/hooks.json must not exist.");
if (!codexHooks?.hooks?.SessionStart || !codexHooks?.hooks?.UserPromptSubmit || !codexHooks?.hooks?.SubagentStart) errors.push("Codex context hooks are incomplete.");
if (!claudeHooks?.hooks?.SessionStart || !claudeHooks?.hooks?.UserPromptSubmit || !claudeHooks?.hooks?.SubagentStart) errors.push("Claude context hooks are incomplete.");
if (!claudeHooks?.hooks?.PreToolUse?.some((entry) => entry.matcher === "Bash|PowerShell" && JSON.stringify(entry).includes("git-guard.mjs")) || !JSON.stringify(claudeHooks?.hooks?.Stop || []).includes("delivery-reminder.mjs")) errors.push("Claude guard hooks (PreToolUse Bash|PowerShell git-guard, Stop delivery-reminder) are missing.");
if (!claudeHooks?.hooks?.PreToolUse?.some((entry) => entry.matcher === "Edit|Write|MultiEdit|NotebookEdit" && JSON.stringify(entry).includes("skill-gate.mjs"))) errors.push("Claude skill gate hook (PreToolUse Edit|Write|MultiEdit|NotebookEdit skill-gate) is missing.");
// Guards stay off hosts whose pre-tool format is unconfirmed (spec §20.4 step 0).
if (codexHooks?.hooks?.PreToolUse || codexHooks?.hooks?.Stop) errors.push("Codex guard hooks are not confirmed for this host; do not install them.");
if (geminiHooks?.hooks?.BeforeTool) errors.push("Gemini BeforeTool guard is not confirmed for this host; do not install it.");
const codexHookCommands = hookCommands(codexHooks);
if (!codexHookCommands.length || codexHookCommands.some((command) => !command.includes("--provider codex") || !command.includes("${PLUGIN_ROOT}"))) errors.push("Codex hooks must pass an explicit codex provider and use PLUGIN_ROOT.");
const claudeHookCommands = hookCommands(claudeHooks);
if (!claudeHookCommands.length || claudeHookCommands.some((command) => !command.includes("--provider claude"))) errors.push("Claude hooks must pass an explicit claude provider.");
const geminiHookCommands = hookCommands(geminiHooks);
if (!geminiHookCommands.length || geminiHookCommands.some((command) => !command.includes("--provider gemini"))) errors.push("Gemini hooks must pass an explicit gemini provider.");

if (operations) {
  const names = operations.operations.map((item) => item.name);
  if (new Set(names).size !== names.length) errors.push("Operation aliases are not unique.");
  if (names.includes("agm-fe-engineer")) errors.push("Passive frontend discipline must not expose agm-fe-engineer.");
  for (const removed of ["agm-design","agm-simulate","agm-review","agm-history"]) if (names.includes(removed)) errors.push(`${removed} is removed from the public surface.`);
  for (const [name, actions] of Object.entries({ "agm-fe": ["analyze", "design", "create", "edit", "refactor", "test"], "agm-be": ["analyze", "design", "create", "edit", "refactor", "test"], "agm-sql": ["analyze", "design", "create", "edit", "refactor", "explain", "context-check", "context-migrate"] })) {
    const item = operations.operations.find((candidate) => candidate.name === name);
    if (item?.mode !== "action-routed") errors.push(`${name} must be action-routed.`);
    if (JSON.stringify(item?.actions?.map((action) => action.name)) !== JSON.stringify(actions)) errors.push(`${name} action list is invalid.`);
  }
  for (const name of ["agm-fe", "agm-be", "agm-sql"]) {
    const refactor = operations.operations.find((item) => item.name === name)?.actions?.find((action) => action.name === "refactor");
    if (refactor?.mode !== "product-write" || refactor?.activation !== "explicit" || JSON.stringify(refactor?.depths) !== JSON.stringify(["light", "standard", "regulated"])) {
      errors.push(`${name} action=refactor must be explicit product-write at light|standard|regulated.`);
    }
  }
  for (const keptName of ["agm-analyze"])
    if (!operations.operations.some((item) => item.name === keptName && item.visibility !== "compatibility")) errors.push(`${keptName} must remain a primary operation.`);
  for (const removedName of ["agm-create-feature", "agm-create-unit-test", "agm-refactor", "agm-refactor-fe", "agm-refactor-be", "agm-refactor-sql", "agm-create-prompt"])
    if (operations.operations.some((item) => item.name === removedName)) errors.push(`${removedName} must be absent from the distributed operation surface.`);
  const promptOperation = operations.operations.find((item) => item.name === "agm-prompt" && item.operation === "prompt");
  if (promptOperation?.mode !== "workflow-write-only" || JSON.stringify(promptOperation?.depth) !== JSON.stringify({ default: "light", allowed: ["light"] }) ) {
    errors.push("agm-prompt must be light-only workflow-write-only and artifactless.");
  }
  for (const name of names) {
    for (const target of [
      path.join(root, "commands", `${name}.toml`),
      path.join(root, "plugins", "agrimap-agent-skills", "skills", name, "SKILL.md"),
    ]) {
      if (!(await exists(target))) errors.push(`${path.relative(root, target)}: generated adapter missing`);
    }
  }
  const commands = (await filesUnder(path.join(root, "commands"))).filter((file) => file.endsWith(".toml"));
  if (commands.length !== names.length) errors.push(`Expected ${names.length} Gemini commands; found ${commands.length}.`);
}

for (const command of await filesUnder(path.join(root, "commands"))) {
  if (!command.endsWith(".toml")) continue;
  const content = await readFile(command, "utf8");
  if (!/^description = ".+"\r?\nprompt = ".+"\r?\n$/s.test(content)) errors.push(`${path.relative(root, command)}: unexpected TOML adapter shape`);
  if (content.includes("\\\\n")) errors.push(`${path.relative(root, command)}: contains literal escaped newline text`);
}

const canonicalDirectory = path.join(root, "skills", "agrimap-agent-skills");
const pluginCanonicalDirectory = path.join(root, "plugins", "agrimap-agent-skills", "skills", "agrimap-agent-skills");
const canonicalFiles = (await filesUnder(canonicalDirectory)).map((file) => path.relative(canonicalDirectory, file)).sort();
const pluginCanonicalFiles = (await filesUnder(pluginCanonicalDirectory)).map((file) => path.relative(pluginCanonicalDirectory, file)).sort();

for (const relativeFile of canonicalFiles.filter((file) => file.endsWith(".md"))) {
  const sourcePath = path.join(canonicalDirectory, relativeFile);
  const content = await readFile(sourcePath, "utf8");
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const rawTarget = match[1].trim();
    if (/^(?:https?:\/\/|mailto:|#)/i.test(rawTarget)) continue;
    const target = rawTarget.split("#", 1)[0];
    const resolvedTarget = path.resolve(path.dirname(sourcePath), target);
    const relativeTarget = path.relative(canonicalDirectory, resolvedTarget);
    if (relativeTarget === ".." || relativeTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTarget)) {
      errors.push(`${path.relative(root, sourcePath)}: relative link escapes the standalone skill root: ${rawTarget}`);
    } else if (!(await exists(resolvedTarget))) {
      errors.push(`${path.relative(root, sourcePath)}: relative link target is missing: ${rawTarget}`);
    }
  }
}

if (JSON.stringify(canonicalFiles) !== JSON.stringify(pluginCanonicalFiles)) {
  errors.push("Plugin routing-skill/shared-resource file list differs from the authored source; run npm run sync.");
} else {
  for (const relativeFile of canonicalFiles) {
    const authored = await readFile(path.join(canonicalDirectory, relativeFile));
    const generated = await readFile(path.join(pluginCanonicalDirectory, relativeFile));
    if (!authored.equals(generated)) errors.push(`Plugin canonical copy differs: ${relativeFile}`);
  }
}

try {
  const result = JSON.parse(execFileSync(process.execPath, [path.join(root, "skills", "agrimap-agent-skills", "scripts", "verify-golden.mjs")], { cwd: root, encoding: "utf8" }));
  assert.equal(result.ok, true);
} catch (error) {
  errors.push(`Golden verification failed: ${error.message}`);
}

if (errors.length) {
  process.stdout.write(`${JSON.stringify({ ok: false, errors }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({ ok: true, aliases: operations.operations.length, checks: "manifests, provider isolation, adapters, routing-only skill, dedicated operation skills, v3 behavior gate, legacy schema compatibility, bootstrap hashes, golden sources" }, null, 2)}\n`);
}
