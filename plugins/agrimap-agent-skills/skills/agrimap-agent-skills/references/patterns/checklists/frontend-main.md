# Golden checklist — `fe-main`

Collection `golden/frontend-main/` · status `current` · evidenceMode `curated-reference`.
Tiers and the "open, do not recall" rule: [README.md](README.md).

Confirm `target_kind=fe-main` first ([frontend-engineer.md](../../frontend-engineer.md#target-detection--resolve-from-repo-evidence-before-asking)).
A file under `projects/<lib>/` is library lane — use [frontend-libraries.md](frontend-libraries.md) instead.

## MUST — layered facade (`002-2-architecture-rules.md`)

| ID | Rule | Detect |
| --- | --- | --- |
| R1 | A component injects the Facade only — never a `*Store` or a generated `Agmws*Api`. Listing the store in component `providers: []` is allowed; injecting it to call it is not. | `grep -rnE 'inject\(\w+Store\)\|inject\(Agmws\w+Api\)' src/app/features src/app/shared` must be empty |
| R2 | The Facade is the only orchestrator: API call → `convertToCamel` → store write → error surface. It exposes readonly `Signal<T>` selectors and use-case methods returning `void` or `Observable<T>` — nothing else. | review the facade's public surface |
| R3 | The Store is pure state: private `signal<State>`, `computed` selectors, synchronous mutators. No injected service or API, no `subscribe`, no `await`/`firstValueFrom`, no `effect`. | `grep -rnE 'subscribe\|firstValueFrom\|await\|inject\(\|effect\(' src/app/domain/**/*.store.ts` must be empty |
| R4 | Data reaches the UI through signals only. A component may subscribe **only** for a UI follow-up on a use case returning `Observable` (close/navigate/reload, no state mutation and no HTTP in the callback) or to wire an internal UI stream whose terminus is a facade call. | search component `.subscribe(` sites and classify each against those two cases |
| R5 | Every long-lived subscription carries `takeUntilDestroyed()`; single-shot facade HTTP still takes `takeUntilDestroyed(this.destroyRef)`. Manual `ngOnDestroy` + `Subscription` is forbidden. | `grep -rn 'ngOnDestroy' src/app/features src/app/shared` — each hit needs a non-subscription reason |

Creating a store or facade for a trivial component with no domain state or orchestration is a
violation of the opposite kind — see [patterns/frontend.md](../frontend.md#fe-main).

## MUST — typing (`008-3-typesafe-t6-forbidden.ts`)

- No `any`. Use `unknown` and narrow.
- No non-null assertion `!`, except `@ViewChild` declared `static: true`.
- A generated-API response is converted to a domain model (`convertToCamel` plus the type from
  `xxx.model.ts`) **before** it is written to the store.

When a signal primitive choice is unclear, open `009-4-signal-decision-guide.md` —
`signal` vs `computed` vs `effect` vs `linkedSignal` is a `MUST`, not a preference. A private
`_x` field paired with a `computed` is the effect-copy anti-pattern.

## MUST — naming (`013-8-naming-patterns.md`)

| Surface | Required |
| --- | --- |
| files/folders | `kebab-case` plus type suffix: `.component.ts`, `.facade.ts`, `.store.ts`, `.model.ts`, `.service.ts`, `.enum.ts`, `-util.ts` |
| classes | `PascalCase` with the suffix matching the file type (`DataWarehouseFacade`, `DataWarehouseStore`) |
| selector | prefix `agrimap-`. `app-` is legacy — never add a new one |
| outputs | the event that happened: `closed`, `created`, `filterChange`. Never an `on*` prefix on an output |
| component handlers | `on*` (`onSelectItem`). `handle*` is legacy — never add a new one |
| facade use cases | verb-led with the return shape from the N6 table: `load*`/`fetch*`/`search*` → `void`; `get*` → value or `Observable`; `create*`/`update*`/`delete*`/`save*` → `Observable<boolean>`; `add*`/`remove*`/`set*`/`clear*` → `void` |
| booleans | `show*` for UI visibility, `is*`/`has*` for facts, `loading` for the store standard |
| signals | private store state `state`/`xxxState`; selectors are plain nouns with no prefix, no `_` prefix; `Subject` suffix; `$` suffix on Observable-holding members |
| types | `PascalCase`, no `I`/`T` prefix; shared consts `camelCase`, not `SCREAMING_SNAKE`; generated `Dto` suffix is never imitated in domain |
| routes | `kebab-case` resource paths |

## MUST — generated API

Any task that adds, changes, or consumes a generated endpoint reads
[gencode-api.md](../gencode-api.md) first. Hand-written clients are forbidden and generated output
is never edited by hand. `018-11-generated-api-contract.md` is a pointer to that file. API URLs in
`environment.*.ts` follow [service-url-matrix.md](../../service-url-matrix.md).

## SHOULD

- Security baseline SEC-15/16/21/22 ([security-baseline.md](../security-baseline.md)): new and rewritten code never introduces them; existing matches are reported and fixed on request.
- Component layout and section order — `010-5-component-layout.md`.
- Template control flow (`@if`/`@for` syntax and `track`) — `012-7-view-control-flow-syntax.md`.
- Async flow split between store and facade — `015-9-async-data-flow-store.ts`, `016-9-async-data-flow-facade.ts`.
- Store/facade test shape — `019-12-testing-conventions.md`.
- Asset placement — `017-10-assets-management.md`.

## FREE

Algorithm choice, the body of a validation or transformation, local helper decomposition, and
private member ordering inside a correctly placed layer. Do not request a golden example for these.

## Before the write

1. Reuse search completed and recorded — [frontend-engineer.md](../../frontend-engineer.md#reuse-first-decision).
2. Every `MUST` row above verified against the opened entry.
3. `Patterns:` line lists `agm:golden/frontend-main` plus the exact entries opened.
