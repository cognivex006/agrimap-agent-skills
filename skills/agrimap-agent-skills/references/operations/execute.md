# Compact operation entrypoint: agm-exec

<!-- Generated from config/operations.json. Do not edit directly. -->

- Operation: `execute`
- Workflow depth: default `light`; allowed `light`, `standard`, `regulated`
- Mode: `product-write`
- Purpose: Implement an authorized objective, approved Prompt Result, or resumable task with proportional verification and scoped delivery.
- Deliverable: requested result with proportional evidence; no lifecycle for ordinary answers

## Inputs and help

- Required: authorized objective or approved prompt or resumable task.
- Conditional: decision-owner choice only when a material deviation exceeds the authorized scope.
- Minimal example: `$agm-exec objective="Implement the accepted change"`

## Execute this contract

1. Use recorded requester authorization; a generated prompt is optional. Preserve binding scope, dependencies and acceptance while adapting implementation steps to evidence.
2. Select tracking/assurance from actual work; keep the savepoint current (checkpoint --done/--remaining/--next).
3. Verify proportionally and close after actual acceptance. Separate QA only for its real risk or an explicit request.
4. Two or more units: decide orchestration first (subagents-and-branches.md); as Leader dispatch with a rolling queue, verify and integrate each job, and remove its worktree. Follow goals an approved spec carries: ready tasks from goal-graph.mjs, refill slots after each acceptance (goal-planning.md); a direct request gets no goals.

## Load now

- [goal-rules.md](../goal-rules.md) — mandatory Think/Simplicity/Surgical/Goal-Driven discipline
- [recommendations.md](../recommendations.md) — visible evidence-calibrated recommendations and routine uncertainty disclosure
- [autonomy.md](../autonomy.md) — decide, ask or confirm; decision card format

## Load only when the condition matches

- When the authorized work targets frontend code: [frontend-engineer.md](../frontend-engineer.md) — frontend detection, reuse, and phase discipline carried into execution
- When the authorized work targets frontend code: [patterns/frontend.md](../patterns/frontend.md) — current frontend contract carried into execution
- When the authorized frontend work targets fe-main: [patterns/checklists/frontend-main.md](../patterns/checklists/frontend-main.md) — MUST-tier golden checks before a frontend application write
- When the authorized frontend work targets fe-library: [patterns/checklists/frontend-libraries.md](../patterns/checklists/frontend-libraries.md) — MUST-tier golden checks before a frontend library write
- When the authorized work targets backend code: [backend-engineer.md](../backend-engineer.md) — backend profile detection and phase discipline carried into execution
- When the authorized work targets backend code: [patterns/backend.md](../patterns/backend.md) — current backend contract carried into execution
- When the authorized backend work contains C#: [patterns/csharp.md](../patterns/csharp.md) — project-wide C# execution baseline
- When the authorized backend work targets be-main: [patterns/checklists/backend-main.md](../patterns/checklists/backend-main.md) — MUST-tier golden checks before a backend service write
- When the authorized backend work targets be-library: [patterns/checklists/backend-libraries.md](../patterns/checklists/backend-libraries.md) — MUST-tier golden checks before a backend library write
- When the authorized backend work touches cookie, header, query, form, JSON body, or device-ID resolution: [patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md](../patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md) — request-value execution contract
- When the authorized work creates or edits SQL: [patterns/sql.md](../patterns/sql.md) — current SQL contract, formatting, and validation carried into execution
- When any golden/sql entry is used as evidence: [patterns/checklists/sql.md](../patterns/checklists/sql.md) — per-entry authority map for the mixed SQL collection
- When a generated API endpoint is added, changed, or consumed: [patterns/gencode-api.md](../patterns/gencode-api.md) — single shared source for the generator, config schema, and no-hand-written-client rules
- When the authorized work touches a stored procedure, table, or persisted data: [db-schema-context.md](../db-schema-context.md) — schema evidence required before data changes
- When the authorized work touches FE/BE URL, domain, redirect, or callback logic: [application-url-matrix.md](../application-url-matrix.md) — authoritative environment-specific execution values
- When a service/job URL, gateway route, Pod-to-Pod call, base path or health endpoint is in scope: [service-url-matrix.md](../service-url-matrix.md) — service gateway keys, Kubernetes Services and health; no DB or IP data
- When the work has two or more units or delegation is considered: [subagents-and-branches.md](../subagents-and-branches.md) — delegation packet, workspace mode, visibility, and integration boundaries
- When material intent remains unresolved: [elicitation.md](../elicitation.md) — resolve only consequential ambiguity
- When database context is needed: [sql-context-readonly.md](../sql-context-readonly.md) — managed read-only metadata and SELECT; never database writes
- When project bootstrap, versioning, branches or release are requested: [release-and-bootstrap.md](../release-and-bootstrap.md) — project-specific adoption and release knowledge
- When the authorized work writes files in a Git repository: [git-workflow.md](../git-workflow.md) — work branch, delivery and next-step card per the team workflow policy
- When the request is a short integration reply (merge, pr, รวม or a card option) for a delivered work branch: [git-workflow.md](../git-workflow.md) — short integration intents and their authorization boundary
- When the project profile is spec-first or hybrid: [spec-driven.md](../spec-driven.md) — development mode, spec locations and spec-first request handling
- When an approved spec carries goals: [goal-planning.md](../goal-planning.md) — readiness from accepted tasks, rolling dispatch per goal

Do not read the router `SKILL.md` during operation execution. If this generated entrypoint is missing or corrupt, stop with `PACKAGE_ENTRYPOINT_MISSING` and ask for package sync/reinstallation; never broaden into the router.
