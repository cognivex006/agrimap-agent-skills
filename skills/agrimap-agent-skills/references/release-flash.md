# Delta-only release (--flash)

Agent-chat modifier, not an executable or .NET CLI option. Accept it on `release full|inhouse|production`, `prepare inhouse|production` and `pipeline inhouse|production`; normalize `full --flash`, `inhouse --flash`, `production --flash` to the `release` commands. The bare flag may precede or follow the command words. Reject valued/duplicate flags, unknown options and --flash on indexing/promote/bootstrap before writes; `--silent` combines per release-notify.md. Without --flash, existing command semantics are unchanged. Quoted examples authorize nothing.

## Scope override

Flash is for a routine release that finishes in about five active minutes when nothing needs a decision. It keeps the command expansion and owner/publication boundaries of release-steps.md but replaces I with the delta review below; with prepare/pipeline it narrows the stale-index prerequisite and V/D review to that delta, and pipeline still never creates a missing candidate. H/P reconcile only delta changelog/notes. This explicit mode replaces this package's full Backfill, historical catalog and README capability inventory for this invocation; it does not mark project-wide indexing complete, rewrite target instructions or override higher-priority restrictions.

Read this file, release-timing.md, release-notify.md for Production, the target AGENTS.md and only §2.3, §5.2, §6, §7 and §8.2 of the target AGENTS.release.md. Open release-steps.md, release-tools.md or other sections only for a recovery, a real conflict, a missing or incompatible tool, or a bootstrap install.

## Fast path

1. Start the timer, then run `agm-workspace.mjs release preflight` once. It fetches and reports the three branch pairs, both owner pairs, the latest tag, dirty paths, finished work branches (M) and the `autoActions`, `questions` and `blockers`. Do not repeat these checks command by command. Check bootstrap freshness from its receipt now; apply a compatible update now or not at all during this run.
2. Perform preflight `resolve` steps yourself (merge, resolve conflicts, test, commit) without asking. The command is the confirmation (release-workflow.md Command authority and anomaly confirmation): the only possible question is a version anomaly, asked here together with preflight `questions`, or a later candidate anomaly. Blockers stop only the affected publication.
3. `release sync plan/apply` (merge `origin/develop`, back-merge `jenkins`/`jenkins-release`) and `integrate gather plan/apply` for this release's own branch only; other branches are ignored.
4. Tools: reuse `.agrimap-agent/runtime/release-tools.json` when it is at most 7 days old and `dotnet tool list -g` still shows the same agm-release version; otherwise follow release-tools.md once and rewrite that ignored file.
5. Baseline per environment comes from the preflight owner values and the matching verified tag or checkpoint; never pick the largest tag or reuse a Production tag as Inhouse history. Review baseline-to-candidate committed changes plus dirty paths, reading changed content and affected dependencies only.
6. Prepare once: explicit owner target, otherwise owner PATCH+1. Full prepares both; Production-only leaves Inhouse unchanged; Inhouse writes no Production notes/index/tag. Update the changelog for this delta and Production release.md/notes when selected; keep historical text.
7. Verify owner pairs and allowed diffs, secrets, notes completeness, `git diff --check` and tag collision. Reuse test/build evidence only while content, dependencies and tools match; flash is not skip-tests.
8. D: commit content (`feature|fix|comment:`, Thai description) and version (`bump:`) separately, run `release sync plan/apply` again, push develop once; if the push is rejected because someone pushed, sync and push again, at most twice, without asking. J: fast-forward and push jenkins. Q/C: show version, SHA and tag as one progress line and continue (ask only for a candidate anomaly). T: fast-forward jenkins-release, create and push the annotated tag from the notes blob.
9. F: one final `audit:` commit and develop push, no intermediate audit commits; N for Production. End with command, versions, branch/tag results, verification reused/run, excluded work and the mandatory release-timing.md output block.

## Avoid repeated overhead

Write records with a file tool or script, never shell `echo`/here-strings. Batch independent read-only checks, serialize Git mutations and check every exit code. On an uncertain push outcome inspect remote refs before retrying; a tag failure resumes only the tag checkpoint. Never forward --flash to the .NET CLI, force-push, move tags or edit CI triggers. No guaranteed duration or green-deployment claim; single push per ref applies.
