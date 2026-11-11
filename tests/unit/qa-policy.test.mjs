import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { projectRoot } from "../helpers/harness.mjs";

const read = (relative) => readFile(path.join(projectRoot, ...relative.split("/")), "utf8");
const operations = JSON.parse(await read("config/operations.json"));
const qaPolicy = await read("skills/agrimap-agent-skills/references/qa-and-done.md");
const lifecycle = await read("skills/agrimap-agent-skills/references/lifecycle-core.md");
const modelMatrix = await read("skills/agrimap-agent-skills/references/model-capability-matrix.yaml");
const sqlPolicy = await read("skills/agrimap-agent-skills/references/patterns/sql.md");
const taskSchema = JSON.parse(await read("skills/agrimap-agent-skills/assets/task-artifact-schema.json"));

test("SQL actor and target user semantics remain distinct", () => {
  assert.match(sqlPolicy, /@PI_SESSION_USER_ID NUMERIC\(38, 0\).*actor authenticated in the current session/i);
  assert.match(sqlPolicy, /@PI_USER_ID NUMERIC\(38, 0\).*subject\/target user/i);
  assert.match(sqlPolicy, /WHERE \[USER_ID\] = @PI_USER_ID/);
  assert.match(sqlPolicy, /\[USER_MODIFIED\] = @PI_SESSION_USER_ID/);
  assert.match(sqlPolicy, /Never substitute session user for target user or assume they are equal/);
});
