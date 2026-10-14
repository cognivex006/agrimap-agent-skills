# Immutable Prompt Results

agm-prompt refines intent into one executable file; it never implements it or creates tasks.
V0 is requester input, no file. Finalizing the first executable prompt creates V1.
Classify follow-ups: explain, compare, propose, acknowledge, revise, approve, execute.
Only a substantive requested revision creates V2+. Explanation, approval and no-op retries do not. Assistant suggestions are proposals until adopted; do not invent scope, architecture or acceptance.

Use scripts/agm-prompt-version.mjs create with --change-summary and --source-evidence for a revision. It rejects revisions without provenance and reuses identical content. Metadata changes alone do not justify a new content version.
Store under .agrimap-agent/prompts/YYYY-MM/<conversation>/<context>-vNNN.md. Preserve the family period and previous immutable files. Explicit source must match the family/latest version; multiple credible families require PROMPT_SOURCE_CONFIRM_REQUIRED. Keep all still-valid requirements; removals need requester evidence.
Record approval against the exact file/hash in audit evidence, without modifying the immutable file or making another version. Execution accepts that recorded approval or explicit current requester authorization.

Each file contains Problem/End State, Evidence, Authorized Inputs, Scope/Non-goals, Constraints, Main Assignment, Subagent Assignments (or None — Main owns all work), Acceptance Criteria, and Deviation and Handoff Contract.
Binding constraints/dependencies/acceptance remain fixed. Suggested implementation steps may adapt to evidence within scope. Use outcome/guided/bounded instructions based on observed capability; names are not rankings.
Generating assignments never dispatches agents. One writer per file/contract when delegation is justified. With two or more units, Main Assignment states the orchestration decision of subagents-and-branches.md (work graph, contract-first order, parallel or sequential, rolling dispatch) and each Subagent Assignment carries its job rules: own worktree and branch from the Leader tip, commit only there, never push/merge/remove it, return format; the Leader verifies, integrates and removes it. Material deviations are surfaced with evidence; routine equivalent choices need no new prompt.
