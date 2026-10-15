# Front-end Engineer

## สารบัญ

- [Required classification](#required-classification)
- [Target detection](#target-detection--resolve-from-repo-evidence-before-asking)
- [Structure over logic](#structure-over-logic-owner-stance-2026-07-16)
- [Design source of trust](#design-source-of-trust)
- [Reuse-first decision](#reuse-first-decision)
- [Core-first for multi-screen work](#core-first-for-multi-screen-work)
- [Reuse index](#reuse-index)
- [Phase 1: foundation](#phase-1-foundation)
- [Phase 2: active-development](#phase-2-active-development)
- [Phase 3: stabilization](#phase-3-stabilization)

Frontend code is usually broad rather than algorithmically difficult. Control technical debt by making reuse visible, keeping project patterns searchable, and changing the quality emphasis by delivery phase.

This embedded supporting discipline is not a standalone workflow/alias. Apply it to every `fe-main` or `fe-library` analysis, design, architecture, feature, refactor, review, test, QA, and prompt. It supports the selected read or authorized write action without choosing it or creating write intent.

**Every role carries the FE fundamentals.** No role — Leader, analyst, executor, reviewer, QA, or prompt generator — may act on FE scope without the agm-frontend fundamentals: the target detection result and selected golden collection, the Facade + Signal structure rules for `fe-main` (or service-first + public-API rules for `fe-library`), and the generated-API boundary ([patterns/gencode-api.md](patterns/gencode-api.md)). When work is delegated, the handoff prompt must inline these fundamentals (detection result, collection name, and the specific structural rules in scope) so the subagent holds them without re-reading the whole reference tree; a subagent that received an FE assignment without them must request the corrected handoff instead of improvising.

## Required classification

Record:

- `target_kind`: `fe-main` or `fe-library`;
- `phase`: `foundation`, `active-development`, or `stabilization`;
- `reuse_scope`: `core`, `shared`, `library`, `feature`, or `generated`;
- affected flows and consuming teams;
- project/company standards and local exceptions.

## Target detection — resolve from repo evidence before asking

Detect `target_kind` from the workspace and declare the result as `INFERENCE` with its evidence in the receipt. Ask the owner only when the signals conflict or are absent — do not ask when the repository already answers.

| Signal (check in this order) | Conclusion | Knowledge collection |
| --- | --- | --- |
| `projects/<lib>/` layout with `ng-package.json` + `src/public-api.ts`, packaged `@agrimap/*` names, a `playground` project | `fe-library` | `golden/frontend-libraries/` |
| Single app under `src/app/` with `core/ domain/ features/ generated-apis/ shared/`, app-level `angular.json`, consumes `@agrimap/*` from npm | `fe-main` | `golden/frontend-main/` |

The two collections carry different conventions (naming, facade usage, test style) — loading the wrong one produces confidently wrong output, so the detection result and the selected collection must both appear in the receipt `Patterns:` line. A file inside `projects/<lib>/` is library-lane even when the task started from an application symptom; crossing lanes (editing a library to fix an app task) is a blast-radius decision that requires the library workflow, not a silent edit.

## Structure over logic (owner stance, 2026-07-16)

The strict contract is **structure**: the Facade + Signal architecture and CODING-STANDARD rules for `fe-main` (R1–R5, layer boundaries, naming, signal primitives, generated-API boundary), and the public-API/naming/entry conventions for `fe-library`. Internal logic *within* a correctly structured layer is where the model applies its own intelligence — implement it with best engineering judgment, and do not demand a golden example, block, or escalate for every internal implementation decision. Escalate only when a choice changes a public contract, data behavior, or ownership boundary. A structurally correct feature with model-authored internal logic is the expected outcome, not a compromise.

The stance is checkable: [patterns/checklists/README.md](patterns/checklists/README.md) defines `MUST`, `SHOULD`, and `FREE`, and the target kind's checklist assigns each row. Structure is `MUST`, verified against the opened entry; internal logic is `FREE` and never a reason to block or ask.

## Design source of trust

For any visual or design-affecting work, resolve design truth in this order and record which level was used:

1. `.agrimap-agent/knowledge/references/design/`: owner-provided design tokens, brand identity, and UI guidelines. Load the relevant files as `FACT`.
2. Design tokens, themes, and style layers already present in the codebase.
3. Neither exists: continue with observed project patterns, state `design reference missing` in the receipt, and record `missing-owner-example` per [pattern-status.md](patterns/pattern-status.md). Do not block on the gap, and do not silently invent a new visual language.

Ask the owner only when the task itself depends on an absent reference, such as "apply the new brand" with no brand material supplied. Never restyle against loaded tokens or identity without an owner decision. External design/creator skills may supply craft, but this workflow's receipts, evidence, memory, and QA remain authoritative, and the project's tokens/identity stay the visual source of trust.

## Reuse-first decision

Before creating reusable code:

1. Search `.agrimap-agent/knowledge/frontend-reuse.jsonl` by name, capability, tags, input/output, and scope.
2. Search the codebase for selectors, exported symbols, services, tokens, configs, pipes, directives, utilities, and similar behavior.
3. Inspect candidates and their consumers; an index hit is not proof of suitability.
4. Choose in this order:
   - exact reuse;
   - configure or safely extend an existing artifact;
   - compose existing artifacts;
   - generalize an existing artifact when at least two proven consumers need the same contract;
   - create a new local artifact with explicit ownership and scope.
5. Avoid forced reuse that creates boolean-option explosions, hidden coupling, or an abstraction with only a hypothetical future consumer.
6. Record the decision and update the index.

## Core-first for multi-screen work

Owner decision 2026-10-14: shared parts first, then screens that compose them.

1. Before two or more screens (or one beside similar ones), list their parts: table/filter/paging, form sections, dialogs, badges, states, actions, facade/store shape.
2. A part in two or more screens (requested or existing) is built or extended first in `shared/` (`core/` for services; the library in `fe-library`); screens compose it; single-use parts stay in the feature.
3. Change shared look or behavior once there; report copies across screens with a consolidation proposal.
4. Current-request screens count as proven consumers; unrequested options stay forbidden.

## Reuse index

Maintain `.agrimap-agent/knowledge/frontend-reuse.jsonl` as the deterministic source for search and future vectorization. One JSON object per artifact:

```json
{
  "id": "component:src/app/shared/components/data-table/data-table.component.ts#DataTableComponent",
  "name": "DataTableComponent",
  "kind": "component",
  "file": "src/app/shared/components/data-table/data-table.component.ts",
  "symbol": "DataTableComponent",
  "selector": "agm-data-table",
  "scope": "shared",
  "capabilities": ["tabular data", "pagination", "row actions"],
  "inputs": ["columns", "rows"],
  "outputs": ["rowSelected"],
  "consumers": ["feature-a"],
  "tags": ["table", "list"],
  "status": "verified",
  "hash": "sha256",
  "vectorReadyText": "searchable normalized description",
  "updatedAt": "ISO-8601",
  "updatedBy": "requester"
}
```

Use `scripts/frontend-reuse-index.mjs` to scan, search, upsert, deprecate, and validate. Scanner entries use `status=discovered`; a human or Leader must inspect them before promotion to `verified`. Deprecate moved/retired entries with an optional replacement ID; ordinary search excludes them while history remains auditable. Do not add an embedding service in v1. `vectorReadyText` keeps the catalog ready for a future company vector store without making that dependency mandatory.

## Phase 1: `foundation`

Focus on a stable development runway:

- project and folder structure;
- design tokens, themes, style layers, and naming;
- environment/configuration and generated API toolchain;
- lint, format, typecheck, tests, build, and local development infrastructure;
- Core/CodeBase/SharedComponent boundaries and public exports;
- initial reusable functions, services, components, directives, and pipes;
- initial reuse index and ownership.

Avoid building feature-specific abstractions into Core/Shared before real use cases prove them.

Foundation gate:

- architecture and token decisions recorded;
- toolchain commands reproducible;
- generated boundaries clear;
- reusable public surfaces documented and indexed;
- one representative feature/library path proves the structure.

## Phase 2: `active-development`

Assume two or more developers are creating divergence and hidden debt. For every task:

- refresh/search the reuse index before implementation;
- compare with company and project patterns;
- inspect neighboring features and recent changes;
- keep facade/store/service/component boundaries consistent;
- detect duplicated utilities/components, one-off styling, token bypass, generated-code edits, silent contract drift, missing tests, and unreported breakage;
- make executor prompts explicit enough for mixed skill levels;
- update index, examples, and concise knowledge immediately;
- record debt as bounded follow-up work rather than spreading a cleanup refactor across the current feature.

Active-development gate:

- no unexplained new reusable artifact;
- reuse decision recorded;
- public and cross-feature impacts reviewed;
- typecheck/lint/tests/build proportional to the change;
- changed reusable items and consumers indexed.

## Phase 3: `stabilization`

Prioritize flow continuity and release confidence:

- verify end-to-end critical flows and affected regression paths;
- close bugs and incomplete loading/error/empty states;
- remove proven dead code and duplicated paths only with evidence;
- run existing project/platform security and deployment checks without creating a new security policy;
- review accessibility, performance, bundle impact, tokens/styles, and public API stability when relevant;
- refactor high-risk debt only when tests and schedule allow it;
- require owner trade-off for broad or logic-changing cleanup near release.

Stabilization gate:

- critical flows and deployment build verified;
- blocker/high-risk debt resolved or explicitly accepted;
- reuse index and consumer links current;
- no unchecked cleanup hidden inside a bug-fix task;
- remaining debt is prioritized with impact and owner decision.

For a release evaluation after changing this frontend discipline or its golden guidance, run [fe-scenarios.md](evals/fe-scenarios.md). Do not load the eval catalog during ordinary frontend work.
