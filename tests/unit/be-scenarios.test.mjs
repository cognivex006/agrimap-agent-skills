import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { projectRoot } from "../helpers/harness.mjs";

const backendDiscipline = await readFile(path.join(projectRoot, "skills", "agrimap-agent-skills", "references", "backend-engineer.md"), "utf8");
const evals = await readFile(path.join(projectRoot, "skills", "agrimap-agent-skills", "references", "evals", "be-scenarios.md"), "utf8");

test("backend eval catalog is reachable and structurally executable", () => {
  assert.match(backendDiscipline, /\[be-scenarios\.md\]\(evals\/be-scenarios\.md\)/);
  assert.match(backendDiscipline, /do not load the eval catalog during ordinary backend work/i);

  const matches = [...evals.matchAll(/^## S(\d+) —[^\n]+\n([\s\S]*?)(?=^## S\d+ —|^## สรุป coverage)/gm)];
  assert.deepEqual(matches.map((match) => Number(match[1])), Array.from({ length: 10 }, (_, index) => index + 1));
  for (const [scenarioId, body] of matches.map((match) => [`S${match[1]}`, match[2]])) {
    assert.match(body, /^\*\*Situation:\*\*/m, `${scenarioId}: Situation missing`);
    assert.match(body, /^\*\*Prompt:\*\*/m, `${scenarioId}: Prompt missing`);
    assert.match(body, /\*\*\[HARD\]\*\*/, `${scenarioId}: HARD assertion missing`);
    assert.match(body, /\*\*\[RUBRIC\]\*\*/, `${scenarioId}: RUBRIC assertion missing`);
    assert.match(body, /^\*\*Anti-pattern:\*\*/m, `${scenarioId}: anti-pattern missing`);
  }

  assert.match(evals, /HARD ผ่าน ≥ 95%/);
  assert.match(evals, /RUBRIC เฉลี่ย ≥ 1\.5/);
  assert.match(evals, /S3\/S4\/S7/);
  for (const provider of ["Claude", "Codex", "Gemini"]) assert.ok(evals.includes(provider));
});

test("backend eval maps only to golden files that exist and forbids fabricated verification", async () => {
  const { readdir } = await import("node:fs/promises");
  const golden = path.join(projectRoot, "skills", "agrimap-agent-skills", "references", "patterns", "golden");
  const ids = async (dir) => new Set((await readdir(path.join(golden, dir))).map((name) => name.slice(0, 3)).filter((id) => /^\d{3}$/.test(id)));
  const main = await ids("backend-main");
  const libs = await ids("backend-libraries");
  for (const [, kind, list] of evals.matchAll(/backend-(main|libraries) ([\d, ]+)/g)) {
    for (const id of list.split(/[ ,]+/).filter(Boolean)) assert.ok((kind === "main" ? main : libs).has(id), `backend-${kind} ${id} missing`);
  }
  assert.match(evals, /blocked`\/`unverified/);
  assert.match(evals, /ไม่ execute DDL\/DML/);
});
