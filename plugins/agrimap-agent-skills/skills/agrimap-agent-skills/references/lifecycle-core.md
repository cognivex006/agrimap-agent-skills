# Workflow lifecycle core — v3

Check whether this request concerns AgriMap. Quoted commands, cwd, model name and old task state alone do not activate a workflow. A direct answer, explanation, comparison, help or read-only review has no execution state, depth, requester question or task artifacts unless a durable deliverable/tracking was requested.

## Durable work

Before the first repository write run `agm-workspace.mjs context`: read/ack its AGENTS chain, then follow its project mode (spec-driven.md for spec-first/hybrid) and confirmed workflow policy (git-workflow.md). Never write state outside a Git root.

Reuse a conversation/host-confirmed requester via `--requested-by`; missing runtime state does not invalidate confirmation. Otherwise inspect `agm-workspace.mjs requester --cwd <project> --session <id>` read-only. Never infer identity from Git/OS authorship or copied audit history. Reject expired/revoked/foreign/ambiguous records; otherwise ask once. Identity grants no publication authority.

For adopted product repositories before durable work, compare the installed AGENTS.md bootstrap version marker/receipt to the active skill manifest. A missing or different version only warns: run project-bootstrap apply now (auto-merge keeps project lines, with backups) and continue; report a pending file. For release, check branch freshness before bootstrap writes. No product bootstrap in the skill-package root or for ordinary questions.
Follow explicit project recording requirements (bootstrap AGENTS §9) without duplicate lifecycles.
Follow recommendations.md in every operation: proactively give supported advice with gaps, assumptions and confidence. Advice grants no write authority.

Use existing requester authorization; never require a generated prompt merely to repeat approval.
- light: bounded authorized work; concise current/recent memory and milestone audit; no tasks.
- standard: actual resume/handoff/tracking need; the savepoint holds goal, done, remaining, next step and decisions.
- regulated: actual public/data/security boundary, independent assurance or external publication; same task record plus evidence required by that boundary.
Depth follows the work, not model or file count; record its reason. Model instruction profiles outcome/guided/bounded affect scaffolding only.
Use `agm-workspace.mjs start --operation <op> --session <id> --tracking --risk <reason>` where relevant. Read-only calls return started=false unless --persist/--tracking requests durable work. Never create empty task trees. Explicit init alone prepares project knowledge; --bootstrap installs project assets.

## Evidence and completion
Checkpoint changed acceptance, decisions, integration or verification only. Keep submissions in history. Redact history/log/memory via scripts/sensitive-recording.mjs, including manual writes. No raw backups. Keep facts/evidence concise; runtime supplies metadata.
v3 tracked work uses the savepoint (memory-and-logs.md), kept current at milestones and before pausing. Separate analysis/QA/results only when an actual consumer needs them. Legacy five-file executions stay readable under their original contract.
Complete only after actual acceptance and proportional verification; artifact existence or a command exit code alone is not product success. Finalize recent memory and remove the savepoint. Reports are requested deliverables, not mandatory duplicates. Never delete historical prompts/logs as migration.
