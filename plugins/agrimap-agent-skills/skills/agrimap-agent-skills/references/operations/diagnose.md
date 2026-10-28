# Compact operation entrypoint: agm-diagnose

<!-- Generated from config/operations.json. Do not edit directly. -->

- Operation: `diagnose`
- Workflow depth: default `light`; allowed `light`, `standard`, `regulated`
- Mode: `product-read-only`
- Purpose: Diagnose a problem to a proven root cause.
- Deliverable: requested result with proportional evidence; no lifecycle for ordinary answers

## Inputs and help

- Required: symptom.
- Conditional: reproduction evidence when the symptom is not observable from the repository.
- Minimal example: `$agm-diagnose symptom="Save returns 500" target_files=src/orders.ts implementation=false`

## Execute this contract

1. Reproduce or trace the symptom, separate causes from correlations, and test bounded hypotheses.
2. When the failing path reaches a stored procedure or SQL, open that procedure and the tables it touches from the local db-schema references, and name the exact failing condition instead of stopping at the caller.
3. Return the proven root cause, evidence, affected path, and proposed fix; do not apply the fix.

## Load now

- [goal-rules.md](../goal-rules.md) — mandatory Think/Simplicity/Surgical/Goal-Driven discipline
- [analysis-discipline.md](../analysis-discipline.md) — hypothesis and evidence discipline
- [input-and-scope.md](../input-and-scope.md) — symptom and target coverage
- [recommendations.md](../recommendations.md) — visible evidence-calibrated recommendations and routine uncertainty disclosure

## Load only when the condition matches

- When target_kind is fe-main or fe-library: [frontend-engineer.md](../frontend-engineer.md) — frontend diagnosis fundamentals
- When target_kind is be-main or be-library: [backend-engineer.md](../backend-engineer.md) — backend diagnosis fundamentals including request-value normalization
- When C#, .csproj or .NET-publishing Dockerfiles are in scope: [patterns/csharp.md](../patterns/csharp.md) — project-wide C# behavior and style baseline
- When the backend symptom may involve cookie, header, query, form, JSON body, or device-ID resolution: [patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md](../patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md) — expected extraction, normalization, and precedence
- When the symptom may involve a stored procedure, SQL error, or persisted data: [db-schema-context.md](../db-schema-context.md) — SP → table tracing from error code to the failing condition
- When FE/BE URL, domain, redirect, or callback logic may contribute to the symptom: [application-url-matrix.md](../application-url-matrix.md) — authoritative environment-specific URL behavior
- When a service/job URL, gateway route, Pod-to-Pod call, base path or health endpoint is in scope: [service-url-matrix.md](../service-url-matrix.md) — service gateway keys, Kubernetes Services and health; no DB or IP data
- When material intent remains unresolved: [elicitation.md](../elicitation.md) — resolve only consequential ambiguity
- When database context is needed: [sql-context-readonly.md](../sql-context-readonly.md) — managed read-only metadata and SELECT; never database writes
- When you are about to ask the requester a question: [autonomy.md](../autonomy.md) — ask only requester-owned material choices, with a decision card

Do not read the router `SKILL.md` during operation execution. If this generated entrypoint is missing or corrupt, stop with `PACKAGE_ENTRYPOINT_MISSING` and ask for package sync/reinstallation; never broaden into the router.
