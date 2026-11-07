# Back-end Engineer discipline

## สารบัญ

- [Required classification](#required-classification)
- [Profile detection](#profile-detection--resolve-from-repo-evidence-before-asking)
- [Host profiles](#host-profiles)
- [Structure over logic](#structure-over-logic-owner-stance-2026-07-16)
- [C# baseline](#c-baseline)
- [Phase 1: foundation](#phase-1-foundation)
- [Phase 2: active-development](#phase-2-active-development)
- [Database source of trust](#database-source-of-trust)
- [Error/message reconciliation](#errormessage-reconciliation)
- [HTTP request-value normalization](#http-request-value-normalization)
- [Phase 3: stabilization](#phase-3-stabilization)

Apply this embedded supporting discipline to every `be-main` or `be-library` analysis, architecture, feature, refactor, review, test, QA, and prompt. It augments the selected BE read or authorized write action without choosing it or creating write intent. Do not expose a separate Back-end Engineer command.

Every BE role carries this discipline. For C# scope it also carries [`patterns/csharp.md`](patterns/csharp.md); when request values are in scope it carries the exact request-value golden. A delegated handoff must include the applicable rules instead of expecting the receiver to rediscover them.

## Required classification

Record:

- `target_kind`: `be-main` or `be-library`;
- `backend_profile`: required only for `be-main`, exactly `agmws` or `agmbo`;
- `phase`: `foundation`, `active-development`, or `stabilization`;
- affected Domain boundary, contracts, consumers, data, and runtime path;
- logic/contract/data/ownership impact.

Do not add Type A/B/C or a required `change_kind`. Derive the concrete work from the owner objective and current code. `agmws` and `agmbo` describe host/runtime shape, not task types or architecture variants.

## Profile detection — resolve from repo evidence before asking

Detect `target_kind`/`backend_profile` from the codebase and declare the result as `INFERENCE` with its evidence in the receipt. Ask the owner only when the signals below conflict or are absent — do not ask when the repository already answers.

| Signal (check in this order) | Conclusion |
| --- | --- |
| Class library: no web host entry, packaged public surface, `README.md` + Playground convention, no Controllers | `be-library` |
| `Infrastructure/Jobs/JobScheduler.cs` present, Quartz.NET package reference, **no** Presentation/Controllers tier; service name pattern `agmbo-*` | `be-main` + `backend_profile=agmbo` |
| Presentation tier with Controllers/routes, ASP.NET Core web host, HTTP contract DTOs; service name pattern `agmws-*` | `be-main` + `backend_profile=agmws` |

Conflicting signals (e.g., Controllers **and** Quartz in one host) are an owner question, not a guess.

## Host profiles

**agmws and agmbo share the entire structure and knowledge base.** Application/UseCase, Domain, Port, Infrastructure, model placement, DI, error/message reconciliation, and all `golden/backend-main/` evidence apply to both profiles equally. The only difference is the entry point: `agmws` enters from a client HTTP request through the Presentation tier; `agmbo` enters from a Quartz.NET cron trigger that calls `Infrastructure/Jobs/JobScheduler.cs` as its endpoint. Never withhold or re-request backend knowledge for an `agmbo` task because the examples look "web-flavored" — swap the entry tier and reuse everything else unchanged.

### `backend_profile=agmws`

Use the local web flow:

```text
Presentation/Controller -> Application/UseCase -> Domain -> Port -> Infrastructure -> response mapping
```

Keep Controller/route code thin. Contract binding and response mapping belong at the edge; orchestration belongs in Application/UseCase; business meaning and invariants belong in Domain; external/data mechanics belong in Infrastructure.

### `backend_profile=agmbo`

Use the batch flow without a Presentation tier:

```text
Quartz/JobScheduler trigger -> Application/UseCase -> Domain -> Port -> Infrastructure
```

Keep `Infrastructure/Jobs/JobScheduler.cs` in namespace `AgriMap.Worker.Infrastructure.Jobs` and limit it to scheduling/registration concerns. Do not put business logic in the scheduler. Record trigger, concurrency, retry, error, and registration effects when scheduling changes.

## Structure over logic (owner stance, 2026-07-16)

The strict contract is **structure**: layer placement, entry-point shape, model classification, naming, DI registration, and public/route/data contracts. Internal logic *within* a correctly placed layer is where the model applies its own intelligence — implement it with best engineering judgment, and do not demand a golden example, block, or escalate for every internal implementation decision. Escalate only when the choice changes a contract, data behavior, or ownership boundary. A structurally correct slice with model-authored internal logic is the expected outcome, not a compromise.

The stance is checkable: [patterns/checklists/README.md](patterns/checklists/README.md) defines `MUST`, `SHOULD`, and `FREE`, and the target kind's checklist assigns each row. Structure is `MUST`, verified against the opened entry; internal logic is `FREE` and never a reason to block or ask.

## C# baseline

For every C# target, apply [`patterns/csharp.md`](patterns/csharp.md). Owner-approved and curated golden rules outrank incidental project inconsistency; preserve a proven public/runtime compatibility constraint and report it rather than copying unrelated legacy style.

## Phase 1: `foundation`

Build the smallest stable runway:

- inspect and reuse `agrimap.platform` libraries before creating Core/platform infrastructure;
- establish template, project/folder shape, configuration, DI, generated boundaries, logging/observability, test/build commands, and local development infrastructure;
- define Domain ownership and host profile before scaffolding feature layers;
- for libraries, define the public surface, compatibility boundary, README structure, Playground, build, and packaging path.

Foundation gate:

- no duplicated platform/Core capability without evidence;
- configuration and DI are reproducible;
- one representative vertical path proves the structure;
- Domain, contract, and persistence model placement is explicit.

## Phase 2: `active-development`

Analyze the Domain before creating files:

1. If the Domain boundary exists, extend that boundary and complete only the required vertical slice.
2. If it does not exist, establish the smallest evidence-backed Domain boundary and ownership, then create the required web Controller or batch trigger plus Application/UseCase, Domain, Port, and Infrastructure pieces.
3. Classify every model as transport DTO, Application model, Domain entity/value object, or persistence/external projection before placement.
4. Preserve route, response, error, stored-procedure, event, and public API contracts unless the owner approved change.
5. Keep Controllers and batch triggers thin; never use the entry point as the business layer.
6. For libraries, update `README.md` and Playground in the same feature task.

Active-development gate:

- the original feature/bug is complete across the required layers;
- no speculative layer, model, repository, or abstraction was added;
- affected callers, registrations, contracts, and data mappings were checked;
- proportional tests/build/static checks passed.

## Database source of trust

Most AgriMap backend work reaches data through stored procedures, so run this gate whenever inspected or touched BE code calls a procedure, executes SQL, or maps a persisted result — analysis, diagnosis, feature, refactor, review, test, QA, and prompt alike.

1. Load [`db-schema-context.md`](db-schema-context.md) and complete its lookup and SP → table trace before concluding anything about data, error codes, validation, or result shape.
2. Owner DDL under `.agrimap-agent/knowledge/references/db-schema/**/*.sql` is `FACT`; product `sql/<GROUP_OR_DOMAIN>/` is next; `.agrimap-agent/knowledge/drafts/sql/` stays `tentative` and is never evidence.
3. A procedure name in C# is a pointer, not a contract. Open the procedure, then the tables and `LUT_*` lookups it touches, before stating what it returns, validates, or throws.
4. Missing schema is a named `UNKNOWN` and an owner question, never an inferred table, column, type, key, constraint, or message code, use the managed metadata/SELECT-only route in [sql-context-readonly.md](sql-context-readonly.md) when needed; never direct DB connections or writes.
5. Record `db-schema: <loaded>/<expected>` in the receipt with the unresolved objects listed.

## Error/message reconciliation

Run this gate whenever touched BE code defines, emits, maps, translates, or forwards a user-facing error code, including codes received from a stored procedure.

1. Trace exact codes across Domain, Application/UseCase, Presentation or batch boundary, Infrastructure, and in-scope SQL. Distinguish a user-facing contract code from a technical exception or diagnostic.
2. For an AgriMap-deployed message, use `sql/<GROUP_OR_DOMAIN>/messages.sql` and `[agrimap_app].[LUT_APP_MESSAGES] ([ID], [DESCR])`; the normalized golden registry outranks a project's legacy `messages.txt` or custom SQL layout. If the service proves that a code belongs to an external non-SQL registry with a separate owner, preserve that compatibility boundary and report it instead of inventing a SQL insert.
3. Apply the same-code rule before adding anything: same code + same meaning is reused without another insert; same code + different or ambiguous meaning is an owner conflict; a new code receives one clear user-facing definition plus one `IF NOT EXISTS`-guarded insert that checks and inserts the same ID.
4. Keep raw exception messages, stack traces, database text, and internal identifiers in logs/telemetry rather than the user-facing description.
5. Handoff must name the artifact path and list codes found, reused, added, conflicted, and verified for duplicates/idempotency. If no user-facing code changed, record `no message changes`. A code with no proven dictionary contract is incomplete, not permission to guess a table or insert.

## HTTP request-value normalization

Apply this gate to both `be-main` and `be-library` whenever code reads, resolves, validates, or refactors cookie, header, query, form, or JSON-body values. Load only [`013-1-extensions-request-value-normalize.md`](patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md) for the detailed API and compatibility contract.

1. Scan the affected path for direct `Request.Headers`, `Request.Cookies`, `Request.Query`, `Request.Form`, body reads, repeated trim/blank checks, fallback chains, and hardcoded request-key strings.
2. For `be-main`, reuse the active `AgriMap.Platform.Extensions` API only when the referenced package/source proves that surface exists. For `be-library`, preserve the published API and update README/Playground/tests with any intentional change.
3. Resolve the first non-blank request value in this priority: Cookie (highest) -> Header -> QueryString (lowest). Read Form/body only after synchronous sources when the API supports them. Preserve first-versus-joined multi-values, blank-to-null normalization, trimming, JSON case behavior, buffering, cancellation, and generated device-ID fallback.
4. Centralize cookie/header/parameter names in `ClientRequestResolverExtensions`. These helpers are static extensions and require no DI registration; do not add a wrapper service merely to satisfy structure.
5. Treat Cookie `AgmTraceId` -> Header `agm-device-id` -> QueryString `device_id` as the canonical device-ID mapping, and use `AgmLoginContextId` as the login-context cookie name. This order is normative for new/touched code and outranks narrower historical request-source examples.
6. Refactor by one caller family or acceptance slice, then verify direct-access remnants and behavior. Do not mass-replace mechanically when an established public contract differs.

Analysis names duplication clusters and migration boundaries. Diagnosis proves whether inconsistent extraction/normalization causes the symptom. QA reruns representative cookie/header/query/form/body and fallback cases against the golden contract.

## Phase 3: `stabilization`

Prioritize release confidence:

- establish a behavioral baseline before refactor;
- verify critical flows, regression paths, failure behavior, configuration, and deployment build;
- run the project's existing vulnerability, dependency, and production-readiness checks without inventing a parallel security policy;
- inspect performance and data behavior where evidence or scale makes them relevant;
- keep refactor bounded and require owner trade-off before logic, contract, data, or ownership changes;
- record remaining debt as separate prioritized work.

Stabilization gate:

- release-critical paths and production configuration are verified;
- blocking effects are fixed or explicitly accepted;
- refactor preservation/change mode is proven;
- no cleanup is hidden inside an unrelated bug fix.

For a release evaluation after changing this backend discipline or its golden guidance, run [be-scenarios.md](evals/be-scenarios.md). Do not load the eval catalog during ordinary backend work.
