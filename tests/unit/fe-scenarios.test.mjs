import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { projectRoot } from "../helpers/harness.mjs";

const frontendDiscipline = await readFile(path.join(projectRoot, "skills", "agrimap-agent-skills", "references", "frontend-engineer.md"), "utf8");
const evals = await readFile(path.join(projectRoot, "skills", "agrimap-agent-skills", "references", "evals", "fe-scenarios.md"), "utf8");

test("frontend eval catalog is reachable and structurally executable", () => {
  assert.match(frontendDiscipline, /\[fe-scenarios\.md\]\(evals\/fe-scenarios\.md\)/);
  assert.match(frontendDiscipline, /do not load the eval catalog during ordinary frontend work/i);

  const matches = [...evals.matchAll(/^## S(\d+) —[^\n]+\n([\s\S]*?)(?=^## S\d+ —|^## สรุป coverage)/gm)];
  assert.deepEqual(matches.map((match) => Number(match[1])), Array.from({ length: 13 }, (_, index) => index + 1));
  for (const [scenarioId, body] of matches.map((match) => [`S${match[1]}`, match[2]])) {
    assert.match(body, /^\*\*Situation:\*\*/m, `${scenarioId}: Situation missing`);
    assert.match(body, /^\*\*Prompt:\*\*/m, `${scenarioId}: Prompt missing`);
    assert.match(body, /\*\*\[HARD\]\*\*/, `${scenarioId}: HARD assertion missing`);
    assert.match(body, /\*\*\[RUBRIC\]\*\*/, `${scenarioId}: RUBRIC assertion missing`);
    assert.match(body, /^\*\*Anti-pattern:\*\*/m, `${scenarioId}: anti-pattern missing`);
  }

  assert.match(evals, /HARD ผ่าน ≥ 95%/);
  assert.match(evals, /RUBRIC เฉลี่ย ≥ 1\.5/);
  assert.match(evals, /S2\/S5\/S11/);
  for (const provider of ["Claude", "Codex", "Gemini"]) assert.ok(evals.includes(provider));
});
