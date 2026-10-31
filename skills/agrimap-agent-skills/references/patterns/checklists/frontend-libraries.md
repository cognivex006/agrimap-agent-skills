# Golden checklist — `fe-library`

Collection `golden/frontend-libraries/` · status `current` · evidenceMode `curated-reference`.
Tiers and the "open, do not recall" rule: [README.md](README.md).

Confirm `target_kind=fe-library` first: `projects/<lib>/` with `ng-package.json` and
`src/public-api.ts`, packaged `@agrimap/*` names, a `playground` project.
**The app conventions do not apply here** — this is the most frequent cross-context error.

## MUST — naming differs from the app (`005-5-naming-in-libraries.md`)

| | `fe-main` | `fe-library` |
| --- | --- | --- |
| file | `text-box.component.ts` | `text-box.ts` |
| template / style / spec | `.component.html` / `.component.scss` / `.component.spec.ts` | `text-box.html` / `text-box.scss` / `text-box.spec.ts` |
| class | `TextBoxComponent` | `TextBox` — **no suffix** |

- Selector prefix stays `agrimap-`; `app-` is forbidden in both lanes.
- Facade/store/provider keep their suffixes: `XxxFacade`, `XxxStore`, `XxxProvider`.
- New stores use `xxx.store.ts`. `xxx.facade.store.ts` in `agrimap-component` is legacy: do not
  imitate it and do not rename it in unrelated work.
- New styles use `.scss`. Existing `.css` files stay.

## MUST — `public-api.ts` is a frozen contract (`003-3-public-api-contract.md`)

Before editing any symbol in a library, answer question 1:

1. Is the symbol exported from `public-api.ts`, directly **or through an `export *`**?
   - **No** → refactor freely (rename, split, move) while the build passes.
   - **Yes** → this is a breaking change: version bump, find every consumer, fix them in the same commit.
2. Find consumers with `grep -rn "<Symbol>" projects/ apps/` — playground and the main app both count.
3. A behaviour change is not a refactor. It needs a demo or spec proving the new behaviour.

Stores and generated APIs are public in some libraries (`dynamic-lut` exports both). An aliased
re-export (`ENVIRONMENT_INJECT` → `ENVIRONMENT_INJECT_DYNAMIC_LUT`) is the name consumers see —
changing the alias is a breaking change. Adding an `export` to a file that is already `export *`d
silently widens the public surface.

Prefer additive change: add the new surface, deprecate the old, remove in a later major.

## MUST — service-first architecture (owner decision, 2026-07-16)

New library behaviour uses **Angular services plus presentational components** — not facade +
signal store. The existing facade/signal islands (`dynamic-lut`, the request/import-layer domains
in `agrimap-component`, `dynamic-dashboard`) are working as intended: leave them exactly as they
are, do not align them, and never cite them as precedent for a new facade in a library.
A workspace-wide migration is an owner-initiated task only.
See `006-6-facade-patterns-in-library.md` for when a facade is and is not appropriate.

## MUST — environment injection and generated APIs

- Consumer wiring uses the `ENVIRONMENT_INJECT_<LIB>` token and the library's `provideXxx`
  function — `008-8-environment-injection-consumer-wiring.md`.
- Generated API work reads [gencode-api.md](../gencode-api.md) first; the library flavour is
  `npm run gen-api:<lib>` (`007-7-generated-apis-per-library.md`). No hand-written clients, no
  edits to generated output.
- Peer dependencies and the exact-pin trap: `002-2-library-catalog-dependency-graph.md`.
  `auth-client` pins `@agrimap/ui-kit` at an exact version — check before bumping.

## MUST — every library feature ships complete

Per [patterns/frontend.md](../frontend.md#fe-library) and
[backend-engineer-style library rules](../backend.md#be-libraries), one feature task updates:
public API and compatibility notes · `README.md` · the Playground example ·
library tests/build and the Playground verification path (`011-10-playground-demo-pattern.md`).

## SHOULD

- Security baseline SEC-15/16/21/22 ([security-baseline.md](../security-baseline.md)): new and rewritten code never introduces them; existing matches are reported and fixed on request.
- UI-kit form controls: `ControlContainer` + `controlName` — `009-9-ui-kit-form-control-pattern.ts`.
- Config-driven forms (CVA + Validator) — `010-9-form-ctrl-config-driven.ts`.
- Test shape: TestBed + `whenStable()` — `012-11-testing-conventions.ts`.
- Versioning: dev `0.0.N` / prod `1.0.N`, Nexus publish — `004-4-versioning-publish-workflow.md`.
  Richer assertions and full semver rules remain an owner evidence gap.

## FREE

Internal algorithm, transformation bodies, private helpers, and local decomposition behind a
stable public surface.

## Before the write

1. `public-api.ts` question answered and consumers listed.
2. Every `MUST` row verified against the opened entry.
3. `Patterns:` line lists `agm:golden/frontend-libraries` plus the exact entries opened.
