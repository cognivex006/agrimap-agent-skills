# Compact operation entrypoint: agm-fe

<!-- Generated from config/operations.json. Do not edit directly. -->

- Operation: `fe`
- Workflow depth: default `light`; allowed `light`, `standard`, `regulated`
- Mode: `action-routed`
- Purpose: Analyze, design, create, edit, refactor, or explicitly test AgriMap Angular frontend work (agmwa-* apps, @agrimap/* libraries) in golden structure through one domain façade.
- Deliverable: requested result with proportional evidence; no lifecycle for ordinary answers

## Action gate

Resolve exactly one action before target inspection or product writes. Safe defaults are read-only; fallback is action routing, not a passive capability. Capabilities support the chosen read or authorized write but cannot choose it or create write intent.

| Action | Mode | Activation | Allowed depth | Purpose |
| --- | --- | --- | --- | --- |
| `analyze` | `product-read-only` | `explicit-or-safe-default` | `light`, `standard`, `regulated` | Inspect frontend scope, behavior, callers, risks, and trade-offs without editing |
| `design` | `product-read-only` | `explicit-or-safe-default` | `light`, `standard`, `regulated` | Define frontend flow, states, accessibility, validation, and acceptance without editing |
| `create` | `product-write` | `explicit` | `light`, `standard`, `regulated` | Create a bounded new frontend slice |
| `edit` | `product-write` | `explicit` | `light`, `standard`, `regulated` | Modify a bounded existing frontend slice |
| `refactor` | `product-write` | `explicit` | `light`, `standard`, `regulated` | Refactor frontend code under exactly one behavior mode and a proven preservation boundary |
| `test` | `product-write` | `explicit` | `light`, `standard`, `regulated` | Create explicitly requested or selected frontend tests after embedded test-decision advice |

## Inputs and help

- Required: one action or unambiguous natural-language intent; an objective or pointed frontend target.
- Conditional: phase and target_kind when repository evidence cannot resolve them; requester selection when embedded test-decision advice finds unspecified coverage.
- Minimal example: `$agm-fe action=edit target_files=src/order.component.ts objective="Handle the empty state"`

## Execute this contract

1. Resolve exactly one action before inspection. Explicit action= wins; otherwise infer only from unambiguous verbs and report the resolved action. Ask one short question when create, edit, refactor, or read versus write remains ambiguous.
2. For analyze/design, never edit product files. For authorized create/edit/test, choose depth from tracking and boundary needs; no extra prompt ceremony.
3. For action=refactor, require exactly one mode before editing, preserve the declared logic boundary, and ask only about unresolved material behavior choices.
4. Apply the embedded test-decision capability during analyze, design, create, edit, and refactor. Classify required, recommended, or not_applicable; write tests only for action=test, a clear test request, or required coverage inside authorized implementation.
5. Before writing, open the relevant patterns/sonarqube/ file and checklist Sonar self-check; draft to pass, re-check written files.

## Load now

- [goal-rules.md](../goal-rules.md) — mandatory Think/Simplicity/Surgical/Goal-Driven discipline
- [passive-capabilities.md](../passive-capabilities.md) — embedded design/test-decision boundaries
- [frontend-engineer.md](../frontend-engineer.md) — frontend phase discipline
- [patterns/frontend.md](../patterns/frontend.md) — current frontend contract
- [recommendations.md](../recommendations.md) — visible evidence-calibrated recommendations and routine uncertainty disclosure

## Load only when the condition matches

- When action=refactor: [refactor-modes.md](../refactor-modes.md) — exact refactor behavior and logic-change boundary
- When target_kind=fe-main: [patterns/checklists/frontend-main.md](../patterns/checklists/frontend-main.md) — MUST-tier golden structure, typing, and naming checks for the application workspace
- When target_kind=fe-library: [patterns/checklists/frontend-libraries.md](../patterns/checklists/frontend-libraries.md) — MUST-tier public-API, naming, and service-first checks for the @agrimap/* workspace
- When a generated API endpoint is added, changed, or consumed: [patterns/gencode-api.md](../patterns/gencode-api.md) — single shared source for the generator, config schema, and no-hand-written-client rules
- When URL, domain, redirect, or callback logic is in scope: [application-url-matrix.md](../application-url-matrix.md) — authoritative environment-specific URL values
- When material intent remains unresolved: [elicitation.md](../elicitation.md) — resolve only consequential ambiguity
- When project bootstrap, versioning, branches or release are requested: [release-and-bootstrap.md](../release-and-bootstrap.md) — project-specific adoption and release knowledge
- When an action writes files or a requester decision is needed: [autonomy.md](../autonomy.md) — decide, ask or confirm; decision card format
- When the action writes product files in a Git repository: [git-workflow.md](../git-workflow.md) — work branch, delivery and next-step card per the team workflow policy
- When the project profile is spec-first or hybrid: [spec-driven.md](../spec-driven.md) — development mode, spec locations and spec-first request handling

Do not read the router `SKILL.md` during operation execution. If this generated entrypoint is missing or corrupt, stop with `PACKAGE_ENTRYPOINT_MISSING` and ask for package sync/reinstallation; never broaden into the router.
