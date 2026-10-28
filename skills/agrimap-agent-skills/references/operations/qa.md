# Compact operation entrypoint: agm-qa

<!-- Generated from config/operations.json. Do not edit directly. -->

- Operation: `qa`
- Workflow depth: default `light`; allowed `light`, `standard`, `regulated`
- Mode: `verification-only`
- Purpose: Verify an artifact under a product-read-only, execution-restricted QA contract.
- Deliverable: requested result with proportional evidence; no lifecycle for ordinary answers

## Inputs and help

- Required: artifact or target to verify.
- Conditional: task_id for regulated tracked QA; qa_mode=full only when an explicit full-QA trigger applies.
- Minimal example: `$agm-qa qa_mode=light artifact="integrated workspace"`

## Execute this contract

1. Choose sufficient verification from changed behavior and acceptance; reuse matching evidence.
2. Inspect final artifacts; use project-declared local checks after inspecting effects. No routine full-suite reruns, automatic third-run escalation or database writes.
3. Record actual coverage, failures and limitations; never infer success from artifact existence.

## Load now

- [goal-rules.md](../goal-rules.md) — mandatory Think/Simplicity/Surgical/Goal-Driven discipline
- [qa-and-done.md](../qa-and-done.md) — single QA, correction, and completion policy
- [recommendations.md](../recommendations.md) — visible evidence-calibrated recommendations and routine uncertainty disclosure

## Load only when the condition matches

- When the task is FE, BE, or SQL: [patterns/pattern-status.md](../patterns/pattern-status.md) — select exactly the matching pattern and Detect gates
- When target_kind is fe-main or fe-library: [frontend-engineer.md](../frontend-engineer.md) — frontend QA fundamentals
- When target_kind is be-main or be-library: [backend-engineer.md](../backend-engineer.md) — backend QA fundamentals including request-value normalization
- When C#, .csproj or .NET-publishing Dockerfiles are in scope: [patterns/csharp.md](../patterns/csharp.md) — project-wide C# QA baseline
- When BE work reads or refactors cookie, header, query, form, JSON body, or device-ID resolution: [patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md](../patterns/golden/backend-libraries/013-1-extensions-request-value-normalize.md) — request-value QA behavior matrix for main/library code
- When verification touches a stored procedure, SQL, or persisted data: [db-schema-context.md](../db-schema-context.md) — schema facts required to verify data and error behavior
- When FE/BE URL, domain, redirect, or callback logic is under verification: [application-url-matrix.md](../application-url-matrix.md) — authoritative expected URL values
- When material intent remains unresolved: [elicitation.md](../elicitation.md) — resolve only consequential ambiguity
- When you are about to ask the requester a question: [autonomy.md](../autonomy.md) — ask only requester-owned material choices, with a decision card
- When the project profile is spec-first or hybrid and the question concerns specified behavior: [spec-driven.md](../spec-driven.md) — spec items are the source of truth for specified behavior

Do not read the router `SKILL.md` during operation execution. If this generated entrypoint is missing or corrupt, stop with `PACKAGE_ENTRYPOINT_MISSING` and ask for package sync/reinstallation; never broaden into the router.
