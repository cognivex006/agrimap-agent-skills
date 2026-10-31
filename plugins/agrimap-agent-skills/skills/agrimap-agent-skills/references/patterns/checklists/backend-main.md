# Golden checklist — `be-main`

Collection `golden/backend-main/` · status `legacy-compatible` · evidenceMode `raw-immutable`.
Tiers and the "open, do not recall" rule: [README.md](README.md).

**Read the status line.** These raw files are byte-for-byte source evidence with known defects
(duplicate imports, mutually exclusive placeholder methods, inconsistent async naming, DTO leakage
into repository boundaries, ambiguous Domain versus persistence placement). They are compatibility
evidence for *structure*, never a copy-ready template. Owner-approved
[patterns/csharp.md](../csharp.md) outranks them for all new code —
[conflict-resolution.md](../conflict-resolution.md) decision precedence applies.

`agmws` and `agmbo` share this entire checklist. Only the entry tier differs: `agmws` enters from
Presentation/Controller, `agmbo` from `Infrastructure/Jobs/JobScheduler.cs`. Never withhold this
knowledge from an `agmbo` task because the examples look web-flavoured.

## Contents

- [MUST — namespace allowlist](#must--namespace-allowlist-patternscsharpmd)
- [MUST — layer flow and placement](#must--layer-flow-and-placement)
- [MUST — naming and shape](#must--naming-and-shape)
- [MUST — preserved contracts](#must--preserved-contracts)
- [MUST — data and error gates](#must--data-and-error-gates)
- [SHOULD](#should)
- [FREE](#free)
- [Before the write](#before-the-write)

## MUST — namespace allowlist (`patterns/csharp.md`)

Root: `agmws` = `AgriMap.Web.Service`, `agmbo` = `AgriMap.Worker`. Only these fixed namespaces may
follow the root. **A subfolder never extends the namespace.**

| Tier | Allowed below `{Root}` |
| --- | --- |
| Application | `Application`, `Application.Interfaces`, `Application.UseCases` |
| Domain | `Domain.Constants`, `Domain.Entities`, `Domain.ValueObjects` |
| Infrastructure | `Infrastructure`, `Infrastructure.ExternalService`, `Infrastructure.Persistence.Interfaces`, `Infrastructure.Persistence.Models`, `Infrastructure.Persistence.Repositories` |
| Presentation | `Presentation.Config`, `Presentation.Controllers`, `Presentation.DTOs.Requests`, `Presentation.DTOs.Responses`, `Presentation.Filters`, `Presentation.Middlewares`, `Presentation.Mockup`, `Presentation.Models` |
| Shared | `Shared.Extensions`, `Shared.Helpers` |
| `agmbo` | `Infrastructure.Jobs` |

An allowlist is not permission to create every tier. `Application.Models` does not exist — do not
invent it to hold a result. One public type per file; apply NS-01 [file layout](../csharp-file-layout.md): optional required usings, blank line, file-scoped namespace, blank line, type; no imports after the namespace or alias bypass.

## MUST — layer flow and placement

```
agmws: Presentation/Controller -> Application/UseCase -> Domain -> Port -> Infrastructure -> response mapping
agmbo: Quartz/JobScheduler trigger -> Application/UseCase -> Domain -> Port -> Infrastructure
```

| Artifact | Placement |
| --- | --- |
| HTTP request/response contract | `Presentation.DTOs.Requests` / `.Responses` (`004-2-1-request-dto.cs`, `005-2-2-response-dto.cs`) |
| business identity, invariant, or value reused beyond persistence | `Domain.Entities` / `Domain.ValueObjects` (`017-5-domain-example.cs`) |
| MongoDB document or ORM entity | `Infrastructure.Persistence.Models` |
| AtlasX Core Query result with business meaning | Domain type |
| AtlasX Core Query result that *is* the outward contract | `Presentation.DTOs.Responses` |
| data-access abstraction | `Infrastructure.Persistence.Interfaces` (`009-4-1-repository-interface.cs`) |
| SQL/API implementation and mapping | `Infrastructure` (`010-4-2-repository-implementation.cs`) |

Do **not** create `Infrastructure.Persistence.Models` merely because a repository returns AtlasX
data. Classify by meaning. Create only the responsibilities the feature requires — never generate
the whole chain for a library task, a SQL-only task, simple endpoint reuse, or a feature with no
new persistence dependency.

## MUST — naming and shape

- Transport `*RequestDto` / `*ResponseDto`; orchestration `*UseCase` (`007-3-1-use-case-interface.cs`,
  `008-3-2-use-case-implementation.cs`); inward port `I*Repository`; implementation `*Repository`.
- `PascalCase` types/members, `I` interface prefix, `_camelCase` private readonly dependencies,
  `Async` suffix on new async I/O. Preserve existing public names when renaming would break compatibility.
- Controllers and job triggers stay thin: contract binding and response mapping at the edge,
  orchestration in the use case, business meaning in Domain, mechanics in Infrastructure. The entry
  point is never the business layer.
- DI registered with the current pattern (`011-4-3-injection-pattern.cs`); `Application` and
  `Infrastructure` root namespaces own their registration extensions.
- `agmbo`: keep `Infrastructure/Jobs/JobScheduler.cs` in `AgriMap.Worker.Infrastructure.Jobs`,
  scheduling and registration only. No verified owner example exists for the scheduler itself —
  synthesize from standard Quartz.NET practice under the thin-trigger rule, record the gap as an
  intake follow-up, and do not block the task.

## MUST — preserved contracts

Route, DTO, response shape, error code, stored-procedure, event, and public API contracts are
preserved unless the owner approved the change. Do not relocate existing repository interfaces or
models across layers during a feature or bug task unless architecture correction is explicitly in scope.

- Stored procedure naming is `{ENTITY}_{ACTION}` (`022-9-stored-procedure-naming.txt`).
- Cross-service calls use the gateway keys and Pod-to-Pod Services in
  [service-url-matrix.md](../../service-url-matrix.md) (`030-13-container-communication-rule.txt` shows
  the call flow only); for outward URL, domain, redirect, or callback values use
  [application-url-matrix.md](../../application-url-matrix.md), never a guessed host. Every service and
  job keeps an anonymous `/health` at the container root.

## MUST — data and error gates

- Any touched code that calls a procedure, executes SQL, or maps persisted data runs the
  [database source of trust](../../backend-engineer.md#database-source-of-trust) gate and records
  `db-schema: <loaded>/<expected>`. A procedure name in C# is a pointer, not a contract.
- Any touched user-facing error code runs
  [error/message reconciliation](../../backend-engineer.md#errormessage-reconciliation) — same code
  and same meaning is reused without a second insert; a conflicting meaning is an owner question.
  Report `no message changes` when nothing changed.
- Any cookie/header/query/form/body read applies
  [HTTP request-value normalization](../../backend-engineer.md#http-request-value-normalization) and
  opens `golden/backend-libraries/013-1-extensions-request-value-normalize.md`.

With a matching `*.Tests.csproj`/`*.Test.csproj`, the production `.csproj` needs `InternalsVisibleTo` for the test assembly and `Compile Remove="Tests\**\*.cs"`, without duplicates. See `patterns/csharp.md` TEST-03.

- Changes to `*.Tests.csproj`/`*.Test.csproj`: check affected Dockerfiles for an explicit production `.csproj` in `dotnet publish`, with the correct stage path and matching restore (TEST-04).
- Per method: at most seven `if`/`else if` decisions; per method/constructor: at most seven parameters. No nested ternaries, including inside anonymous-object branches. Preserve behavior when extracting statements/helpers, and check the configured SonarQube gate separately (QUALITY-01..03).

## SHOULD

- Security baseline SEC-01..20 ([security-baseline.md](../security-baseline.md)): new and rewritten code never introduces them; existing matches are reported with the response contract and fixed on request.
- Controller shape and route/verb conventions — `001..003-1-presentation-controller-examples.cs`,
  `020-7-http-verb-and-route-reference.cs`, `021-8-rest-operation-mapping.txt`.
- Binding reference — `006-2-3-binding-reference.cs`.
- Query parameter and result handling — `014`/`015-4-5-...cs`; multi-record payloads — `016-4-6-...cs`.
- Error handling shape — `018`/`019-6-error-handling-examples.*`; response envelope —
  `024-10-response-structure-reference.md`.
- Comment style — `029-12-comment-reference.cs`.
- Procedure debugging — `012`/`013-4-4-debugging-sql-stored-procedure.cs`.
- Advisory smells (QUALITY-05): recommend; edit on request, or safe tier ADV-05/10/11 in edited files. Review always reports ADV-01 split overloads with `file:line` ([overload order](../csharp-file-layout.md#overload-order--adv-01-s4136)).

## FREE

Algorithm choice, validation body, local decomposition, and private member ordering inside a
correctly placed layer, except that same-name overloads stay adjacent (ADV-01). Do not demand a golden example or escalate for these.

## Before the write

1. Profile detection (`be-main` + `agmws`|`agmbo`) declared as `INFERENCE` with its evidence.
2. Every `MUST` row verified; namespace checked against the allowlist and NS-01 file order (no import after the namespace).
3. `Patterns:` line lists `agm:golden/backend-main` + `agm:patterns/csharp` plus the exact entries opened.
