# Refactor modes

Use one mode for the current scope. Infer and state a safe behavior-preserving mode when the request is clear. Ask only when different plausible choices materially change behavior or scope; do not show a five-mode menu by default.

## `performance-preserve-behavior`

Improve measured performance while preserving externally observable behavior and business results. Require a baseline, target metric, representative data, and regression checks.

## `readability-organization`

Improve clarity, naming, structure, or duplication without changing logic, contracts, output, ordering, or side effects. Avoid broad architectural movement.

## `strict-preserve-logic`

Allow mechanical restructuring only. Preserve conditions, calculation order, transaction behavior, queries, contracts, and error mapping. Prove equivalence with tests or before/after evidence.

For SQL in `readability-organization` or `strict-preserve-logic`, message collection is a companion contract-reconciliation step. It may inventory existing codes and add a missing definition/idempotent insert to the proven project message artifact, but it must not rename codes or change throw sites, conditions, execution order, queries, results, transactions, side effects, or error mapping.

## `strict-allow-logic-change`

Allow intentional logic improvement. Require concern -> conversation -> authorized decision-owner trade-off before editing. Record old behavior, new behavior, compatibility impact, migration/rollback, and the selected unit tests/test cases.

## `targeted-bug-fix`

Change only the logic required to eliminate a proven defect. Capture the failing case first, add regression evidence, and keep unrelated cleanup as a follow-up concern.

## Required refactor brief

For tracked refactors, keep the relevant boundary in the savepoint's decisions; a separate analysis file needs an actual consumer. Light refactors create no task artifact. Use only the relevant fields:

- `mode`
- `objective`
- `behavior_to_preserve`
- `behavior_allowed_to_change`
- `performance_metric` when applicable
- `scope_files`
- `excluded_scope`
- `tests`
- `rollback`
