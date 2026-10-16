# Compact operation entrypoint: agm-analyze

<!-- Generated from config/operations.json. Do not edit directly. -->

- Operation: `analyze`
- Workflow depth: default `light`; allowed `light`, `standard`, `regulated`
- Mode: `product-read-only`
- Purpose: Analyze scope, hidden problems, impacts, and trade-offs.
- Deliverable: requested result with proportional evidence; no lifecycle for ordinary answers

## Inputs and help

- Required: objective or a pointed target.
- Conditional: target_kind when repository evidence cannot resolve the affected discipline.
- Minimal example: `$agm-analyze target_files=src/orders.ts objective="Explain duplicate requests; do not edit"`

## Execute this contract

1. Inspect the full target and affected callers before conclusions. Database-linked conclusions require actual project code, the applicable db-schema, and representative local examples/data shapes; otherwise label the result preliminary and list the missing evidence without guessing. Managed read-only context retrieval follows sql-context-readonly.md; never create a direct connection or execute database writes.
2. Return evidence-backed findings at the requested level of detail. No mandatory headings or task artifacts for questions; never edit product artifacts.
3. No goals or A/B groups here. When the evidence needs deep reading in three or more projects, fan out read-only subagents, one per project, and synthesize the conclusion as Main; smaller scopes Main reads itself. Hand a resulting larger change to agm-plan or agm-prompt for goal planning.

## Load now

- [goal-rules.md](../goal-rules.md) — mandatory Think/Simplicity/Surgical/Goal-Driven discipline
- [analysis-discipline.md](../analysis-discipline.md) — evidence labels and reasoning quality
- [input-and-scope.md](../input-and-scope.md) — target and input coverage
- [recommendations.md](../recommendations.md) — visible evidence-calibrated recommendations and routine uncertainty disclosure

## Load only when the condition matches

- When target_kind is fe-main or fe-library: [frontend-engineer.md](../frontend-engineer.md) — frontend analysis fundamentals
- When target_kind is be-main or be-library: [backend-engineer.md](../backend-engineer.md) — backend analysis fundamentals including request-value normalization
- When the backend target contains C#: [patterns/csharp.md](../patterns/csharp.md) — project-wide C# shape, naming, boundary, and code examples
- When the backend target reads cookie, header, query, form, JSON body, or device ID: [patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md](../patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md) — exact normalize API and compatibility behavior
- When the target reads or writes data through a stored procedure, view, table, or inline SQL: [db-schema-context.md](../db-schema-context.md) — owner DDL evidence and SP → table tracing
- When FE/BE URL, domain, redirect, or callback logic is in scope: [application-url-matrix.md](../application-url-matrix.md) — authoritative environment-specific URL selection
- When a service/job URL, gateway route, Pod-to-Pod call, base path or health endpoint is in scope: [service-url-matrix.md](../service-url-matrix.md) — service gateway keys, Kubernetes Services and health; no DB or IP data
- When material intent remains unresolved: [elicitation.md](../elicitation.md) — resolve only consequential ambiguity
- When database context is needed: [sql-context-readonly.md](../sql-context-readonly.md) — managed read-only metadata and SELECT; never database writes
- When you are about to ask the requester a question: [autonomy.md](../autonomy.md) — ask only requester-owned material choices, with a decision card
- When the project profile is spec-first or hybrid and the question concerns specified behavior: [spec-driven.md](../spec-driven.md) — spec items are the source of truth for specified behavior
- When the analysis proposes an execution order for two or more units: [subagents-and-branches.md](../subagents-and-branches.md) — parallel or sequential order and agent sizing

Do not read the router `SKILL.md` during operation execution. If this generated entrypoint is missing or corrupt, stop with `PACKAGE_ENTRYPOINT_MISSING` and ask for package sync/reinstallation; never broaden into the router.
