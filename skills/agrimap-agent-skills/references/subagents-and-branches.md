# Delegation, workspace, and progress

Load for every plan or execution with two or more units, and whenever delegation is considered. Delegation does not itself select regulated depth. Use one writer per file/contract and Leader integration; sequential work is valid.

## Contents

[Orchestration decision (5.0.1)](#orchestration-decision-501) · [Roles and depth (6.0)](#roles-and-depth-60) · [Leader loop](#leader-loop) · [Worktree lifecycle: ephemeral worktree, durable job context](#worktree-lifecycle-ephemeral-worktree-durable-job-context) · [Packet additions for a job](#packet-additions-for-a-job) · [Dispatch boundary](#dispatch-boundary) · [Workspace contract](#workspace-contract) · [Delegation packet](#delegation-packet) · [Visible progress](#visible-progress) · [Verify every return (6.0)](#verify-every-return-60) · [Handoff and integration](#handoff-and-integration)

## Orchestration decision (5.0.1)

Owner decision 2026-10-14: decide this for every plan or execution with two or more units, not only when delegation was requested, and state it in one line (`Orchestration: sequential` or `Orchestration: N agents — units …`).

1. Work graph: list units with lane/skill, repository, files, `depends_on`, contract produced or consumed (SP signature, DTO/API, component inputs) and acceptance check.
2. Contract first: the Leader fixes every shared contract before any consumer starts.
3. Parallel when files or repositories are disjoint and no unit consumes a contract another unit is still producing; otherwise sequence. Work smaller than a few minutes per unit stays with the Leader.
4. Agents: never ask how many; use up to five, sized to the ready units.
5. Models: `model-capability-matrix.yaml` `subagent_execution` for the host — first entry for mechanical units with a fixed contract and golden pattern, second for normal units, third for units that need design judgement; a host without model choice uses its default. Record the actual model.

## Roles and depth (6.0)

| Role | Does | Writes |
| --- | --- | --- |
| Leader | Talks to the human, triages, fixes contracts, dispatches, integrates, verifies, commits, delivers | yes |
| Explorer | Broad search and reading (callers, helpers, history across repositories); returns a summary | no |
| Analyst | Impact or root cause for one lane | no |
| Worker | One unit in one lane, only the files its packet names | packet files only |
| Verifier | Independent review, QA or security check of finished work; never the unit's author | no |

Use by depth ([delivery-workflow.md](delivery-workflow.md)): light — none; standard — Explorers when the search is wide, Workers rarely; regulated — Explorers/Analysts in parallel per lane, Workers per lane, one Verifier. Broad mechanical work (many repositories or folders) may fan out Explorers at any depth. Subagents never talk to the human, commit outside their worktree, push, merge, release or run anything irreversible.

Workspace (owner decision 2026-11-05, 6.0.1): several people or agents writing at once use worktrees as below; one writer works on the normal work branch. Either way, everything is integrated back before the work closes.

## Leader loop

The Leader dispatches, integrates and verifies evidence; subagents write. Keep a rolling queue: when one agent returns, verify and integrate its job, then dispatch the next ready unit at once while at most five run. Never wait for a whole wave to finish. A unit is ready when everything it depends on is integrated. Keep the Leader savepoint current (done, remaining, next) after each integration. Work broken into goals takes its ready tasks, gates and goal IDs from [goal-planning.md](goal-planning.md).

## Worktree lifecycle: ephemeral worktree, durable job context

- Two or more parallel writers: each gets a job. `branch plan|apply --worktree --slug <s> [--type hotfix] [--into <leader-branch>]` creates `<system temp>/agm-worktrees/<repo>-<hash>/<job-id>` (5.0.10: never inside or beside the project folder) on `feature/<slug>-<id>` from the Leader's integrated tip. One writer keeps the normal work branch without a worktree.
- The subagent commits everything in its worktree; it never pushes, merges or removes the worktree.
- The Leader verifies, then `integrate apply --job <id> --verification passed --evidence "<checks>"`: merge into the Leader branch, audit record, then removal of the worktree and the temporary branch. Merge, rebase and squash are each proven before deletion (`-d` only for proven ancestry).
- A failed gate, a dirty or locked worktree, or a conflict blocks cleanup and keeps everything. Only the owning Leader session removes a job; an interrupted cleanup finishes on the next `integrate` call.
- Rework is a new job: `--parent-job <id>` with a fresh worktree from the latest integrated tip. A worktree is never reused.
- Host-created worktrees (Claude `isolation: worktree`, Codex managed worktrees) follow the same rule: the Leader integrates them back into the main project branch and then removes them and their temp folder; never leave integrated worktrees behind.

## Packet additions for a job

Job id, worktree path, branch, base SHA, contract reference, the rules above for the subagent, and the return format below. `agm-prompt` Subagent Assignments carry the same lines.

## Dispatch boundary

- Delegate only bounded units with distinct ownership; use at most five active agents.
- Keep one writer per file and logical contract at a time. Sequence overlap.
- The Leader owns integration, conflict resolution, verification dispatch, and synthesis. Neither the requester nor decision owner is responsible for collecting or merging agent fragments.
- For QA delegation, import [qa-and-done.md](qa-and-done.md) as the single policy source; do not restate its write/status/correction rules here.

## Workspace contract

Every packet defines `workspace_need`: isolation, requested mode, `base_ref`, exact base commit, provider instruction, visibility check, integration return, and fallback mode.

| Mode | Use | Integration return |
| --- | --- | --- |
| shared workspace | bounded non-overlapping writers or sequential work | changed file set |
| worktree | parallel writers: `branch apply --worktree` job, or a host worktree the provider proves | visible commit SHA; Leader integrates and removes it |
| isolated-sandbox | filesystem is isolated without a shared Git ref | portable patch or changed artifacts |
| unknown | do not parallelize writers until visibility is proven | sequential handoff |

- Claude custom agents may use `isolation: worktree` when the installed version supports it.
- A normal subagent starts in the current working directory unless the provider proves isolation.
- Codex managed worktrees are surface-dependent; never infer them from agent creation alone.
- Worktree location (5.0.10, owner decision 2026-11-01): every worktree lives under `%TEMP%`/`$TMPDIR`, never in the project folder or next to it. A host worktree that would be created inside the checkout (for example Claude `isolation: worktree` under `.claude/worktrees`) is not used; use `branch apply --worktree` instead.
- If required uncommitted parent state is absent from the base commit, use shared/sequential work or obtain an authorized commit boundary.
- A host-created worktree branch follows the policy's `hostWorktreeBranch` (default: keep the local name, push under the team name).
- Subagents never deliver or integrate; the Leader does.
- Agent helper files (PR bodies, scripts, checkpoint copies) go in the scratchpad or `%TEMP%` and are deleted on delivery.

## Delegation packet

Include only task-local data:

- task/objective/non-goals and inherited authority when tracked;
- display label, actual model identity, bounded output, and provider-native inspection path;
- exact files/symbols, ownership, forbidden files, required reference excerpts, constraints, verification, and handoff format;
- workspace contract and integration artifact;
- ordered steps only when the executor needs them.

Do not tell a subagent to load the umbrella or an entire reference tree.

## Visible progress

Current Codex surfaces expose native agent activity: app thread, CLI `/agent`, and IDE background-agent panel. Announce each label/task/output/inspection path before spawn. Continue safe Leader work; when only waiting, inspect and report `running|completed|blocked` at least every 60 seconds. Never emit an unexplained multi-minute wait.

Native activity is the detailed trace. Only when the active surface genuinely lacks it, declare `.agrimap-agent/runtime/progress/<task-id>.jsonl` as fallback. Write `started`, meaningful phase/status transitions, and `finished|blocked`; do not write per step, tool call, read, or unchanged poll. Optional unchanged liveness is capped at once per five minutes.

Official Codex behavior: [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).

## Verify every return (6.0)

A returned `done` is testimony. Before integrating, the Leader checks:

1. Scope: `git diff --name-only` against the packet's writable files; drop anything outside it.
2. Results: the Leader runs lint/build/tests itself after integration.
3. Rules: the self-gate of the [invariant floor](delivery-workflow.md#invariant-floor) on the combined diff.
4. Contracts: DTO, route and SP signature diffs are empty or match what was approved.

A failed check goes back to the same agent once, with the actual output. After that the Leader fixes it or re-plans; never loop. A unit that turns out to need a contract change stops and escalates.

## Handoff and integration

Return status, summary, execution identity, display/thread/progress channel, files/symbols, behavior, decisions, commands/results, risks, memory facts, workspace mode, and integration artifact. A `done` status is testimony only.

The Leader verifies visibility and ownership before integration, integrates once, resolves conflicts without overwriting unrelated work, and then follows the selected workflow depth's completion contract.
