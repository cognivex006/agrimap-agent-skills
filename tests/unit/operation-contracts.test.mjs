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

test("SQL refactor exposes all five modes instead of a recommendation-only extra turn", () => {
  const operation = operations.operations.find((item) => item.operation === "sql");
  const contract = [operation.actions.map((item) => item.name).join("\n"), operation.instructions.join("\n"), elicitation, refactorModes].join("\n");
  for (const mode of modes) assert.match(contract, new RegExp(mode));
  assert.match(operation.instructions.join("\n"), /all five modes.*one recommendation/i);
  assert.match(elicitation, /ตอบเลขหรือ enum/);
});

test("domain façades separate safe action defaults from embedded capabilities", async () => {
  let safeDefaultActions = 0;
  for (const name of ["fe", "be", "sql"]) {
    const operation = operations.operations.find((item) => item.operation === name);
    assert.equal(operation.mode, "action-routed");
    assert.match(operation.instructions.join("\n"), /Resolve exactly one action before inspection/i);
    const entrypoint = await read(`skills/agrimap-agent-skills/references/operations/${name}.md`);
    assert.match(entrypoint, /Resolve exactly one action.*before target inspection or product writes/i);
    assert.match(entrypoint, /fallback is action routing, not a passive capability/i);
    for (const action of operation.actions.filter((item) => item.activation === "explicit-or-safe-default")) {
      assert.equal(action.mode, "product-read-only");
      safeDefaultActions += 1;
    }
  }
  assert.ok(safeDefaultActions > 0);
  const unsafe = structuredClone(operations);
  unsafe.operations.find((item) => item.operation === "fe").actions.find((item) => item.activation === "explicit-or-safe-default").mode = "product-write";
  assert.ok(operationConfigIssues(unsafe).some((issue) => /safe-default activation must be product-read-only/.test(issue)));
  assert.match(lifecycle, /Embedded passive capabilities support the selected read or authorized write action/);
  assert.match(passiveCapabilities, /embedded supporting skill/i);
  assert.match(passiveCapabilities, /both product-read-only and already-authorized product-write work/);
  assert.match(passiveCapabilities, /In read-only actions it may classify or recommend tests but never write them/);
  assert.match(passiveCapabilities, /Explicit `action=test`/);
});

test("SQL explain is evidence-labelled and cannot execute or edit", () => {
  const sql = operations.operations.find((item) => item.operation === "sql");
  const explain = sql.actions.find((item) => item.name === "explain");
  assert.equal(explain.mode, "product-read-only");
  assert.equal(explain.activation, "explicit-or-safe-default");
  for (const marker of ["FACT", "INFERENCE", "UNKNOWN", "do not execute SQL", "connect to a database", "never edits"])
    assert.ok(passiveCapabilities.includes(marker), `SQL explain marker missing: ${marker}`);
});

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

test("light analysis is CLI-readable and database conclusions fail soft on missing project evidence", () => {
  const operation = operations.operations.find((item) => item.operation === "analyze");
  const contract = [operation.instructions.join("\n"), analysis].join("\n");
  for (const heading of ["Scope", "Evidence", "Findings", "Impacts", "Options", "Recommendation", "Unknowns"]) {
    assert.match(contract, new RegExp(heading));
  }
  assert.match(contract, /actual project code/i);
  assert.match(contract, /db-schema/i);
  assert.match(contract, /representative examples|representative local examples/i);
  assert.match(contract, /preliminary/i);
  assert.match(analysis, /At `light`.*current\/recent memory plus daily audit evidence.*never create `tasks\/\*\*`/);
  assert.doesNotMatch(analysis, /A chat answer alone is not a closed deliverable/);
});

test("stored-procedure work forces owner DDL evidence and SP to table tracing", () => {
  for (const marker of [
    ".agrimap-agent/knowledge/references/db-schema/**/*.sql",
    "sql/<GROUP_OR_DOMAIN>/procedure/<PROCEDURE>.sql",
    ".agrimap-agent/knowledge/drafts/sql/",
    "THROW <number>, '<error_code>'",
    "db-schema: <loaded>/<expected>",
  ]) assert.ok(dbSchemaContext.includes(marker), `db-schema context marker missing: ${marker}`);
  assert.match(dbSchemaContext, /never infer a table, column, type, nullability, key, constraint, or message code/i);
  assert.match(dbSchemaContext, /One hop past the procedure is mandatory/i);
  assert.doesNotMatch(dbSchemaContext, /connect to a database to (fill|answer)[^.]*\bis allowed\b/i);

  assert.match(backendDiscipline, /## Database source of trust/);
  assert.match(backendDiscipline, /db-schema-context\.md/);
  assert.match(backendDiscipline, /procedure name in C# is a pointer, not a contract/i);
  assert.match(analysis, /knowledge\/references\/db-schema\/\*\*\/\*\.sql/);
  assert.match(sqlPolicy, /db-schema-context\.md/);

  for (const name of ["analyze", "diagnose", "simulate", "plan", "design", "architect", "review", "be", "sql", "qa", "prompt", "execute"]) {
    const operation = operations.operations.find((item) => item.operation === name);
    const routed = (operation.conditionalReferences || []).filter((item) => item.path === "db-schema-context.md");
    assert.equal(routed.length, 1, `${name} must route db-schema-context.md exactly once`);
    assert.ok(/stored procedure|table, view, or procedure/i.test(routed[0].when), `${name} db-schema condition must name stored-procedure or object scope`);
  }
  const diagnose = operations.operations.find((item) => item.operation === "diagnose");
  assert.match(diagnose.instructions.join("\n"), /open that procedure and the tables it touches.*name the exact failing condition/is);
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

test("SQL stored procedure create and edit require one idempotent declaration", () => {
  const operation = operations.operations.find((item) => item.operation === "sql");
  assert.match(operation.instructions.join("\n"), /Every created or edited stored procedure must declare CREATE OR ALTER PROCEDURE/);
  assert.match(sqlPolicy, /exactly one `CREATE OR ALTER PROCEDURE`/);
  assert.match(sqlPolicy, /Standalone `CREATE PROCEDURE`, `ALTER PROCEDURE`, `CREATE PROC`, and `ALTER PROC` are violations/);
  assert.match(conflictResolution, /every created or edited procedure output must normalize its declaration to `CREATE OR ALTER PROCEDURE`/);
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

test("compact pattern references keep their canonical owners co-loaded", () => {
  const pairs = [
    ["prompt", ["prompt.md"]],
    ["execute", ["prompt.md", "subagents-and-branches.md"]],
  ];
  for (const [name, required] of pairs) {
    const operation = operations.operations.find((item) => item.operation === name);
    const routed = operation.references.map((item) => item.path);
    for (const path of required) assert.ok(routed.includes(path), `${name} must load ${path}`);
  }

  assert.match(backendPattern, /Apply \[backend-engineer\.md\].*unchanged/);
  assert.match(backendPattern, /MongoDB document or ORM entity.*Infrastructure\.Persistence\.Models/s);
  assert.match(backendPattern, /AtlasX Core Query result.*Domain entity\/value object/s);
  assert.match(backendPattern, /Do not add another namespace or `Application\.Models`/);
  for (const marker of ["Do not add Type A/B/C", "Ask the owner only when the signals", "### `backend_profile=agmbo`", "Structure over logic"])
    assert.ok(backendDiscipline.includes(marker), `backend owner missing: ${marker}`);

  assert.match(frontendPattern, /Apply \[frontend-engineer\.md\].*unchanged/);
  for (const marker of ["Ask the owner only when the signals", "Structure over logic", "Reuse-first decision", "Reuse index"])
    assert.ok(frontendDiscipline.includes(marker), `frontend owner missing: ${marker}`);

  assert.match(promptPolicy, /## Main Assignment/);
  assert.match(promptPolicy, /## Subagent Assignments/);
  for (const marker of ["at most five active agents", "isolation: worktree", "required uncommitted parent state"])
    assert.ok(delegationPolicy.includes(marker), `delegation owner missing: ${marker}`);
});
