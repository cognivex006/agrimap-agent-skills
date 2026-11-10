# Security scan workflow (`agm-security scan`)

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

## Answer

Report outcome, finding count by class and severity, manual-review classes and blocked items, with the exact command used. Do not edit product files, open a fix or suppress a finding from this operation; fixes go through the lane skill (`agm-be`, `agm-fe`, `agm-sql`) on the requester's selection.
