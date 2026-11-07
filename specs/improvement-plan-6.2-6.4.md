# Improvement plan 6.2 → 6.4 (post-6.1.2 architecture review)

Maintainer planning document. Source: external architecture review of v6.1.2 (2026-11-06), triaged with the owner on 2026-11-07. Order puts the problems that cause real daily failures first and new features later. Each phase is one release; nothing here is published automatically.

## Verified findings (checked against the checkout, 2026-11-07)

| ID | Finding | Status |
| --- | --- | --- |
| E-01/E-02 | No `be-scenarios.md` eval or test; FE and SQL have them | Confirmed |
| E-03 | FE/SQL eval tests ran only in `test:legacy-v2`, not `npm test`. The FE test had already drifted (expected 12 scenarios, catalog has 13 since 5.0.1) and nobody saw it | Confirmed, fixed in 6.2.0 |
| E-10 | `listPending()` returned savepoints without checking Git, so finished or merged work showed as pending and `resume` could redo it | Confirmed, fixed in 6.2.0 |
| E-04/E-05/E-06 | SEC-01..31 (authoring) vs SEC-01..23 (Golden Lint) not reconciled; matrix omits some classes | Not yet verified |
| E-09 | Model IDs pinned in `model-capability-matrix.yaml` | Not yet verified |
| E-16 | `.editorconfig` analyzer block can be overridden by later sections; effective config untested | Not yet verified |

## 6.2.0 — reliability basics (low risk, high payoff)

1. **Savepoint reconciliation** (done in this branch). `reconcileSavepoint()` in `scripts/savepoint.mjs` checks the recorded `branch @ sha` against Git: `PENDING_CONFIRMED`, `ALREADY_COMPLETED`, `STALE` (branch deleted, merged into develop/main, moved, or commit missing) or `UNVERIFIED` (no Git or no branch). `pending` reports `confirmed`/`unconfirmed`; `resume` refuses completed work and requires `--accept-stale` for stale claims. Each result also carries `freshness`: a recorded verification is `fresh`, `expired` (newer commits or uncommitted edits on the recorded branch), `unverified` (no recorded sha) or `none`; `worktree` is `clean`, `dirty` (with an `uncommitted` count), `not-checked-out` or `unknown`.
2. **Evals in the default pipeline** (done in this branch). FE/SQL scenario tests and the new reconcile test run in `npm test`. `test:legacy-v2` is unchanged.
3. **Backend eval suite.** `references/evals/be-scenarios.md` plus `tests/unit/be-scenarios.test.mjs`, same structure and rubric as FE. First 8–10 scenarios: agmws layer ownership; agmbo Quartz without fake controllers; CA1822 vs reflection/DI; S3776/S107 with real analyzer output; effective `.editorconfig`; missing .NET/analyzer reported as blocked; already-compliant project gets no edits; SQL parameter contract without DB write permission.
4. **Release result envelope + deterministic renderer.** Each `agm-release` action emits one JSON status record; one renderer prints fixed sections (Operation / Target / Versions / Steps / Evidence / Publication / Timing / Remaining / Outcome) and the Leader reproduces it verbatim. Reuse `release-timing.mjs`. Snapshot tests for success, partial, blocked, resume and `--flash`.

## 6.3.0 — one security/quality contract

1. `sec-coverage.json`: canonical map of SEC-01..31 to `authoring`, `scannerStatus` (automated/heuristic/manual-review/not-implemented), languages, detector IDs and tested flag; drift test against the installed Golden Lint catalog, read-only (Golden Lint is not edited from here, decision 0001).
2. `quality-security-index.md` generated from metadata: which file owns policy, matrix, remediation and examples. `sonarqube-matrix.md` adopts the `security-matrix.md` layout. Link/anchor and duplicate-ID checker.
3. `agm-security scan`: read-only, Golden Lint first, stable fingerprints (rule + file + symbol, never line alone), JSON + Markdown report from a versioned schema, blocked checks listed.
4. Model capability: replace pinned model IDs with runtime-observed capability; `unknown` is not `false`; tier never changes authority.
5. Tested BAD/GOOD examples for C# and TS first; other lanes labelled `catalog-only`.

## 6.4.0 / 7.0 — orchestration

1. `agm-security patch`: AUTO_SAFE / GUARDED / MANUAL tiers, rescan as gate, `fixed` ≠ `verified`. Patches only findings the requester selected or confirmed, not every safe finding in the repo, to keep diffs reviewable.
2. Decision candidates: reuse decision-memory; search existing decisions first; persist "not-now" so the owner is not asked again.
3. Delegation by DAG: 3+ independent units delegate when the host supports it, otherwise record a measurable `delegationSkippedReason`.
4. Agent profile registry, light: role, lanes, rulePacks, version hash. No personality layer; profiles cannot grant permission.

## Deliberately not adopted from the review

- One release for all 12 gates: too broad to verify, repeats the shallow-coverage problem the review criticises.
- Auto-fixing every AUTO_SAFE finding repo-wide on `patch`: scope creep beyond the request.
- Byte-identical model narrative: only the rendered block is deterministic; narrative stays free.
