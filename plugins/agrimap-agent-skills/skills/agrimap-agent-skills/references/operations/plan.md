# Compact operation entrypoint: agm-plan

<!-- Generated from config/operations.json. Do not edit directly. -->

- Operation: `plan`
- Workflow depth: default `light`; allowed `light`, `standard`, `regulated`
- Mode: `product-read-only`
- Purpose: Create a reverse-engineered execution plan.
- Deliverable: requested result with proportional evidence; no lifecycle for ordinary answers

## Inputs and help

- Required: objective.
- Conditional: decision-owner choice when multiple material approaches remain viable.
- Minimal example: `$agm-plan objective="Add order cancellation" target_files=src/orders.ts`

## Execute this contract

1. Reverse-engineer current behavior, dependencies, callers, tests, and integration order before planning.
2. Each step names target, action, reason, verification, and decision-owner gate; do not implement.
3. Size first (goal-planning.md): work of about three hours or less in one lane is one goal without script, A/B groups or subagents. Larger or cross-lane work is broken into goals of about three hours, classified with scripts/goal-graph.mjs, shown as Group A and Group B with Main/Subagent ownership written into the plan so execution needs no repeated instruction.
4. Two or more units: end with the orchestration decision of subagents-and-branches.md — ordered work graph, contract-first steps, parallel or sequential, agents and model tier — ready to drive a long-running execution.

## Load now

- [goal-rules.md](../goal-rules.md) — mandatory Think/Simplicity/Surgical/Goal-Driven discipline
- [goal-planning.md](../goal-planning.md) — A/B goal planning: size gate, goals of about 3 hours, entry gates, GA/GB IDs
- [analysis-discipline.md](../analysis-discipline.md) — evidence-backed plan assumptions
- [input-and-scope.md](../input-and-scope.md) — scope ledger
- [recommendations.md](../recommendations.md) — visible evidence-calibrated recommendations and routine uncertainty disclosure

## Load only when the condition matches

- When target_kind is fe-main or fe-library: [frontend-engineer.md](../frontend-engineer.md) — frontend execution-plan fundamentals
- When target_kind is be-main or be-library: [backend-engineer.md](../backend-engineer.md) — backend execution-plan fundamentals
- When C#, .csproj or .NET-publishing Dockerfiles are in scope: [patterns/csharp.md](../patterns/csharp.md) — project-wide C# implementation baseline
- When the backend plan touches cookie, header, query, form, JSON body, or device-ID resolution: [patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md](../patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md) — request-value API and precedence plan
- When the plan touches a stored procedure, table, or persisted data: [db-schema-context.md](../db-schema-context.md) — schema evidence required before data steps
- When the plan includes FE/BE URL, domain, redirect, or callback logic: [application-url-matrix.md](../application-url-matrix.md) — authoritative environment-specific plan inputs
- When a service/job URL, gateway route, Pod-to-Pod call, base path or health endpoint is in scope: [service-url-matrix.md](../service-url-matrix.md) — service gateway keys, Kubernetes Services and health; no DB or IP data
- When material intent remains unresolved: [elicitation.md](../elicitation.md) — resolve only consequential ambiguity
- When you are about to ask the requester a question: [autonomy.md](../autonomy.md) — ask only requester-owned material choices, with a decision card
- When the project profile is spec-first or hybrid and the question concerns specified behavior: [spec-driven.md](../spec-driven.md) — spec items are the source of truth for specified behavior
- When the plan has two or more units: [subagents-and-branches.md](../subagents-and-branches.md) — work graph, parallel or sequential, rolling dispatch and job worktrees

Do not read the router `SKILL.md` during operation execution. If this generated entrypoint is missing or corrupt, stop with `PACKAGE_ENTRYPOINT_MISSING` and ask for package sync/reinstallation; never broaden into the router.
