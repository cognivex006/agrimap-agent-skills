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
