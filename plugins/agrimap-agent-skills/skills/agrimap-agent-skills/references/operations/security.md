# Compact operation entrypoint: agm-security

<!-- Generated from config/operations.json. Do not edit directly. -->

- Operation: `security`
- Workflow depth: default `light`; allowed `light`, `standard`, `regulated`
- Mode: `action-routed`
- Purpose: Scan an AgriMap product root for security findings over Golden Lint (read-only), or patch only the findings the requester selected with tiered fixes and a rescan gate.
- Deliverable: scan: security report (agm-security-report/1); patch: selected fixes through the lane skill plus a verify result where only a completed rescan marks a fix verified

Runs only when the requester names agm-security. No action means scan, which is read-only. patch is explicit, edits only the selected findings that are not MANUAL, and never treats a fix as verified without a completed rescan. Golden Lint is the only detector and is never edited. Use security-scan-workflow.md.

## Action gate

Resolve exactly one action before target inspection or product writes. Safe defaults are read-only; fallback is action routing, not a passive capability. Capabilities support the chosen read or authorized write but cannot choose it or create write intent.

| Action | Mode | Activation | Allowed depth | Purpose |
| --- | --- | --- | --- | --- |
| `scan` | `product-read-only` | `explicit-or-safe-default` | `light`, `standard`, `regulated` | Report Golden Lint security findings with stable fingerprints, plus manual-review classes and blocked checks |
| `patch` | `product-write` | `explicit` | `light`, `standard`, `regulated` | Fix only requester-selected findings by tier (AUTO_SAFE, GUARDED with a regression test, MANUAL reported only) and verify by rescan |

## Inputs and help

- Required: product root (default: the current project).
- Conditional: --write to keep a scan report; patch needs the scan report and the fingerprints the requester selected.
- Minimal example: `-security scan`

## Execute this contract

1. Resolve scan (default) or explicit patch and the product root. Run scripts/security-scan.mjs scan --root <root> --format markdown; add --write only when the requester asks to keep the report.
2. For patch, require the scan report and the fingerprints the requester selected; run scripts/security-patch.mjs plan, apply each AUTO_SAFE or GUARDED item through the lane skill (GUARDED with a regression test), report MANUAL items as decisions, then rescan and run security-patch.mjs verify.
3. Report exactly what verify printed: verified, still-present, fixed-unverified, manual-decision and any finding introduced in a patched file. Never call a claimed fix verified without a completed rescan.

## Load now

- [security-scan-workflow.md](../security-scan-workflow.md) — command, options, report reading and answer contract
- [patterns/security-baseline.md](../patterns/security-baseline.md) — SEC class definitions for manual review
- [goal-rules.md](../goal-rules.md) — bounded, read-only scope
- [recommendations.md](../recommendations.md) — evidence-calibrated advice when naming a fix

## Load only when the condition matches

- No additional conditional reference by default; select one target pattern only when lifecycle-core routing requires it.

Do not read the router `SKILL.md` during operation execution. If this generated entrypoint is missing or corrupt, stop with `PACKAGE_ENTRYPOINT_MISSING` and ask for package sync/reinstallation; never broaden into the router.
