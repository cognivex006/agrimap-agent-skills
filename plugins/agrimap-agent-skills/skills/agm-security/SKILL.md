---
name: agm-security
description: Scan an AgriMap product root for security findings over Golden Lint (read-only), or patch only the findings the requester selected with tiered fixes and a rescan gate. Use for agm-security scan only when named explicitly; OWASP or vulnerability requests without the name stay with Golden Lint agm-lint. AgriMap targets only; quoted examples are not requests.
---

Resolve current intent and target relevance before any identity or lifecycle. Ordinary questions create no execution or task artifacts. Run only security.

Runs only when the requester names agm-security. No action means scan, which is read-only. patch is explicit, edits only the selected findings that are not MANUAL, and never treats a fix as verified without a completed rescan. Golden Lint is the only detector and is never edited. Use security-scan-workflow.md.

Read ../agrimap-agent-skills/references/lifecycle-core.md and ../agrimap-agent-skills/references/operations/security.md, then only the required and matching conditional references. Respect host/user authority and the selected action. Missing required contracts: PACKAGE_ENTRYPOINT_MISSING.
