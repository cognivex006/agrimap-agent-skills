# Compact operation entrypoint: agm-be

<!-- Generated from config/operations.json. Do not edit directly. -->

- Operation: `be`
- Workflow depth: default `light`; allowed `light`, `standard`, `regulated`
- Mode: `action-routed`
- Purpose: Analyze, design, create, edit, refactor, or explicitly test AgriMap .NET backend work (agmws-*/agmbo-* services, AgriMap.* libraries) in golden structure through one domain façade.
- Deliverable: requested result with proportional evidence; no lifecycle for ordinary answers

## Action gate

Resolve exactly one action before target inspection or product writes. Safe defaults are read-only; fallback is action routing, not a passive capability. Capabilities support the chosen read or authorized write but cannot choose it or create write intent.

| Action | Mode | Activation | Allowed depth | Purpose |
| --- | --- | --- | --- | --- |
| `analyze` | `product-read-only` | `explicit-or-safe-default` | `light`, `standard`, `regulated` | Inspect backend scope, contracts, callers, data, risks, and trade-offs without editing |
| `design` | `product-read-only` | `explicit-or-safe-default` | `light`, `standard`, `regulated` | Define backend boundaries, flow, validation, failure behavior, and acceptance without editing |
| `create` | `product-write` | `explicit` | `light`, `standard`, `regulated` | Create a bounded new backend slice |
| `edit` | `product-write` | `explicit` | `light`, `standard`, `regulated` | Modify a bounded existing backend slice |
| `refactor` | `product-write` | `explicit` | `light`, `standard`, `regulated` | Refactor backend code under exactly one behavior mode and a proven preservation boundary |
| `test` | `product-write` | `explicit` | `light`, `standard`, `regulated` | Create explicitly requested or selected backend tests after embedded test-decision advice |

## Inputs and help

- Required: one action or unambiguous natural-language intent; an objective or pointed backend target.
- Conditional: target_kind, backend_profile, and phase when repository evidence cannot resolve them; requester selection when embedded test-decision advice finds unspecified coverage.
- Minimal example: `$agm-be action=create target_kind=be-main backend_profile=agmws objective="Add cancel-order endpoint"`

## Execute this contract

1. Resolve exactly one action before inspection. Explicit action= wins; otherwise infer only from unambiguous verbs and report the resolved action. Ask one short question when create, edit, refactor, or read versus write remains ambiguous.
2. For analyze/design, never edit product files. For authorized create/edit/test, choose depth from tracking and boundary needs; no extra prompt ceremony.
3. For action=refactor, require exactly one mode before editing, preserve the declared logic boundary, and ask only about unresolved material behavior choices.
4. Apply the embedded test-decision capability during analyze, design, create, edit, and refactor. Classify required, recommended, or not_applicable; write tests only for action=test, a clear test request, or required coverage inside authorized implementation.

## Load now

- [goal-rules.md](../goal-rules.md) — mandatory Think/Simplicity/Surgical/Goal-Driven discipline
- [passive-capabilities.md](../passive-capabilities.md) — embedded design/test-decision boundaries
- [backend-engineer.md](../backend-engineer.md) — backend phase and profile discipline
- [patterns/backend.md](../patterns/backend.md) — current backend contract
- [recommendations.md](../recommendations.md) — visible evidence-calibrated recommendations and routine uncertainty disclosure

## Load only when the condition matches

- When action=refactor: [refactor-modes.md](../refactor-modes.md) — exact refactor behavior and logic-change boundary
- When target_kind=be-main: [patterns/checklists/backend-main.md](../patterns/checklists/backend-main.md) — MUST-tier namespace allowlist, layer placement, and preserved-contract checks
- When target_kind=be-library: [patterns/checklists/backend-libraries.md](../patterns/checklists/backend-libraries.md) — MUST-tier platform-reuse and published-surface checks
- When C#, .csproj or .NET-publishing Dockerfiles are in scope: [patterns/csharp.md](../patterns/csharp.md) — project-wide C# baseline
- When the target reads cookie, header, query, form, JSON body, or device ID: [patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md](../patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md) — request-value behavior and compatibility
- When the target calls a stored procedure, executes SQL, or maps persisted data: [db-schema-context.md](../db-schema-context.md) — owner DDL evidence and SP → table tracing
- When URL, domain, redirect, or callback logic is in scope: [application-url-matrix.md](../application-url-matrix.md) — authoritative environment-specific URL values
- When a service/job URL, gateway route, Pod-to-Pod call, base path or health endpoint is in scope: [service-url-matrix.md](../service-url-matrix.md) — service gateway keys, Kubernetes Services and health; no DB or IP data
- When material intent remains unresolved: [elicitation.md](../elicitation.md) — resolve only consequential ambiguity
- When database context is needed: [sql-context-readonly.md](../sql-context-readonly.md) — managed read-only metadata and SELECT; never database writes
- When project bootstrap, versioning, branches or release are requested: [release-and-bootstrap.md](../release-and-bootstrap.md) — project-specific adoption and release knowledge
- When an action writes files or a requester decision is needed: [autonomy.md](../autonomy.md) — decide, ask or confirm; decision card format
- When the action writes product files in a Git repository: [git-workflow.md](../git-workflow.md) — work branch, delivery and next-step card per the team workflow policy
- When the project profile is spec-first or hybrid: [spec-driven.md](../spec-driven.md) — development mode, spec locations and spec-first request handling

Do not read the router `SKILL.md` during operation execution. If this generated entrypoint is missing or corrupt, stop with `PACKAGE_ENTRYPOINT_MISSING` and ask for package sync/reinstallation; never broaden into the router.
