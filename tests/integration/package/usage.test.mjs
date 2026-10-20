import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { projectRoot } from "../../helpers/harness.mjs";

const read = (relativePath) => readFile(path.join(projectRoot, relativePath), "utf8");
const operations = JSON.parse(await read("config/operations.json")).operations;
const publicOperations = operations.filter((item) => item.visibility !== "compatibility");
const compatibilityOperations = operations.filter((item) => item.visibility === "compatibility");
const usage = await read("docs/USAGE.md");
const canonical = await read("skills/agrimap-agent-skills/SKILL.md");
const operationIndex = await read("skills/agrimap-agent-skills/references/operation-index.md");
const platformSyntax = await read("skills/agrimap-agent-skills/references/platform-syntax.md");
const rootIgnore = await read(".gitignore");
const rgIgnore = await read(".rgignore");
const codexManifest = JSON.parse(await read("plugins/agrimap-agent-skills/.codex-plugin/plugin.json"));
const claudeManifest = JSON.parse(await read("plugins/agrimap-agent-skills/.claude-plugin/plugin.json"));
const geminiManifest = JSON.parse(await read("gemini-extension.json"));
const refactorModes = [...(await read("skills/agrimap-agent-skills/references/refactor-modes.md")).matchAll(/^## `([^`]+)`/gm)].map((match) => match[1]);

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(entryPath));
    else files.push(entryPath);
  }
  return files;
}

test("published aliases use operation-specific progressive-disclosure entrypoints", async () => {
  assert.ok(operations.some((item) => item.name === "agm-history" && item.operation === "history"));
  for (const item of operations) {
    if (item.visibility === "compatibility") {
      assert.ok(!operationIndex.includes(`| \`${item.name}\` | \`${item.operation}\` |`));
    } else {
      assert.ok(operationIndex.includes(`| \`${item.name}\` | \`${item.operation}\` |`));
    }
    const aliasSkill = await read(`plugins/agrimap-agent-skills/skills/${item.name}/SKILL.md`);
    const geminiCommand = await read(`commands/${item.name}.toml`);
    assert.match(aliasSkill, /references\/lifecycle-core\.md/);
    assert.doesNotMatch(aliasSkill, /references\/(?:runtime-core|glossary)\.md/);
    assert.ok(aliasSkill.includes(`references/operations/${item.operation}.md`));
    assert.ok(aliasSkill.includes(`Run only operation \`${item.operation}\``));
    assert.match(aliasSkill, /Scope gate: before loading lifecycle/);
    assert.ok(aliasSkill.includes(`explicitly invokes \`${item.name}\``));
    assert.ok(aliasSkill.includes(`AGRIMAP_EXPLICIT_ALIAS=${item.name}`));
    assert.match(aliasSkill, /ordinary non-AgriMap request without reading AgriMap references or writing AgriMap state/);
    assert.match(aliasSkill, /Do \*\*not\*\* preload the glossary, umbrella, or another operation/);
    assert.match(aliasSkill, /never fall back to the router/);
    assert.match(aliasSkill, /standalone `-h` or `--help`/);
    assert.ok(geminiCommand.includes(`operation ${item.operation}`));
    assert.match(geminiCommand, /compact progressive-disclosure entrypoint/);
    assert.match(geminiCommand, /do not preload the glossary, routing SKILL\.md, or another operation/);
    assert.match(geminiCommand, /never fall back to the router/);
    assert.match(geminiCommand, /standalone -h or --help token/);
    assert.ok(geminiCommand.includes(`AGRIMAP_EXPLICIT_ALIAS=${item.name}`));
    const operationEntrypoint = await read(`skills/agrimap-agent-skills/references/operations/${item.operation}.md`);
    assert.ok(operationEntrypoint.includes(`Operation: \`${item.operation}\``));
    assert.ok(operationEntrypoint.includes(`Workflow depth: default \`${item.depth.default}\``));
    for (const depth of item.depth.allowed) assert.ok(operationEntrypoint.includes(`\`${depth}\``));
    assert.match(operationEntrypoint, /PACKAGE_ENTRYPOINT_MISSING/);
  }

  const commands = (await readdir(path.join(projectRoot, "commands"))).filter((name) => name.endsWith(".toml"));
  assert.deepEqual(commands.sort(), operations.map((item) => `${item.name}.toml`).sort());
  assert.equal(operations.some((item) => item.name === "agm-fe-engineer"), false);
  assert.deepEqual(publicOperations.filter((item) => item.mode === "action-routed").map((item) => item.name).sort(), ["agm-be", "agm-fe", "agm-sql"]);
  assert.deepEqual(compatibilityOperations.map((item) => item.name).sort(), []);
  assert.ok(publicOperations.some((item) => item.name === "agm-analyze"));
  assert.ok(publicOperations.some((item) => item.name === "agm-design"));
  assert.deepEqual(operations.find((item) => item.operation === "history").depth.allowed, ["light"]);
  assert.match(operationIndex, /not an execution contract/);
  assert.doesNotMatch(operationIndex, /Deprecated compatibility aliases/i);
});

test("plugin routing skill and shared resources mirror the canonical source", async () => {
  const canonicalRoot = path.join(projectRoot, "skills", "agrimap-agent-skills");
  const mirrorRoot = path.join(projectRoot, "plugins", "agrimap-agent-skills", "skills", "agrimap-agent-skills");
  const canonicalFiles = (await filesUnder(canonicalRoot)).map((file) => path.relative(canonicalRoot, file)).sort();
  const mirrorFiles = (await filesUnder(mirrorRoot)).map((file) => path.relative(mirrorRoot, file)).sort();
  assert.deepEqual(mirrorFiles, canonicalFiles, "Run npm run sync: plugin routing/shared file list drifted from canonical.");
  for (const relativeFile of canonicalFiles) {
    assert.deepEqual(
      await readFile(path.join(mirrorRoot, relativeFile)),
      await readFile(path.join(canonicalRoot, relativeFile)),
      `Run npm run sync: plugin routing/shared content drifted at ${relativeFile}.`,
    );
  }
  assert.match(await read("plugins/agrimap-agent-skills/README.md"), /Do not edit generated copies directly/);
});

test("usage documentation separates routing from operation activation and help", async () => {
  assert.match(canonical, /AgriMap router active/);
  assert.match(canonical, /Scope gate: before reading the operation index/);
  assert.match(canonical, /explicitly invokes `agrimap-agent-skills`/);
  assert.match(canonical, /Perform one task only/);
  assert.match(canonical, /For `-h`, `--help`/);
  assert.doesNotMatch(canonical, /## Start every task|## Delegate deliberately|## Verify and close/);
  assert.ok(canonical.split(/\r?\n/).length <= 80);
  assert.doesNotMatch(canonical, /\.\.\/\.\.\/docs\/USAGE\.md/);
  assert.doesNotMatch(platformSyntax, /\.\.\/\.\.\/\.\.\/docs\/USAGE\.md/);
  assert.match(platformSyntax, /router catalog: `\/agrimap-agent-skills:agrimap-agent-skills -h`/);
  assert.match(usage, /Larger text \/ ข้อความยาว/);
  assert.match(usage, /รูปภาพและ visual reference/);
  assert.match(usage, /Attachments, pointed files, directories, and exact lines/);
  assert.match(usage, /Automated smoke test vs\. live-provider check/);
  assert.match(usage, /\$agm-be -h/);
  assert.match(usage, /\/agrimap-agent-skills:agm-be -h/);
  assert.match(usage, /\$agrimap-agent-skills -h/);
  assert.match(usage, /\/agrimap-agent-skills:agrimap-agent-skills -h/);
  assert.doesNotMatch(usage, /agrimap-agent-skills operation=analyze/);
  assert.match(usage, /Start-Process "https:\/\/github\.com\/cognivex006\/agrimap-agent-skills\/blob\/main\/docs\/USAGE\.md"/);
  assert.match(usage, /code \.\\docs\\USAGE\.md/);
  assert.match(usage, /notepad \.\\docs\\USAGE\.md/);
  assert.ok(rootIgnore.split(/\r?\n/).includes(".agrimap-agent/"));
  assert.ok(rgIgnore.split(/\r?\n/).includes("/plugins/agrimap-agent-skills/skills/agrimap-agent-skills/**"));
  assert.match(usage, /ไม่เขียนทุก step\/tool call/);
  assert.match(usage, /light\|standard\|regulated/);
  assert.match(usage, /light.*ไม่สร้าง `tasks\//s);
  assert.match(usage, /standard.*regulated.*brief\.md.*analysis\.md.*checklists\.md.*qa\.md.*result\.md/s);
  assert.match(usage, /Primary SQL product intent/);
  assert.match(usage, /output_owner=product\|owner-reference\|knowledge-draft/);
  assert.match(usage, /SQL_EDIT_TARGET_NOT_FOUND/);
  assert.match(usage, /SQL_OUTPUT_OWNER_REQUIRED/);
  assert.match(usage, /\.agrimap-agent\/knowledge\/drafts\/sql/);
  assert.equal(await read("plugins/agrimap-agent-skills/docs/USAGE.md"), usage);
});

test("C# and request-value contracts route through every backend operation", async () => {
  const csharpPath = "patterns/csharp.md";
  const goldenPath = "patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md";
  const backendOperations = [
    "analyze",
    "diagnose",
    "simulate",
    "plan",
    "design",
    "architect",
    "review",
    "be",
    "qa",
    "prompt",
    "execute",
  ];
  for (const operation of backendOperations) {
    const item = operations.find((candidate) => candidate.operation === operation);
    assert.ok(item, `missing operation ${operation}`);
    const routed = [...(item.references || []), ...(item.conditionalReferences || [])];
    assert.equal(
      routed.some((reference) => reference.path === csharpPath),
      true,
      `${operation} must route to the C# baseline`,
    );
    assert.equal(
      routed.some((reference) => reference.path === goldenPath),
      true,
      `${operation} must route to request-value normalization`,
    );
  }
  const backendEngineer = await read("skills/agrimap-agent-skills/references/backend-engineer.md");
  const csharp = await read("skills/agrimap-agent-skills/references/patterns/csharp.md");
  const requestGolden = await read(`skills/agrimap-agent-skills/references/${goldenPath}`);
  assert.match(backendEngineer, /both `be-main` and `be-library`/);
  assert.match(backendEngineer, /require no DI registration/);
  assert.match(backendEngineer, /Cookie \(highest\) -> Header -> QueryString \(lowest\)/);
  assert.match(csharp, /AgmTraceId.*agm-device-id.*device_id/s);
  assert.match(csharp, /AgmLoginContextId/);
  assert.match(csharp, /`agmws` = `AgriMap\.Web\.Service`/);
  assert.match(csharp, /`agmbo` = `AgriMap\.Worker`/);
  assert.match(csharp, /Infrastructure\.Jobs.*Infrastructure\/Jobs\/JobScheduler\.cs/s);
  assert.match(csharp, /Subfolders may organize files but never extend the namespace/);
  assert.match(csharp, /Infrastructure\.Persistence\.Models.*MongoDB.*ORM/s);
  assert.match(csharp, /AtlasX Core Query results.*Domain\.Entities.*Presentation\.DTOs\.Responses/s);
  for (const ruleId of [
    "NULL-01", "NULL-02", "NULL-03", "NULL-04",
    "REQ-01", "REQ-02", "REQ-03", "AUTH-01",
    "CTL-01", "CTL-03",
    "ASYNC-01", "ASYNC-02", "ASYNC-03",
    "ERR-01", "ERR-02", "ERR-03", "ERR-04", "ERR-05",
    "LOG-01", "LOG-02", "DI-01", "REPO-01", "REPO-02",
    "JSON-01", "JSON-02", "TEST-01", "TEST-02", "TOOL-01",
  ]) {
    assert.match(csharp, new RegExp(`\\*\\*${ruleId} —`), `missing owner template ${ruleId}`);
  }
  assert.match(csharp, /maintained owner guidance for new code and behavior-safe refactors/);
  assert.match(csharp, /These sections are owner-approved targets, not claims that current repositories already contain them/);
  assert.match(csharp, /real files conflict with these rules.*maintained rules govern new structure/s);
  assert.ok(csharp.split(/\r?\n/).length <= 500, "keep the always-loaded C# baseline under 500 lines");
  assert.doesNotMatch(csharp, /namespace ArgiMap|AgriMap\.Wokrer/);
  assert.doesNotMatch(backendEngineer, /TaskScheduler\.cs/);
  assert.match(requestGolden, /Cookie \(highest\) -> Header -> QueryString \(lowest\)/);
  assert.match(requestGolden, /Header \(agm-device-id\)/);
});

test("provider hook discovery is isolated per host", async () => {
  assert.equal(codexManifest.hooks, "./hooks/codex-hooks.json");
  assert.equal(claudeManifest.hooks, "./hooks/claude-hooks.json");
  assert.equal(codexManifest.version, JSON.parse(await read("package.json")).version);
  assert.equal(claudeManifest.version, codexManifest.version);
  assert.equal(geminiManifest.version, codexManifest.version);

  const providerArtifacts = [
    ["codex", `plugins/agrimap-agent-skills/${codexManifest.hooks.replace(/^\.\//, "")}`, 3],
    ["claude", `plugins/agrimap-agent-skills/${claudeManifest.hooks.replace(/^\.\//, "")}`, 3],
    ["gemini", "hooks/hooks.json", 2],
  ];
  for (const [provider, hookPath, expectedCount] of providerArtifacts) {
    const content = await read(hookPath);
    assert.equal(content.match(new RegExp(`--provider ${provider}`, "g"))?.length, expectedCount);
    for (const otherProvider of ["codex", "claude", "gemini"].filter((candidate) => candidate !== provider)) {
      assert.doesNotMatch(content, new RegExp(`--provider ${otherProvider}`), `${hookPath} leaks ${otherProvider}`);
    }
  }

  await assert.rejects(
    read("plugins/agrimap-agent-skills/hooks/hooks.json"),
    { code: "ENOENT" },
    "Codex and Claude must not share an auto-discovered default hook file",
  );
});

test("usage documentation covers supported targets and refactor modes", () => {
  for (const targetKind of ["fe-main", "fe-library", "be-main", "be-library", "sql-table", "sql-procedure", "sql-table-and-procedure"])
    assert.ok(usage.includes(`target_kind=${targetKind}`));
  for (const backendProfile of ["agmws", "agmbo"])
    assert.ok(usage.includes(`backend_profile=${backendProfile}`));
  for (const mode of refactorModes)
    assert.ok(usage.includes(`refactor_mode=${mode}`));
  for (const usedMode of [...usage.matchAll(/refactor_mode=([a-z-]+)/g)].map((match) => match[1]))
    assert.ok(refactorModes.includes(usedMode), `Unknown refactor mode in usage guide: ${usedMode}`);
});

test("published input fixtures match their plugin copies", async () => {
  const largeRequest = await read("examples/inputs/LONG-REQUEST.md");
  const visualReference = await read("examples/inputs/references/checkout-flow.svg");
  const requesterNote = await read("examples/inputs/references/feature-note.md");
  assert.equal(await read("plugins/agrimap-agent-skills/examples/inputs/LONG-REQUEST.md"), largeRequest);
  assert.equal(await read("plugins/agrimap-agent-skills/examples/inputs/references/checkout-flow.svg"), visualReference);
  assert.match(largeRequest, /## Acceptance criteria/);
  assert.match(largeRequest, /## Authorized decision-owner decisions/);
  assert.match(largeRequest, /Requester authority: owner/);
  assert.match(visualReference, /^<svg[\s\S]+<title[\s\S]+<desc[\s\S]+<\/svg>\s*$/);
  assert.match(requesterNote, /network timeout as an unknown outcome/);
});
