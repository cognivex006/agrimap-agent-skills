# agm-release command contract

## Contents

- [Required execution references](#required-execution-references)
- [Explicit contract upgrade](#explicit-contract-upgrade)
- [Commands and boundaries](#commands-and-boundaries)
- [Prerequisite readiness before audit](#prerequisite-readiness-before-audit)
- [Tool readiness](#tool-readiness)
- [Branch freshness in the existing checkout](#branch-freshness-in-the-existing-checkout)
- [Indexing includes Project Backfill](#indexing-includes-project-backfill)
- [Indexing and preparation](#indexing-and-preparation)
- [Owner-requested version policy](#owner-requested-version-policy)
- [Command authority and anomaly confirmation](#command-authority-and-anomaly-confirmation)
- [Pipeline, confirmation and promote](#pipeline-confirmation-and-promote)
- [Completion and recovery](#completion-and-recovery)

These are Agent-chat commands. The .NET CLI only supplies audit, prepare, verify and notes; the Agent performs indexing, Git publication and the anomaly check. Read the target AGENTS.md and AGENTS.release.md completely and [release-and-bootstrap.md](release-and-bootstrap.md) for artifact/verification details. Never apply the bundled project template to the skill-package repository. Apply host/user instruction priority: an explicit owner-requested version overrides repository or bundled default version policy without requiring a governance edit; a version anomaly gets the one question in Command authority and anomaly confirmation below. Other applicable project restrictions remain effective. Do not silently migrate target instructions.

## Required execution references

With --flash, [release-flash.md](release-flash.md) replaces full indexing, including H/P/I prerequisites, not publication safeguards.

Read [release-steps.md](release-steps.md) before mutation: it defines all nine exact command sequences, environment ownership, checkpoint evidence and completion. Read [release-tools.md](release-tools.md) for detection, installation and CLI compatibility diagnosis. For these nine commands, their Production-only artifact rule replaces the earlier generic environment-notes guidance in this package. The bootstrap template remains historical installation material; it is not silently rewritten or adopted. If an applicable target instruction conflicts, apply host/user priority first. An explicit owner version already resolves a lower-priority PATCH-only prohibition, including during planning; it needs no additional authority question or file migration. Only an unresolved conflict blocks the affected write.

This procedure is model-independent across Codex, Claude and Antigravity. Model labels/settings never select modes, change ownership, skip evidence or grant publication authority. Cross-model compatibility remains unverified unless actually tested.

The Agent discovers all paths, versions and SHAs and resolves routine tool/environment problems itself. Never ask a human to calculate a SHA, build Git commands or run the release manually. Ask only for an unresolved intent/authority decision, unavailable access, or an anomaly named in Command authority and anomaly confirmation.

Before issuing a version-policy refusal, inspect the current bundled entrypoint and version policy, the actual target instruction and the explicit request. Do not reuse a prior refusal, plan or memory as authority. Report actual target/bundled paths and versions if a genuine higher-priority restriction remains; a quoted old prohibition alone is insufficient.

Read [release-timing.md](release-timing.md) for the timer started before requester lookup, per-step measurement and mandatory release-owned history/final-audit completion. This applies to normal and --flash release actions.

## Explicit contract upgrade

For `agm-release bootstrap upgrade` (preserve custom rules) or legacy `agm-release upgrade` (explicit replacement), read [release-bootstrap-upgrade.md](release-bootstrap-upgrade.md). Use the bundled project-bootstrap.mjs helper with the selected mode, backups and version/receipt verification; finish locally without release tools, product version changes or publication. The nine release actions still perform normal bootstrap freshness checks.

## Commands and boundaries

| Agent arguments | Ordered work | Terminal boundary |
| --- | --- | --- |
| bootstrap upgrade | Plan/apply current bootstrap; back up recognized updates, merge custom project rules and verify receipt | Local bootstrap only; no package update, product version/push/tag |
| upgrade | Back up and replace scoped bundled contract files; verify version/receipt | Local contract files only; no product version/push/tag |
| indexing | Project Backfill: reconcile full reachable history, project catalog, historical changelog and README capability/API inventory | Local artifacts only; no version, push or tag |
| prepare inhouse | Prepare and verify the requested Inhouse version, default PATCH+1 | Local candidate only; no push/tag |
| prepare production | Prepare and verify the requested Production version, default PATCH+1 | Local candidate only; no push/tag |
| pipeline inhouse | Verify existing candidate; commit reviewed candidate, push/verify develop, fast-forward push/verify jenkins | Inhouse branch checkpoint; no version bump or Production/tag |
| pipeline production | Verify existing Production candidate; commit reviewed candidate, push/verify develop and jenkins; prepare Production fast-forward plan | Production-ready candidate; do not push jenkins-release or create/push tag |
| promote | Verify existing Production-ready candidate; show the publication plan; publish/verify jenkins-release then annotated Production tag | Production, tag and notify checkpoints |
| release full | indexing → prepare both owners independently → pipeline inhouse → pipeline production → promote | develop + Inhouse + Production + Production tag + notify |
| release production | indexing → prepare production → pipeline production → promote | Production + Production tag + notify; Inhouse branch transit, Inhouse version unchanged |
| release inhouse | indexing → prepare inhouse → pipeline inhouse | develop + Inhouse only; no Production/tag |

Preparing both owners is internal to release full; it is not permission to blindly call CLI prepare both. First prove the CLI respects Production-only notes as described in release-tools.md. Full flow reuses one frozen candidate through both pipeline steps; do not recommit, bump or push the same checkpoint twice. No arguments, unknown arguments or an unspecified environment require clarification before mutation. Help/explanations are artifactless.

## Prerequisite readiness before audit

Execute the release prerequisite repair in [release-and-bootstrap.md](release-and-bootstrap.md) as part of readiness: check the synchronized target branch, plan/apply compatible missing bootstrap files, verify the result, and continue into audit/preparation in the same invocation. A missing AGENTS.md does not require a separate user-run initialization. Existing-file adoption conflicts and incompatible profiles still require resolution before affected writes. Keep the selected command's local/publication boundary and prepared-candidate constraints.

## Tool readiness

1. Inspect OS, target root, project instructions, Git remote, branch/HEAD and worktree. Check `git --version`, `dotnet --info`, `dotnet --list-sdks`, `dotnet --list-runtimes`, `dotnet tool list --global` and executable resolution for agm-release. Check exit codes individually. An installed package with an unresolved shim is a PATH problem, not grounds to reinstall.
2. Check the installed CLI's usage (invocation without arguments may intentionally exit nonzero). Match available verbs/options and the target's required runtime. The known CLI uses .NET 8 and package ID `AgriMap.ProjectDevKit.NetCore.Release`; do not assume newer CLI versions preserve this contract.
3. When Git or the required .NET SDK/runtime is missing, obtain its compatible installer from the official vendor or an already configured trusted OS package manager. Inspect current vendor installation instructions and architecture first; run the supported installation within available permissions, then verify again. Do not change global package feeds, Git credentials, TLS settings, or upgrade unrelated software. Installation failure, required elevation unavailable, or missing private-source access is a concrete blocker; report the attempted command and next requirement.
4. When agm-release is absent, read the installation README at the canonical repository `https://gitlab.gisc.cdg.co.th/e26-5002.agrimap/standards/tools/cli/netcore/agrimap.projectdevkit.netcore.release.git` using existing authorized access. Follow its documented package source/version or documented build/pack/install procedure in a separate temporary checkout. Do not assume the private package is on public NuGet, invent feed credentials, or create a replacement CLI in the target. Existing configured approved feeds may be used if provenance is verified. Install missing tools automatically within the requested flow; ask only for a concrete missing permission/input.
5. Recheck executable resolution and usage after installation. Use the verified absolute shim path if the current process has stale PATH. Record tool versions and readiness; never claim readiness merely from a package-list row. No Jenkins API client, glab or server rollout tool is required by this flow.

<a id="dirty-checkout-recovery-before-preparation"></a>
## Branch freshness in the existing checkout

Use the requested repository directory for release work. Do not clone the product, add a worktree, copy the project into a sibling/temp directory or switch to an old release clone automatically. Being on develop, having develop checked out here, or having run-owned bootstrap/log changes is not an isolation requirement. A different checkout requires an explicit user instruction; diagnose an actual conflict in place.

Before bootstrap/release artifact writes for a new release, record the current branch/HEAD, upstream, index and staged/unstaged/untracked inventory, then fetch the selected remote and inspect all three pairs: develop vs origin/develop, jenkins vs origin/jenkins, jenkins-release vs origin/jenkins-release. Refresh branch refs explicitly if the configured fetch refspec omits one. Classify each as equal, behind-only, ahead-only, diverged or missing. A shallow history or failed ancestry command is unknown, not proof of divergence. Fetch is not proof that local branches were pulled.

For behind-only branches, in this same directory use git switch <branch> followed by git pull --ff-only <remote> <same-branch> when switching is safe; record the resulting SHA and finish new preparation on develop. Equal branches need no pull. Ahead-only develop commits ship with the next D push; other ahead-only commits need provenance review, not reset or an automatic push. Divergence is a real integration issue: inspect commit/file differences and supported read-only merge feasibility, preserve history and report the exact conflict/decision. If a local branch is missing and its remote exists, a local tracking branch may be created in this repository; a missing remote is not permission to create/push a new remote branch. If another existing worktree owns a branch, inspect its ref and report the local lock when updating is necessary; do not force it free or create another checkout.

Do not carry unrelated dirty changes across branch switches. Classify their actual ownership and paths. Authorized run-owned bootstrap/content changes can be verified and included in the command's existing commit phase; other pending edits follow the release-timing.md pending-work gate. Local-only prepare never gains commit authority just to clean the directory. If switching/pulling is blocked, complete independent read-only checks and explain the exact paths and required integration decision. Do not stash, reset, blanket-stage, delete logs, or create a clone as a shortcut. Check freshness before creating new bootstrap/log changes where possible; same-run changes are not a reason to restart elsewhere.

Pulling origin/jenkins-release into local jenkins-release only synchronizes the same branch; it is not promotion from jenkins. Preflight never merges develop into jenkins or jenkins into jenkins-release, pushes a branch/tag, or grants Production confirmation. Re-fetch before each publication stage to detect races; same-directory pull checks reduce stale-state failures but cannot guarantee conflict-free future merges. On resume preserve the exact prepared candidate and re-evaluate remote movement before any pull over candidate changes; do not prepare a replacement or bump again.

### Preflight and automatic sync

Follow AGENTS.release.md §6.5: `release preflight` and `release sync` ([git-workflow.md](git-workflow.md)) give one question round at R and automatic clean syncs; a resumed release keeps its rules.

### Finished work branches (M)

Only this release's own work branch is gathered: the current branch, the session's delivered branch or `--branches` (AGENTS.release.md §6.4); other branches are neither read nor reported. prepare, pipeline and release gather before preparing; promote gathers after T. First deliver leftovers on the current work branch; commit post-delivery `.agrimap-agent` logs there as `audit: บันทึกประวัติงาน` when they block a switch. Then run `integrate gather plan`/`apply` ([git-workflow.md](git-workflow.md)); conflicts return resolve steps the agent performs without asking. Merges are local Git merge commits without a worktree switch; verify develop, and they ship with the single D push (promote: F). A pipeline with a prepared candidate only reports new own work. Never rebase, squash, force, stash or delete branches.

## Indexing includes Project Backfill

`agm-release indexing` explicitly authorizes Project Backfill, including the I step inside release full/production/inhouse. A successful diff-only audit, fresh project.md, or today's changelog entry is not completion. Read the Project Backfill method in the current bundled AGENTS.release.md §5 and apply it under host/user authority; older installed scoped-only indexing wording does not remove this requested behavior. No separate backfill approval/invocation is needed.

- Resolve and record the repository, source ref/SHA, original checkout and durable output root. Standalone indexing operates on the requested project checkout and its reachable HEAD/history plus dirty inventory; it needs no develop checkout or branch switch. Composite release indexing uses the verified develop candidate in this same repository and inventories local changes without silently including unrelated edits in publication.
- Inspect whether history is shallow. Fetch missing reachable history from the verified configured remote when access permits. Review from reachable root commits to the recorded source SHA, including actual diffs, deletions/reverts, current source/tests/docs/CI and staged/unstaged/untracked changes; a latest-tag delta or git log subjects alone is insufficient. Do not include unrelated branches via --all. Report inaccessible coverage as unresolved rather than claim full completion.
- Read the complete existing changelog and project catalog. Map evidence to capability milestones with proven implementation committer dates; preserve correct entries, reconcile gaps and semantic duplicates, and maintain unique newest-first date headings with English entries. Never manufacture historical dates or replace history with today's summary.
- Update `.agrimap-agent/memory/project.md` with repository facts, complete current capability catalog, evidence references, known limitations, coverage and checkpoints. Update root README.md with overview, capability tables, actual API/contracts, runtime/dependencies, setup/run/test, configuration and limitations; preserve correct project-specific content. README describes current behavior, changelog its evolution, and project.md their evidence/index. Do not reduce this to module names or a release-only index.
- Reuse proven complete prior backfill coverage and reconcile the remaining delta; do not regenerate unchanged documentation or duplicate historical entries. Record covered/excluded/unresolved evidence, reviewed history bounds, catalog-to-README parity and git diff --check. Unknown unavailable facts stay UNKNOWN; unresolved required coverage means partial, not completed. Backfill never bumps owners or creates versioned release notes, tags or publication by itself.
- Deliver standalone indexing artifacts in the requested project root. Keep composite release artifacts and reusable memory in this same project root; do not create a separate inspection/release checkout. If earlier work already left external artifacts, report their location and reconcile only within explicit recovery scope. This is scoped documentation authoring, not a copy of the dirty tree or publication of unrelated edits.

## Indexing and preparation

- If `.agrimap-agent/memory/project.md` or its parent directories are absent, perform normal evidence-backed indexing and create them in this invocation under release-and-bootstrap.md. This creation is within indexing/preparation scope; do not stop for Project Backfill or a separate bootstrap request. Populate the index before a CLI gate that requires it, then continue the selected flow. `indexing` itself requests Project Backfill under the contract below; do not require that keyword separately. Standalone prepare retains scoped prerequisite indexing and does not silently expand into full backfill.
- `project.md` means `.agrimap-agent/memory/project.md`, never a new root project.md. Reconcile current capabilities, references and release checkpoints with actual source/history. Update root `changelog.md` in English, newest-first, one heading per date; preserve historical evidence. Inspect staged, unstaged, untracked, deletion and a justified committed range; unresolved coverage blocks completion. CLI `audit --mode diff-only --format json --root <target>` gathers evidence but does not write the index or changelog.
- Prepare only on develop. Inhouse owner is Jenkinsfile; Production owner is Jenkinsfile_Production. Change only IMAGE_TAG/PROJECT_VERSION to the same resolved candidate in each selected owner. Resolve versions using the owner-requested version policy below. No pipeline behavior edits or automatic reset. For an unfinished candidate, compare memory, notes, owners and Git; resume unchanged intent or reconcile an explicit revised target under that policy, never call prepare again blindly.
- Only use a CLI prepare/verify mode after the compatibility check in release-tools.md. Inhouse preparation changes its owner pair and index/changelog only; it never creates or modifies versioned release notes or release.md. Production preparation (including full) maintains release.md and exactly release-notes/<productionCandidateVersion>.md with Thai prose and English schema fields. Never derive either filename or tag from the Inhouse owner, the larger version, the last processed owner or an ambiguous VERSION variable. Fill TODO/TBD before verification. If indexing is stale, finish the prerequisite reconciliation inside preparation scope.
- Before publication, inspect and explicitly list publishable paths. Stage exact reviewed paths, separate existing content changes from version metadata, and respect the target allowlist. These new commands do not inherit legacy group-B permission to publish all unrelated dirty work. If excluded changes prevent a needed branch switch/pull, use the in-place diagnosis above and report the concrete integration decision; do not stash, discard, force-add ignored files or use blanket staging.

## Owner-requested version policy

- PATCH+1 is the default only when the owner has not specified a target. A clear exact version or Patch target in the current request or an earlier still-applicable instruction is authoritative for that environment. Accept skipped patches and explicit minor/major changes after the one version-anomaly question (Command authority and anomaly confirmation); never require the phrase "I take responsibility" or an AGENTS.md/governance rewrite. A repository or bundled prohibition on chosen versions does not outrank the user's explicit instruction. Higher-priority host restrictions still apply.
- Record each proven baseline, resolved candidate and source (owner request or default) independently. Validate the target against the project's version format. A numeric Patch target changes that baseline's Patch component; an exact version supplies the complete target. Ask only when the environment/value is genuinely ambiguous or malformed. A lower target explicitly requested by the owner is a version decision, not permission to reset Git or overwrite published history; never infer a downgrade from vague wording.
- Example: full with Inhouse baseline 1.0.0, Production baseline 1.0.4 and explicit targets 1.0.8 / 1.0.5 prepares exactly those versions, Production notes release-notes/1.0.5.md and tag v1.0.5. An unspecified selected environment uses its own PATCH+1; never force both versions equal.
- A substantive owner revision supersedes an unfinished target. Preserve evidence of the prior candidate, reconcile only proven run-owned uncommitted metadata and unpublished notes/index entries, then reverify the new candidate. Preserve unrelated work, historical notes and existing commits/tags; published candidates require a new release commit, never history rewriting. Invalidate stale candidate verification/publication confirmation and record the revised scope. Unchanged retries resume without another bump. Standalone pipeline/promote still does not implicitly prepare: a requested version revision requires the preparation step before publication.
- A chosen version alone is never a policy blocker. Check actual owner equality, scoped diffs, notes provenance and tag identity. Identical published checkpoints can resume; a conflicting existing tag remains a concrete collision and must not be moved, deleted or overwritten. Version selection does not grant additional publication authority.
- If the CLI only computes PATCH+1, follow release-tools.md's scoped direct-authoring fallback; do not substitute the CLI's candidate for the requested one or claim --expected-version selects a version.

## Command authority and anomaly confirmation

Owner decision 2026-10-14 (5.0.1): the owner-typed command is the confirmation. `release full|production|inhouse`, `pipeline inhouse|production` and `promote`, with or without `--flash`, authorize every publication step their row lists — develop/jenkins pushes, jenkins-release, the Production annotated tag and notify. Show the Q plan (versions, SHAs, tag, notes link) as one progress line and continue. Use that authority for routine checks, safe fast-forward pulls, backed-up bootstrap updates, unambiguous custom-rule merges and supported CLI fallbacks; give progress updates, not approval questions. Local-only commands stay local-only.

Ask one question, before the first push, only for an anomaly:

1. Version anomaly: an owner-supplied version is not its environment's PATCH+1 — a skipped patch (baseline 1.0.3, `version 1.0.5`), a minor/major change, or a version at or below the published baseline. Show baseline, default and requested versions; the answer holds for the run and its resume.
2. Candidate anomaly: content this run did not prepare reached the candidate, or the destination SHA or tag changed materially from the shown plan.

A bare command with the default PATCH+1 versions is never an anomaly. Stop conditions (divergence, unresolved conflict, failed verification, tag collision, missing permission, path outside the allowlist) are not questions: stop the affected step with evidence. A `PROJECT CUSTOM` confirmation rule in the target still applies; confirmation clauses of an older bundled template are superseded by this decision. The question states action/environment/version/tag, SHAs with verification evidence, effects including pipelines, and recovery commands with limits; link notes instead of dumping them.

Recovery plans do not authorize rollback. Published recovery uses reviewed revert/new-release or separately authorized prior-artifact redeployment, never force-reset or tag deletion/movement; Git revert cannot undo pipelines, deployments or external effects. Reuse an anomaly answer across retries/resume while repository, candidate, destination, versions and tag still match; checkpoint advancement is never a reason to ask again.

## Pipeline, confirmation and promote

- Pipeline means ordered Git branch publication under the existing server trigger configuration, not editing Jenkinsfiles or asserting a successful deployment. Before each stage, fetch and fast-forward-only synchronize the stage's local branch with its remote, re-read the synchronized state, and continue the same invocation when that resolves a stale-local mismatch. Verify CLI gates and diff checks against the synchronized develop state, commit the approved candidate, push develop, and compare remote SHA. Fast-forward jenkins to that exact source SHA, push and verify remote equality before any Production step. Genuine remote divergence/conflict stops the affected step without merge commits, force-push or history rewriting.
- pipeline production always passes the verified jenkins checkpoint, even when only the Production owner was bumped. It stops before any jenkins-release mutation and before tag creation. Verify fast-forward feasibility and prepare notes/tag annotation so promote publishes a concrete, reviewable candidate.
- Immediately before promote, show the Q plan as a progress line under Command authority and anomaly confirmation and continue; ask only for a named anomaly. Keep full SHAs, annotation and verification evidence available in the checkpoint/linked notes. When an anomaly question is open, wait for an actual answer; time elapsed is never approval.
- The plan is scoped to the shown candidate, destination and tag. Revalidate remote state and candidate before T. If unchanged, execute the remaining steps without asking, including retries/resume.
- Before T, fetch again, fast-forward-only synchronize local jenkins-release with its remote, and revalidate the concrete plan. A stale-local mismatch that synchronization resolves does not require another invocation; a materially changed remote candidate, destination or tag requires a revised plan and confirmation (a candidate anomaly). Then fast-forward jenkins-release from the exact verified jenkins SHA, push and verify remote equality. Create the Production-only annotated tag `v<VERSION>` at that SHA with `--cleanup=verbatim -F release-notes/<VERSION>.md`. Verify notes against the blob at Production SHA, full annotation equality (only CRLF/LF normalization), tag object type and peeled SHA before push; verify remote tag object and peeled SHA afterward. Never overwrite an existing published tag; verify an identical checkpoint or report collision.
- Do not wait for green Jenkins or call its API. Report pipeline status as pending/not verified unless actual evidence is available; branch push success is not deployment success.

## Completion and recovery

Record each durable checkpoint and pending action in the target project index under its recording contract. After pipeline/promote publication, commit remaining release-owned audit locally on develop for the next release's push (push now only on explicit request); never promote/tag that final audit commit or bump again. Follow release-timing.md for pre-commit recording flush, final status inventory and avoidance of self-generated audit loops. If recording publication is restricted, retain artifacts locally and report that boundary. Report release SHA and final develop SHA separately.

Check each external command's exit code immediately. On failure preserve verified checkpoints and resume the missing step; a tag failure does not justify another version or promotion. A later promote attempt reuses a matching anomaly answer under Command authority and anomaly confirmation; do not replay successful pushes. Report selected command, versions, covered paths, tools, local/remote SHAs, tag, verification and pending steps. An open anomaly question is pending, not completed; never report completed while a selected required checkpoint is missing.
