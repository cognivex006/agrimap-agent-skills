# Compact operation entrypoint: agm-security

<!-- Generated from config/operations.json. Do not edit directly. -->

- Operation: `security`
- Workflow depth: default `light`; allowed `light`, `standard`, `regulated`
- Mode: `product-read-only`
- Purpose: Run a read-only security scan of an AgriMap product root over Golden Lint with stable fingerprints, manual-review and blocked lists.
- Deliverable: security report (agm-security-report/1) printed, or written under .agrimap-agent/reports/security only with --write; never a fix

Runs only when the requester names agm-security. scan is read-only: no product edits, fixes, suppressions, lifecycle or identity question. Golden Lint is the only detector and is never edited. Use security-scan-workflow.md.

## Inputs and help

- Required: product root (default: the current project).
- Conditional: --write when the requester asks to keep the report; --format json for automation.
- Minimal example: `-security root=services/agmws-orders`

## Execute this contract

1. Resolve the product root from the request or the current project. Run scripts/security-scan.mjs scan --root <root> --format markdown; add --write only when the requester asks to keep the report.
2. Report outcome, findings by class and severity with fingerprints, manual-review classes and blocked items exactly as printed. No findings never means the manual-review classes passed; blocked is never a pass.
3. Do not edit product files or start a fix; name the lane skill for a fix the requester selects.

## Load now

- [security-scan-workflow.md](../security-scan-workflow.md) — command, options, report reading and answer contract
- [patterns/security-baseline.md](../patterns/security-baseline.md) — SEC class definitions for manual review
- [goal-rules.md](../goal-rules.md) — bounded, read-only scope
- [recommendations.md](../recommendations.md) — evidence-calibrated advice when naming a fix

## Load only when the condition matches

- No additional conditional reference by default; select one target pattern only when lifecycle-core routing requires it.

Do not read the router `SKILL.md` during operation execution. If this generated entrypoint is missing or corrupt, stop with `PACKAGE_ENTRYPOINT_MISSING` and ask for package sync/reinstallation; never broaden into the router.
