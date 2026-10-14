# Release timing and complete audit publication

All nine actions include timing, also --flash. Bootstrap timing grants no publication authority. Help/examples start no timer.

## Two durations

Before requester lookup, run `node <bundle>/scripts/release-timing.mjs <action> <state.json> [label]`. Use one absolute ignored path under `.agrimap-agent/runtime/release-timing/` per invocation; verify ignore status or use external host-local storage. No identity/task is needed. Never stage timers. Serialize these bundled helper verbs (not .NET options):

| Action and label | Boundary |
| --- | --- |
| `start readiness` | Start once; existing state is rejected |
| `step <label>` | Close previous interval, start named work |
| `wait requester` / `wait confirmation` | Before asking/yielding for human input; also label other human waits |
| `step <label>` | Resume on actual answer processing; matching approval creates no wait |
| `pause interrupted` | Stop active measurement for unattended/unknown gaps |
| `finish` | After final audit push, remote verification and worktree check; local actions after local verification |
| `report` | Read-only totals and copy-ready `finalOutput`; pending confirmation remains unfinished |
| `output` | After `finish`; open timeline: IN-PROGRESS, exit 0 |
| `unavailable <reason>` | Print UNKNOWN fields with the actual missing-measurement reason |

Name actual steps: readiness, preflight, gather, indexing, hash, changelog, preparation, verification, commit-push-inhouse, commit-push-production, tag, final-audit. Split separately reported work. Tools, builds, network and retries count as active; concurrent work counts once. While awaiting answers, measure ongoing independent work; waiting starts when work stops. Reused checkpoints count only recheck time.

**Elapsed** = start to finish; **Active** = non-overlapping measured work. Elapsed = Active + human Waiting + Unmeasured. Sum milliseconds before rounding. Resume the same timeline; pause known interruptions. Late collection/crashes require partial/unknown disclosure, never fabricated boundaries or uncorrected totals. This measures execution wall time, not CPU time.

## No leftover release history

Publishing includes reviewed release-owned history/audit within existing commit/push authority; target silence needs no approval. Honor explicit exclusions. Local indexing/prepare gain no commit authority.

1. **R inventory:** inspect staged/unstaged/untracked/deleted paths, local develop commits ahead of origin/develop and work branches not yet in develop (`integrate pending`, gathered in M), including logs, memory and requested reports. Tracked agent recording from this or earlier conversations is release-owned by default; exclude only ignored/runtime state, secrets or requester exclusions. Never stage local prompt history; F runs `git rm --cached -r -- .agrimap-agent/prompts` if tracked. Other pending product work goes through the pending-work gate below. For mixed files, stage only reviewed attributable hunks or report the unresolved boundary.
2. **D candidate:** flush eligible recording, refresh status/diff, stage exact reviewed paths/hunks and inspect staged diff. Include eligible existing history. Never blanket-stage (`git add .`/`git add -A`), force-add ignored state or omit history merely because it is not source code.
3. **F final audit:** after confirmation/publication, inventory again because capture hooks may append history after D. Flush completion recording; batch remaining eligible history/log/index/report into one local develop-only audit commit. Push develop once and verify finalDevelopSha so develop ends clean and equal to origin (a develop pipeline may run once); carry only on explicit requester exclusion. Preserve releaseCandidateSha/tag: never promote audit to jenkins/jenkins-release, retag, amend candidate or bump. Inhouse also performs F.
4. **Final status:** verify tracked and untracked leftovers. Reconcile late eligible hook writes in the same authorized finalization; persistent writers mean pending, not an endless loop. Report unrelated/ignored/restricted exclusions with reasons. Any unpushed develop commit is a leftover unless the requester excluded it (`carried-forward`). Failed audit push resumes F only; failed tag resumes tag then F.
5. **Avoid audit loops:** tracked audit stores known release checkpoints and a timing snapshot labelled through pre-audit publication. Put final audit SHA and finished timing in terminal/ignored state after verification; do not append tracked records just to embed their own commit SHA/duration. Flush target-required completion records before final staging.

**Pending-work gate (R, before H/P).** Publishing commands include all pending work without asking, as in group B (AGENTS.release.md §6.3): non-run dirty paths and develop commits ahead of origin become a content commit before the version commit under §6.3 review. Leave work local only on explicit requester exclusion. Always exclude and list secrets, ignored state and nested repos.

Also report candidate/final develop SHAs, audit status, exclusions/reasons and remaining_steps. Retain restricted artifacts locally.

## Mandatory user-visible delivery

Every final release answer, including --flash, local-only, failed/blocked runs, MUST contain the timing block itself, not a file/tool reference. After final verification run `node <bundle>/scripts/release-timing.mjs output <state.json>` and include its text: Elapsed, Active, Waiting, per-step minutes/seconds. Preserve PARTIAL/Unmeasured; IN-PROGRESS only if paused; labels may be translated.

For absent/invalid/unreliable measurements, run `node <bundle>/scripts/release-timing.mjs unavailable "<reason>"`; include UNKNOWN fields and the reason. Never guess, substitute zero or repeat release to recover timing.

Flush lifecycle records before audit staging; finish timing after audit verification, then render without tracked writes. Check the final answer contains the block. All models comply; flash brevity cannot omit it.
