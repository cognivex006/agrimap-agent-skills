import { after, before, describe, test } from "node:test";
import { createHarness } from "../../helpers/harness.mjs";
import { frontendReuse } from "./cases/frontend-reuse.mjs";

// The v2 cases (bootstrap/prune, identity and checkpoints, hooks, completion
// gates, history) asserted the removed tasks/ lifecycle and were retired with
// test:legacy-v2; their v3 behavior is covered by the unit suites in npm test.
describe("workspace integration", { concurrency: 1 }, () => {
  let harness;

  before(async () => {
    harness = await createHarness("agrimap-workspace-");
  });

  after(async () => {
    await harness?.cleanup();
  });

  test("frontend reuse index lifecycle", () => frontendReuse(harness));
});
