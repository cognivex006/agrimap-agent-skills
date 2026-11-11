import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { projectRoot } from "../helpers/harness.mjs";

const read = (relative) => readFile(path.join(projectRoot, relative), "utf8");
const operations = JSON.parse(await read("config/operations.json")).operations;
const passiveMap = JSON.parse(await read("skills/agrimap-agent-skills/assets/passive-skill-map.json"));
const passiveCapabilities = await read("skills/agrimap-agent-skills/references/passive-capabilities.md");
const urlMatrix = await read("skills/agrimap-agent-skills/references/application-url-matrix.md");
const hook = await read("skills/agrimap-agent-skills/scripts/hook-context.mjs");

test("domain refactor replaces every standalone refactor alias", () => {
  const names = operations.map((item) => item.name);
  for (const removed of ["agm-refactor", "agm-refactor-fe", "agm-refactor-be", "agm-refactor-sql"]) assert.equal(names.includes(removed), false);
  for (const name of ["agm-fe", "agm-be", "agm-sql"]) {
    const action = operations.find((item) => item.name === name).actions.find((item) => item.name === "refactor");
    assert.deepEqual(action, {
      name: "refactor",
      mode: "product-write",
      activation: "explicit",
      depths: ["light", "standard", "regulated"],
      purpose: action.purpose,
    });
  }
});

test("URL matrix preserves exact environment and callback invariants", () => {
  for (const exact of [
    "`http://localhost:4202/agrimap-suite-wa/ii-online`",
    "`http://localhost:4202/agrimap-suite-wa/executive`",
    "`https://agrimap-online.cdg.co.th`",
    "`https://agrimap-ex.ldd.go.th`",
    "`https://agrimap-platform.ldd.go.th/callback`",
    "`https://agrimap-pro.cdg.co.th/callback`",
  ]) assert.ok(urlMatrix.includes(exact), exact);
  const onlineCallback = urlMatrix.match(/^\| \*\*agrimap-online\*\* \| (?:Default|Normal) \|.*$/gm);
  const exCallback = urlMatrix.match(/^\| \*\*agrimap-ex\*\* \| (?:Default|Normal) \|.*$/gm);
  assert.equal(onlineCallback.length, 4);
  assert.equal(exCallback.length, 4);
  assert.match(urlMatrix, /Never synthesize a URL by generic string concatenation/);
  assert.match(urlMatrix, /Unsupported combinations return an explicit unsupported result/);
});
