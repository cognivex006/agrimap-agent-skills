# Compact operation entrypoint: agm-release

<!-- Generated from config/operations.json. Do not edit directly. -->

- Operation: `release`
- Workflow depth: default `light`; allowed `light`, `standard`, `regulated`
- Mode: `product-write`
- Purpose: Upgrade project bootstrap while preserving custom rules, replace contracts explicitly, index projects, prepare versions, publish Inhouse pipelines and promote Production.
- Deliverable: verified checkpoints for the selected release command; only a version or candidate anomaly is asked

Select bootstrap upgrade (preserve custom rules), legacy upgrade (replacement with backup), or nine release actions. Bootstrap ends locally without release CLI/publication. Indexing includes reachable-history Backfill, changelog, project.md and README/API inventory; reuse coverage. Stay in the requested directory; never clone/worktree. Before writes, fetch/check develop/jenkins/jenkins-release and safely pull behind-only branches --ff-only. Review dirty ownership; merge finished branches first (M); publishing includes all pending work and ends with develop clean. Explicit owner Version/Patch overrides PATCH+1 and older default prohibitions; verify baselines, never repeat version approval or require governance migration. Read bundled policy before claiming blockers; release-tools.md covers unsupported CLIs. Verify bootstrap freshness. Preserve host restrictions and actual collisions; ask only anomalies. Before requester lookup, follow release-timing.md: measure work/waits, fold eligible history into one push per ref, show timing in final answers, even --flash.

## Inputs and help

- Required: target repository and one explicit release command.
- Conditional: an answer only for a version or candidate anomaly.
- Minimal example: `$agm-release release production`

## Execute this contract

1. Explicit --flash: follow release-flash.md for aliases, delta-only scope and supported actions.
2. Resolve bootstrap upgrade (preserve project customizations), explicit upgrade (local contract replacement with backup), indexing, prepare inhouse|production, pipeline inhouse|production, promote, or release full|production|inhouse using release-workflow.md. These are Agent commands, not CLI subcommands. Quoted examples and help never authorize release. Use an explicit owner Version/Patch target before the PATCH+1 default; follow release-workflow.md and release-tools.md for revised candidates and PATCH-only CLI fallback without repeated version approval.
3. For bootstrap upgrade or legacy upgrade, use only the selected local bootstrap procedure and verification, then finish. For the nine release actions: Check tools and target bootstrap prerequisites before audit; install missing tools and apply compatible missing bootstrap files within the selected command using release-and-bootstrap.md. Resolve existing-file conflicts through a concrete adoption decision when needed. Continue the same invocation after repair; resume recorded candidates without bumping again.
4. The owner command confirms every publication step its row lists (jenkins-release, Production tag, notify); show the plan and continue. Ask once only for a version anomaly (R) or candidate anomaly (C) per release-workflow.md.
5. For the nine release actions, read release-steps.md and release-tools.md before execution. Production alone owns versioned notes, release.md and tags. Standalone pipeline/promote never invent missing preparation; enforce exact owner diffs and stage-specific completion.

## Load now

- [release-workflow.md](../release-workflow.md) — command semantics, tool readiness, publication boundary, confirmation and recovery
- [goal-rules.md](../goal-rules.md) — scope and proportional verification
- [recommendations.md](../recommendations.md) — evidence-calibrated communication

## Load only when the condition matches

- When executable release action (including --flash), before requester lookup; optional for bootstrap-only timing: [release-timing.md](../release-timing.md) — start timing before requester lookup and finish eligible history publication
- When --flash is explicit: [release-flash.md](../release-flash.md) — delta-only release
- When release production|full or promote: [release-notify.md](../release-notify.md) — Release Description and notify
- When bootstrap upgrade or legacy upgrade is selected: [release-bootstrap-upgrade.md](../release-bootstrap-upgrade.md) — local preserving upgrade and explicit replacement procedures
- When one of the nine release actions (with --flash only for recovery or conflicts): [release-steps.md](../release-steps.md) — mandatory exact nine-command sequences and Production artifact ownership
- When a release action without --flash, or flash tool evidence is missing, stale or incompatible: [release-tools.md](../release-tools.md) — mandatory .NET tool discovery and proven CLI compatibility before writes

Do not read the router `SKILL.md` during operation execution. If this generated entrypoint is missing or corrupt, stop with `PACKAGE_ENTRYPOINT_MISSING` and ask for package sync/reinstallation; never broaden into the router.
