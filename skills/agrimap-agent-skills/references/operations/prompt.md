# Compact operation entrypoint: agm-prompt

<!-- Generated from config/operations.json. Do not edit directly. -->

- Operation: `prompt`
- Workflow depth: default `light`; allowed `light`
- Mode: `workflow-write-only`
- Purpose: Analyze and refine requester intent into one immutable versioned Prompt Result with explicit Main and Subagent ownership.
- Deliverable: one immutable Prompt Result only when requested content changes; no tasks

## Inputs and help

- Required: objective or prompt text; conversation/session/context identity.
- Conditional: explicit source Prompt Result path for revision; owner confirmation when implicit source selection is ambiguous; target_kind/backend_profile for target-specific work.
- Minimal example: `$agm-prompt objective="Prepare a complete cancel-order implementation prompt" context=cancel-order`

## Execute this contract

1. Classify continuation intent. Explain/compare/propose/acknowledge/approve never create a version.
2. Create V1 for the first finalized executable result; create V2+ only for substantive requester-backed changes. Reuse identical content and preserve lineage.
3. Keep one file per version with Main/Subagent ownership; never create requirements or tasks.
4. Apply the goal-planning.md size gate: small single-lane work stays one goal without subagents; larger work carries GA/GB goals of about three hours, gates and Subagent assignments in the Prompt Result.

## Load now

- [goal-rules.md](../goal-rules.md) — mandatory Think/Simplicity/Surgical/Goal-Driven discipline
- [prompt.md](../prompt.md) — immutable Prompt Result lifecycle, source resolution, and package sections
- [passive-capabilities.md](../passive-capabilities.md) — embedded design support for brief and acceptance
- [model-capability-matrix.yaml](../model-capability-matrix.yaml) — capability-profile routing labels
- [recommendations.md](../recommendations.md) — visible evidence-calibrated recommendations and routine uncertainty disclosure

## Load only when the condition matches

- When the Prompt Result has two or more units or Subagent assignments: [subagents-and-branches.md](../subagents-and-branches.md) — Main/Subagent ownership, visibility, and integration boundaries
- When target_kind is fe-main or fe-library: [frontend-engineer.md](../frontend-engineer.md) — frontend fundamentals that every generated handoff must carry
- When target_kind is be-main or be-library: [backend-engineer.md](../backend-engineer.md) — backend fundamentals that every generated handoff must carry
- When C#, .csproj or .NET-publishing Dockerfiles are in scope: [patterns/csharp.md](../patterns/csharp.md) — project-wide C# rules that every generated handoff must carry
- When the backend handoff touches cookie, header, query, form, JSON body, or device-ID resolution: [patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md](../patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md) — request-value rules that every generated handoff must carry
- When target_kind is sql-table, sql-procedure, or sql-table-and-procedure: [patterns/sql.md](../patterns/sql.md) — SQL fundamentals that every generated handoff must carry
- When the handoff touches a stored procedure, table, or persisted data: [db-schema-context.md](../db-schema-context.md) — schema evidence the executor must carry
- When FE/BE URL, domain, redirect, or callback logic is in scope: [application-url-matrix.md](../application-url-matrix.md) — authoritative environment-specific Prompt Result inputs
- When a service/job URL, gateway route, Pod-to-Pod call, base path or health endpoint is in scope: [service-url-matrix.md](../service-url-matrix.md) — service gateway keys, Kubernetes Services and health; no DB or IP data
- When material intent remains unresolved: [elicitation.md](../elicitation.md) — resolve only consequential ambiguity
- When database context is needed: [sql-context-readonly.md](../sql-context-readonly.md) — managed read-only metadata and SELECT; never database writes
- When project bootstrap, versioning, branches or release are requested: [release-and-bootstrap.md](../release-and-bootstrap.md) — project-specific adoption and release knowledge
- When you are about to ask the requester a question: [autonomy.md](../autonomy.md) — ask only requester-owned material choices, with a decision card
- When the Prompt Result breaks work into goals or tasks: [goal-planning.md](../goal-planning.md) — GA/GB goals, entry paths and gates in Subagent assignments

Do not read the router `SKILL.md` during operation execution. If this generated entrypoint is missing or corrupt, stop with `PACKAGE_ENTRYPOINT_MISSING` and ask for package sync/reinstallation; never broaden into the router.
