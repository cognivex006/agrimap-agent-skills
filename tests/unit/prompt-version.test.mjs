import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createPromptVersion,
  PromptVersionError,
  resolvePromptSource,
} from "../../skills/agrimap-agent-skills/scripts/agm-prompt-version.mjs";

const body = `# Prompt Result — Orders

## Problem and Required End State
Prepare an executable order change.

## Main Assignment
Main owns integration and verification.

## Subagent Assignments
None — Main owns all work.

## Acceptance Criteria
- The requested behavior is measurable.

## Deviation and Handoff Contract
Stop on material scope or logic deviation.
`;

async function tempWorkspace(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agm-prompt-version-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

// A further version needs a substantive revision (unchanged retries create none).
const revised = (n) => body.replace("measurable.", `measurable (revision ${n}).`);
// ...and requester-backed change evidence.
const evidence = { changeSummary: "Requester tightened acceptance.", sourceEvidence: "requester message in session-a" };

function create(cwd, overrides = {}) {
  return createPromptVersion({
    cwd,
    conversationId: "session-a",
    context: "Order Flow",
    body,
    requester: "006006",
    provider: "codex",
    model: "gpt-5.6-sol",
    now: new Date("2026-07-23T06:00:00.000Z"),
    ...overrides,
  });
}

test("V0 creates no file while first finalized result is immutable V1", async (t) => {
  const cwd = await tempWorkspace(t);
  const result = await create(cwd);
  assert.equal(result.version, 1);
  assert.equal(result.path, ".agrimap-agent/prompts/2026-07/session-a/order-flow-v001.md");
  assert.equal(result.supersedes, "none");
  assert.equal(result.sourceSelectionMethod, "new");
  const saved = await readFile(path.join(cwd, result.path), "utf8");
  assert.match(saved, /prompt_family_id: "session-a\/order-flow"/);
  assert.match(saved, /version: 1/);
  assert.match(saved, /## Main Assignment/);
  await assert.rejects(writeFile(path.join(cwd, result.path), "overwrite", { flag: "wx" }), { code: "EEXIST" });
});

test("implicit continuation creates VN in the original month", async (t) => {
  const cwd = await tempWorkspace(t);
  const first = await create(cwd);
  const second = await create(cwd, { ...evidence, body: revised(1), now: new Date("2026-08-02T06:00:00.000Z") });
  assert.equal(second.version, 2);
  assert.equal(second.period, "2026-07");
  assert.equal(second.sourceSelectionMethod, "implicit-single-family");
  assert.equal(second.supersedes, first.path);
  assert.match(second.path, /2026-07\/session-a\/order-flow-v002\.md$/);
});

test("explicit source must be the latest matching family file", async (t) => {
  const cwd = await tempWorkspace(t);
  const first = await create(cwd);
  const second = await create(cwd, { ...evidence, body: revised(1), sourcePath: first.path });
  assert.equal(second.sourceSelectionMethod, "explicit");
  await assert.rejects(
    create(cwd, { ...evidence, body: revised(2), sourcePath: first.path }),
    (error) => error instanceof PromptVersionError && error.code === "PROMPT_SOURCE_CONFIRM_REQUIRED",
  );
  const resolved = await resolvePromptSource({ cwd, conversationId: "session-a", context: "Order Flow", sourcePath: second.path });
  assert.equal(resolved.latest.version, 2);
});

test("ambiguous cross-period families stop for source confirmation", async (t) => {
  const cwd = await tempWorkspace(t);
  for (const period of ["2026-06", "2026-07"]) {
    const directory = path.join(cwd, ".agrimap-agent", "prompts", period, "session-a");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "order-flow-v001.md"), body, "utf8");
  }
  await assert.rejects(
    create(cwd),
    (error) => error instanceof PromptVersionError && error.code === "PROMPT_SOURCE_CONFIRM_REQUIRED",
  );
});

test("concurrent allocation serializes versions without overwrite", async (t) => {
  const cwd = await tempWorkspace(t);
  const results = await Promise.all([create(cwd, evidence), create(cwd, { ...evidence, body: revised(1) })]);
  assert.deepEqual(results.map((item) => item.version).sort(), [1, 2]);
  assert.equal(new Set(results.map((item) => item.path)).size, 2);
});

test("one-file package rejects missing Main or Subagent ownership sections", async (t) => {
  const cwd = await tempWorkspace(t);
  await assert.rejects(
    create(cwd, { body: "# Prompt Result\n\n## Acceptance Criteria\n- done\n\n## Deviation and Handoff Contract\nstop" }),
    (error) => error instanceof PromptVersionError && error.code === "INVALID_PROMPT_RESULT",
  );
});
