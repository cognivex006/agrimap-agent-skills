# Security scan workflow (`agm-security scan`, `agm-security patch`)

Read-only security report for an AgriMap product root. Runs only when the requester names `agm-security`; ordinary OWASP or vulnerability requests stay with Golden Lint's `agm-lint` (decision 0001: Golden Lint is read, never edited or replaced from here).

## Run

```text
node <skill>/scripts/security-scan.mjs scan --root <product-root> --format markdown
```

- `--format json` prints the canonical report (`agm-security-report/1`); `markdown` prints the same content for people.
- `--write` is the only option that writes, and only to `<product-root>/.agrimap-agent/reports/security/<timestamp>/report.{json,md}`. Use it when the requester asks to keep the report.
- `AGM_GOLDEN_LINT_DIR` selects a Golden Lint skill directory; otherwise the installed plugin is used.

## Read the result

- **Findings** come from Golden Lint detectors only. Each has a fingerprint built from class + file + symbol (or Golden Lint's content fingerprint), so it survives line moves; compare runs by fingerprint, never by line.
- **Manual review** lists SEC classes with no detector (`sec-coverage.json` `scanner.status=not-implemented`). "No findings" never means these passed: check them by hand against [security-baseline.md](patterns/security-baseline.md).
- **Blocked** lists what could not be checked (Golden Lint missing or failed, files the runner skipped). Outcome `blocked` is reported as blocked, not as a pass.

## Answer (scan)

Report outcome, finding count by class and severity, manual-review classes and blocked items, with the exact command used. `scan` never edits product files, starts a fix or suppresses a finding.

## Patch (explicit, 6.4.0)

`agm-security patch` fixes only the findings the requester selected, never every finding in the report.

1. Plan: `node <skill>/scripts/security-patch.mjs plan --report <scan.json> --select <fp,...> --out <plan.json>`. It refuses an empty selection, unknown fingerprints and a blocked scan.
2. Apply each item by its tier from `sec-coverage.json` `patchTier`, through the lane skill (`agm-be`, `agm-fe`, `agm-sql`) and the surface file's "Write it this way" shape:
   - `AUTO_SAFE` (SEC-07, SEC-29, SEC-30): contract-free; apply in place.
   - `GUARDED`: behavior can change; add a regression test for a valid request (or name why none exists) and keep the response contract of [security-baseline.md](patterns/security-baseline.md#how-to-apply).
   - `MANUAL` (SEC-05, SEC-13, SEC-16, SEC-17, SEC-22, SEC-28): contract change, consumer migration or a human step such as secret rotation; do not edit, report the decision.
3. Rescan with `scan --format json`, then `security-patch.mjs verify --plan <plan.json> --rescan <scan.json> --claimed <fp,...>`.
4. Report verify exactly: `verified` means the fingerprint is gone from a completed rescan; `fixed-unverified` (rescan blocked) and `still-present` are not done; `introduced` lists new findings in patched files. Outcome `verified` only when every editable item is verified and nothing was introduced.
