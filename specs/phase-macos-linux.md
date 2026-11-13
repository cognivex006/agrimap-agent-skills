# Phase: macOS and Linux parity (after 6.4.3)

Owner decision 2026-11-12: Windows is the pilot and is complete at **v6.4.3** (`main` @ `cc57979`). This phase brings macOS, then Linux, to the same result, using the Windows run as the reference. First machine: the owner's Mac.

## Goal

On macOS (then Linux), from a clean clone of `develop`:

1. `npm test` passes with the same count as Windows (301 tests, 0 fail, 0 skipped except tests that are Windows-only by design).
2. `npm run package:verify` returns `"ok": true` with `"platform": "darwin"` (or `"linux"`).
3. Any difference from Windows is either fixed in canonical sources or recorded below as an intended platform difference.

Publishing stays on the existing flow; this phase does not change release steps unless a step fails on macOS.

## Windows reference (6.4.3)

| Check | Windows result |
|---|---|
| `npm test` | 301 tests, 301 pass, 0 fail, 0 skipped (default TEMP) |
| `security-examples` C# | 36 checks `ok` via `dotnet run` (net8.0) |
| `package:verify` | `ok: true, platform: win32` |
| Windows-only test | `skill-gate`: 8.3 short path (skips off Windows, expected) |

## Prerequisites on the Mac

- Node.js **22.18+ or 23.6+** (the TypeScript examples load `.ts` through Node type stripping without flags). `package.json` says `node >=20`; if Node 20 fails here, the fix is to raise `engines` or gate the test, decided in this phase.
- Git, GitHub CLI (`gh auth status` ok) for `package:verify` against `develop`.
- .NET SDK 8+ (optional: without it the C# examples test skips; with it, it must pass 36 checks).
- AgriMap Golden Lint installed (optional: `sec-coverage` drift and `security-scan` tests skip without it; set `AGM_GOLDEN_LINT_DIR` if it is not found).

## Run (Mac terminal)

```bash
git clone https://github.com/cognivex006/agrimap-agent-skills.git && cd agrimap-agent-skills
git switch develop
node --version; dotnet --version; gh auth status
npm ci
npm test 2>&1 | tee ../agm-macos-npm-test.log
npm run package:verify -- --base main --head develop 2>&1 | tee ../agm-macos-verify.log
```

If a test fails, rerun only that file for detail:

```bash
node --test --test-reporter=spec tests/unit/<file>.test.mjs
```

## Known risk spots to check first

| Area | Why it may differ on macOS/Linux | Where |
|---|---|---|
| Path case | APFS is case-insensitive by default, but code compares paths case-sensitively off `win32` | `scripts/instruction-chain.mjs` (`sameDir`, root map) |
| Temp realpath | macOS `/var/folders/...` and `/tmp` resolve through `/private`; tests comparing `tmpdir()` paths to `realpath` results can mismatch | tests using `os.tmpdir()` with path equality |
| Symlinks | Windows uses `junction`; POSIX uses `dir` symlinks and different permission errors | `tests/unit/package-release.test.mjs` |
| Skill gate paths | 8.3 test is Windows-only; POSIX path separators and case in gate matching | `scripts/skill-gate.mjs` |
| Worktree lifecycle | Git worktree paths, shell quoting | `scripts/worktree-lifecycle.mjs` |
| Shell in release docs | Release steps were run in PowerShell (here-strings, `*>` redirects); scripts themselves are Node | `DEVELOPMENT.md`, `docs/MAINTAINING.md` |
| Line endings | Files are written with `\n`; check for CRLF assumptions in parsers and hashes (bootstrap AGENTS.md pinned hash) | `tests/unit/bootstrap-contract.test.mjs` |
| C# examples | `Path.DirectorySeparatorChar` and `/usr/bin/tool` (SEC-02 example is not executed); `GetTempPath` differs | `references/patterns/security/examples/csharp/SecExamples.cs` |
| Executable bits | Hook and script files may need `+x` on POSIX | `hooks/`, `plugins/**/hooks` |

## Working rules for this phase

- Branch from `develop` (`feature/macos-parity-*`); PR into `develop`; no direct commits to `main`.
- Fix canonical sources under `skills/agrimap-agent-skills`, then `npm run sync`; never edit `plugins/` by hand.
- A fix must keep Windows green: rerun the affected test files on Windows (or ask the owner) before release.
- Do not weaken a test to pass on macOS; mark a test platform-specific only when the behavior is platform-specific by design, and record it below.
- Golden Lint stays read-only (decision 0001).

## Deliverables

1. Logs: `agm-macos-npm-test.log`, `agm-macos-verify.log` (attach or summarize in the PR).
2. One PR per root cause, each with the failing test name, cause, and fix.
3. This file updated: fill the result table and the platform-difference list.
4. Release as the next patch (6.4.4) when macOS is green; Linux follows with the same steps (CI runner or a Linux machine).

## Results (fill in)

| Check | macOS | Linux |
|---|---|---|
| Node / .NET / Golden Lint versions | | |
| `npm test` (tests / pass / fail / skipped) | | |
| C# examples (36 checks) | | |
| `package:verify` | | |

Intended platform differences:

- `skill-gate` 8.3 short-path test runs on Windows only.
