# Plan 7.0 — Node.js runtime policy

Owner request 2026-11-16: improve how Node is locked. No exact pin; the only hard rule is "no Node with a known security hole". A newer Node already on the machine is fine and preferred; nvm, when present, is used to find one.

## Why a major version

`engines.node` moves from `>=20` to `>=22.18.0`. Node 20 is past end of life, and the TypeScript security examples already need type stripping without flags (22.18+). A consumer on Node 20 that worked with 6.x is refused by 7.0, so this is a breaking change.

## Policy (`assets/node-policy.json`)

- `minimum`: `22.18.0`, the oldest version the package's own scripts and tests need. No maximum and no exact pin.
- A version is **acceptable** when:
  1. it is at or above `minimum`;
  2. its major line is not past end of life (Node release schedule); and
  3. no release in the same major line marked `security: true` is newer than it (nodejs.org release index).
- If the release data cannot be read (offline, blocked), the result is `unknown`. It warns and does not fail, and the minimum is still enforced.
- Newer is preferred. If a newer acceptable version is installed (nvm), the check suggests switching but does not fail.

## Check (`scripts/node-runtime.mjs`, shipped with the skill)

```
node scripts/node-runtime.mjs check [--json] [--offline] [--version <v>]
```

- Status: `ok`, `unknown` (exit 0); `below-minimum`, `end-of-life`, `vulnerable` (exit 1).
- nvm discovery is read-only. It looks in `NVM_DIR/versions/node/v*` (nvm on macOS/Linux) and `NVM_HOME/v*` (nvm-windows). It reports the highest acceptable installed version and the `nvm use` command, and never runs nvm.
- `.nvmrc` at the repo root contains `lts/*`, so `nvm use` picks the newest LTS rather than a pinned version.

## Where it runs

- `npm run node:check` (maintainers).
- `package:verify`, and therefore `package:publish`, runs it first and stops on a failing status.
- `agm-doctor check` reports it in the AGM runtime row, read-only, with the repair command.

## Acceptance

- Unit tests use fixture release data only (no network): ok, below-minimum, end-of-life, vulnerable, unknown, and nvm suggestions on POSIX and Windows layouts.
- `npm test` and `package:verify` pass on Windows.
- macOS/Linux runs follow [phase-macos-linux.md](phase-macos-linux.md).
