# Frontend patterns

Apply [frontend-engineer.md](../frontend-engineer.md) Required classification, Target detection, Structure over logic, and Reuse rules unchanged. This file owns only pattern-specific architecture and placement.

## FE main

Use the current project as the primary pattern. The AgriMap baseline is:

```text
Feature UI -> Facade -> Signal Store and/or Generated API
```

- Component: render state, bind input/output, and send user events to the facade.
- Facade: orchestrate APIs/services, transformations, side effects, and store mutations.
- Store: hold signal state, computed selectors, and pure synchronous mutations; do not call APIs.
- Generated API: keep generated code isolated and regenerate through the project toolchain.
- Provider: group local facade/store/service providers when the project uses component-scoped lifecycle.
- Shared UI: remain reusable and unaware of feature business flow.

Prefer Observable APIs with lifecycle-safe subscriptions in the facade and signal state for feature UI when that matches the local application. Do not introduce a store/facade for a trivial component that has no domain state or orchestration.

## FE library

Optimize for reuse and a stable public API:

- public exports and backward compatibility;
- reusable components/directives/pipes;
- Angular services for library behavior;
- generated API integration behind a stable library surface;
- no assumption that a consuming application's facade/store belongs inside the library.

**Library architecture (owner decision, 2026-07-16):** the accepted current architecture for libraries is **Angular service-first** — new library behavior uses services (plus presentational components), not facade + signal stores. The few existing facade + signal islands inside the libraries (e.g., `dynamic-lut`, the request/import-layer domains in `agrimap-component`, `dynamic-dashboard`) are working as intended: **leave them exactly as they are** — do not migrate them to services, do not "align" them, and do not use them as precedent to add facades elsewhere in libraries. A workspace-wide refactor of libraries to Facade + Signal is a possible future owner-initiated task, never something the agent starts on its own.

Use the current curated references under `golden/frontend-libraries/` for published API, naming, generated APIs, environment injection, Playground, and the test baseline. The active library's `public-api.ts`, package version, consumers, and neighboring tests remain the contract. Request owner evidence only for gaps listed in `owner-example-intake.md`.

## Naming and file placement

- folders/files/CSS classes: project `kebab-case` pattern;
- TypeScript classes/interfaces/types: `PascalCase`;
- UI variables and functions: `camelCase`;
- Observables: local `$` suffix convention;
- external API fields: generated contract naming, commonly `snake_case`;
- types: keep feature-local types local; move only genuinely shared types to core/shared models.

## Generated API work

Any task that adds, changes, or consumes a generated API endpoint — in either target kind — reads
[gencode-api.md](gencode-api.md) first. It is the single shared source for the generator tool,
config schema, per-workspace entry commands, output layout, and the no-hand-written-client rules;
the golden entries `frontend-main/018` and `frontend-libraries/007` are thin pointers to it.

## Golden examples

Enter the collection through the checklist for the detected target kind —
[checklists/frontend-main.md](checklists/frontend-main.md) or
[checklists/frontend-libraries.md](checklists/frontend-libraries.md) — which carries the `MUST` rows,
the entry owning each, and the detection command.

Current curated application references live under `golden/frontend-main/`; current library references live under `golden/frontend-libraries/`. Read each `manifest.json` for source, status, evidence mode, and hashes.

Before using an entry, read [conflict-resolution.md](conflict-resolution.md). Defects from the retired frontend-main extraction were removed on 2026-07-16. Apply only the remaining collection known issues and conflict rows, including library public-API compatibility and project-dependent syntax.

Current golden references are maintained guidance, not permission to bypass the active contract. Match the Angular version, target kind, public API, value kinds, generated-code boundary, and local project pattern before applying them.

## Security

New and rewritten code follows [security baseline](security-baseline.md) SEC-15/16/21/22.

## FE verification

Check generated-code boundaries, type checking, lint/build, component tests where present, loading/error/empty states, input/output contracts, subscription lifecycle, affected consumers, reuse-search evidence, and the updated frontend reuse index.
