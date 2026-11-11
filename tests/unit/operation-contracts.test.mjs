import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { operationConfigIssues } from "../../tools/operation-entrypoints.mjs";
import { projectRoot } from "../helpers/harness.mjs";

const read = (relative) => readFile(path.join(projectRoot, ...relative.split("/")), "utf8");
const operations = JSON.parse(await read("config/operations.json"));
const analysis = await read("skills/agrimap-agent-skills/references/analysis-discipline.md");
const elicitation = await read("skills/agrimap-agent-skills/references/elicitation.md");
const refactorModes = await read("skills/agrimap-agent-skills/references/refactor-modes.md");
const sqlPolicy = await read("skills/agrimap-agent-skills/references/patterns/sql.md");
const conflictResolution = await read("skills/agrimap-agent-skills/references/patterns/conflict-resolution.md");
const backendPattern = await read("skills/agrimap-agent-skills/references/patterns/backend.md");
const backendDiscipline = await read("skills/agrimap-agent-skills/references/backend-engineer.md");
const frontendPattern = await read("skills/agrimap-agent-skills/references/patterns/frontend.md");
const frontendDiscipline = await read("skills/agrimap-agent-skills/references/frontend-engineer.md");
const promptPolicy = await read("skills/agrimap-agent-skills/references/prompt.md");
const delegationPolicy = await read("skills/agrimap-agent-skills/references/subagents-and-branches.md");
const passiveCapabilities = await read("skills/agrimap-agent-skills/references/passive-capabilities.md");
const lifecycle = await read("skills/agrimap-agent-skills/references/lifecycle-core.md");
const dbSchemaContext = await read("skills/agrimap-agent-skills/references/db-schema-context.md");

const modes = [
  "performance-preserve-behavior",
  "readability-organization",
  "strict-preserve-logic",
  "strict-allow-logic-change",
  "targeted-bug-fix",
];

test("SQL output ownership prevents edit-to-create drift and separates knowledge drafts from schema facts", () => {
  const sql = operations.operations.find((item) => item.operation === "sql");
  const contract = [sql.conditionalInputs.join("\n"), sql.instructions.join("\n"), elicitation, sqlPolicy].join("\n");
  for (const marker of [
    "output_owner=product|owner-reference|knowledge-draft",
    "SQL_EDIT_TARGET_NOT_FOUND",
    "SQL_OUTPUT_OWNER_REQUIRED",
    ".agrimap-agent/knowledge/references/db-schema/",
    ".agrimap-agent/knowledge/drafts/sql/",
  ]) assert.ok(contract.includes(marker), `SQL ownership marker missing: ${marker}`);
  assert.match(contract, /absence of a directory.*never.*create authority/i);
  assert.match(contract, /AI-generated.*never.*schema `FACT`/i);
  assert.match(contract, /skill-package.*root.*product SQL/i);
  assert.match(contract, /preserve.*existing path.*migration/i);
});

test("domain refactor actions replace all standalone refactor aliases", () => {
  for (const target of ["fe", "be", "sql"]) {
    const operation = operations.operations.find((item) => item.operation === target);
    const refactor = operation.actions.find((item) => item.name === "refactor");
    assert.equal(refactor.mode, "product-write");
    assert.equal(refactor.activation, "explicit");
    assert.deepEqual(refactor.depths, ["light", "standard", "regulated"]);
    assert.ok(operation.conditionalReferences.some((item) => item.when === "action=refactor" && item.path === "refactor-modes.md"));
  }
  for (const name of ["agm-refactor", "agm-refactor-fe", "agm-refactor-be", "agm-refactor-sql"])
    assert.equal(operations.operations.some((item) => item.name === name), false);
});

test("SQL writers install lazily only on command-not-found and fail closed when folder parsing stops", () => {
  const single = 'sqlfluff format --exclude-rules "CP02, CV02, LT01, RF06" --dialect tsql <FILE>.sql';
  const folder = 'sqlfluff format --exclude-rules "CP02, CV02, LT01, RF06" --dialect tsql .';
  assert.ok(sqlPolicy.includes(single));
  assert.ok(sqlPolicy.includes(folder));
  assert.match(sqlPolicy, /install-sqlfluff\.mjs/);
  assert.match(sqlPolicy, /CommandNotFound/);
  assert.match(sqlPolicy, /ENOENT/);
  assert.match(sqlPolicy, /other failures never install/);
  assert.doesNotMatch(sqlPolicy, /Before SQL writes.*--version|ensure-sqlfluff/);
  assert.match(sqlPolicy, /nonzero folder exit is incomplete and may be partial/i);
  assert.match(sqlPolicy, /run each changed file separately/i);
  assert.match(sqlPolicy, /rerun the folder command to zero/i);
  assert.match(sqlPolicy, /validate-sql-artifacts\.mjs --files/);
  assert.match(sqlPolicy, /Use OS temp for probes and always clean it/);
  assert.match(sqlPolicy, /never create `\.tmp-\*` under project\/workspace/);
  assert.doesNotMatch(sqlPolicy, /--ignore\s+parsing|finalize-sql-artifacts|sqlfluff fix|--force|\.sqlfluff/);
});

test("unified SQL refactor loads the complete command owner and proves format coverage", () => {
  const operation = operations.operations.find((item) => item.operation === "sql");
  assert.ok(operation.references.some((item) => item.path === "patterns/sql.md"));
  assert.ok(operation.actions.some((item) => item.name === "refactor"));
  for (const marker of [
    "sql-contract-preflight.mjs --target-kind sql-table|sql-procedure --object <OBJECT>",
    'sqlfluff format --exclude-rules "CP02, CV02, LT01, RF06" --dialect tsql <FILE>.sql',
    'sqlfluff format --exclude-rules "CP02, CV02, LT01, RF06" --dialect tsql .',
    "install-sqlfluff.mjs",
    "validate-sql-artifacts.mjs --files",
    "format_set",
    "formatted N/N",
  ]) assert.ok(sqlPolicy.includes(marker), `SQL command/coverage marker missing: ${marker}`);
  assert.match(sqlPolicy, /Do not hand-tune cosmetic indentation, alignment, wrapping, or whitespace/);
  assert.doesNotMatch(sqlPolicy, /align the block with the statement/);
});
