# Compact operation entrypoint: agm-architect

<!-- Generated from config/operations.json. Do not edit directly. -->

- Operation: `architect`
- Workflow depth: default `light`; allowed `light`, `standard`, `regulated`
- Mode: `product-read-only`
- Purpose: Design boundaries, contracts, and migration trade-offs.
- Deliverable: requested result with proportional evidence; no lifecycle for ordinary answers

## Inputs and help

- Required: boundary question or objective.
- Conditional: decision-owner approval before an architecture record becomes approved.
- Minimal example: `$agm-architect objective="Choose ownership boundary for order status"`

## Execute this contract

1. Map ownership, contracts, data flow, runtime/deployment effects, alternatives, migration, rollback, and reversible decisions.
2. Produce a proposed decision record; only recorded authority may approve it.

## Load now

- [goal-rules.md](../goal-rules.md) — mandatory Think/Simplicity/Surgical/Goal-Driven discipline
- [analysis-discipline.md](../analysis-discipline.md) — architecture evidence and counterarguments
- [service-ownership.md](../service-ownership.md) — canonical service and data ownership
- [recommendations.md](../recommendations.md) — visible evidence-calibrated recommendations and routine uncertainty disclosure

## Load only when the condition matches

- When target_kind is fe-main or fe-library: [frontend-engineer.md](../frontend-engineer.md) — frontend architecture fundamentals
- When target_kind is be-main or be-library: [backend-engineer.md](../backend-engineer.md) — backend architecture fundamentals
- When C#, .csproj or .NET-publishing Dockerfiles are in scope: [patterns/csharp.md](../patterns/csharp.md) — project-wide C# structure baseline
- When the backend architecture includes cookie, header, query, form, JSON body, or device-ID resolution: [patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md](../patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md) — request-value ownership and precedence contract
- When the architecture moves data through stored procedures, tables, or views: [db-schema-context.md](../db-schema-context.md) — schema ownership and SP → table facts
- When the architecture includes FE/BE URL, domain, redirect, or callback ownership: [application-url-matrix.md](../application-url-matrix.md) — authoritative environment-specific boundary values
- When a service/job URL, gateway route, Pod-to-Pod call, base path or health endpoint is in scope: [service-url-matrix.md](../service-url-matrix.md) — service gateway keys, Kubernetes Services and health; no DB or IP data
- When material intent remains unresolved: [elicitation.md](../elicitation.md) — resolve only consequential ambiguity
- When you are about to ask the requester a question: [autonomy.md](../autonomy.md) — ask only requester-owned material choices, with a decision card
- When the project profile is spec-first or hybrid and the question concerns specified behavior: [spec-driven.md](../spec-driven.md) — spec items are the source of truth for specified behavior

Do not read the router `SKILL.md` during operation execution. If this generated entrypoint is missing or corrupt, stop with `PACKAGE_ENTRYPOINT_MISSING` and ask for package sync/reinstallation; never broaden into the router.
