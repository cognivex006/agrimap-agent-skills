# Skill-package development and publication

<!-- AGM-MAINTAINER-ONLY -->

Maintainer-only source documentation. Apply only to an explicitly assigned task developing this repository, never to installed/cache usage, package installation or product releases. No runtime skill routes here. This document is excluded from installation artifacts.

## Branches and authority

| Branch | Purpose | Integration |
| --- | --- | --- |
| feature/*, fix/* | Scoped development from develop | PR into develop |
| develop | Next-version integration | PR into main directly, or cut release/<base-version> for stabilization |
| release/<base-version> | Stabilization, optional <base-version>-rc.N packages | PR into main, then reconcile into develop |
| main | Reviewed stable source | Stable publication only at an explicitly selected, verified commit |
| hotfix/* | Urgent fix from main | PR into main, patch release, then reconcile into develop |

Use this same working directory. Inspect status, branch/upstream and fetch when synchronization is in scope; safely fast-forward the relevant branch before new work. Preserve all existing edits. Creating a development branch can carry same-scope uncommitted work without copying files. Do not stash/reset, auto-clone, create worktrees or commit unrelated changes to bypass a conflict. Diagnose concrete blockers in place.

An implementation request authorizes scoped local changes, not commits or external writes. A commit/push request covers its named development branch, not main, PR merge or publication. Explicit release approval can cover the complete named version/source/publication sequence without repeated questions. Never infer publication from a bump, successful tests or the word finish.

Integration needs no human review (owner decision 2026-09-25, 4.9.3): the gate is passing local verification (below). Integration, commits and pushes still need authorization for the named scope. Use PRs where server rules require them; do not wait for retired Actions checks or bypass a server rule. Only the owner changes server protection. The new repository settings are unknown until read back successfully.

PR into main accepts develop, release/* or hotfix/* in this repository; PR into develop accepts feature/*, fix/* and release/hotfix synchronization. Direct develop-to-main integration still requires local verification and applicable server PR rules and does not publish a release automatically. Review scope and verification; no blind conflict resolutions or history rewrites. Main/develop protection and required checks must also be configured on the server: Markdown alone cannot enforce them.

## Commit style

This repository uses the same team header as the product projects it governs (bootstrap AGENTS.md §10.6): `<type>: <plain description>`, at most 100 characters, no scope. The description is Thai so the BA and team can read it (4.9.8); English only for technical names, and technical detail goes in the body. End the header with the target version in parentheses when the work belongs to one, for example `fix: บังคับรูปแบบ commit ของทีม (4.9.6)`.

| Type | Use for |
| --- | --- |
| `feature:` | New skill, command, script capability or contract rule |
| `fix:` | Behavior that was wrong in a skill, script, hook or contract |
| `comment:` | Review follow-up, wording, docs, refactor or tests without new behavior |
| `bump:` | Version bump with its changelog finalization and generated sync output, for example `bump: ขึ้นเวอร์ชัน 4.9.8` |
| `audit:` | Release history or `.agrimap-agent` records only |
| `ci:` | `.github/workflows`, `tools/`, hooks wiring or repository governance |

Split work of different types into separate commits. Merge and revert messages that Git writes stay as they are. Local verification (`tools/check-commit-style.mjs`, when --base/--head are supplied) rejects any other header among the non-merge commits a PR adds; the Claude guard G7 denies them locally once the installed plugin is 4.9.6 or later. Commits already on main before 4.9.6 are not rewritten.

## Version lifecycle

Use package.json as the version authority; edit canonical files and run npm run sync. During development use Unreleased changelog notes; published previews require distinct prerelease numbers (for example 4.2.0-rc.1). Finalization changes to the approved version, removes its unreleased heading marker, regenerates and rechecks the exact final commit. A bump to 4.1.0 in a working branch does not claim that 4.1.0 is published.

Never alter a published version's tag or assets. Every release has a v<version> tag, exact source SHA, host-specific runtime archives, SHA256SUMS, release.json and release notes. Later fixes require a new version. Previews never become latest stable. Downloadability and ongoing maintenance are separate; keeping older artifacts does not promise indefinite backports or simultaneous installation in every host.

## Local verification and packaging

Run from the source repository, not from a cache:

```powershell
npm run sync
npm test
npm run test:release
npm run audit:tokens:strict
npm run package:build
```

package:build creates a fresh directory beneath ignored dist/ with one .tgz per host, catalog and checksums. It never deletes an earlier build, installs a plugin, creates a tag or publishes. Dirty builds are labelled local-preview with sourceDirty=true and are not releasable artifacts. tar and Node >=20 are required. The artifacts contain generated runtime data, not the source package's npm scripts.

config/distribution.json is the user-document allowlist shared by sync and packaging. tools/package-release.mjs excludes maintainer files, rejects symlinks and unexpected instruction files, preserves the exact product bootstrap AGENTS template, verifies host versions and keeps provider hooks separate. GitHub's automatic source archives and full Git clones are source distributions, NOT sanitized runtime artifacts: root AGENTS scope protection still matters there. Do not claim .gitignore or export-ignore controls Git clones.

## Local verification and publication (no GitHub Actions)

The source remote is https://github.com/cognivex006/agrimap-agent-skills. This repository has no Actions workflows. Local scripts use Node, Git, tar and GitHub CLI; they do not dispatch workflows or consume Actions artifacts, environment approvals or automatic workflow credentials.

```powershell
npm run package:verify
# Before a PR, additionally check route and commit headers against a current base ref:
npm run package:verify -- --base develop --head feature/local-package-release
# Preview only (also built by verification):
npm run package:build
```

Run sync first and review its output. Verification reruns sync and rejects newly generated drift; existing development edits are allowed. It runs package tests (at most two test-suite processes to limit Windows subprocess pressure), release tests, strict token budgets and preview construction. Route/commit checks require both --base and --head and an up-to-date origin/<base>. A successful run covers only its reported OS. There is no automatic Windows/Linux matrix; run the same checks on each OS when cross-platform evidence is required, and report the missing OS honestly.

After explicit publication authorization, integrate the exact verified source through the approved branch/PR flow. Stable source must be a clean main commit already on the new origin; rc.N must be on release/<base-version>. Authenticate gh with an account allowed to publish to the new repository. Never expose a token in chat or logs.

```powershell
# Publication preparation only; no tag/release is created:
node tools/package-release.mjs --release <version> main
# This command writes a NEW tag and GitHub Release; explicit authorization required:
npm run package:publish -- --version <version> --latest false
# Owner-approved new-account 5.0.2 reissue only:
npm run package:publish -- --version 5.0.2 --latest true --migrate-5.0.2
# Use --latest true only when this stable version is intended as current latest.
```

package:publish validates fetch/push URLs, repository identity/write permission, the actual branch, unused local/remote tag and release, and a freshly fetched remote SHA. It reruns local checks and creates a publication-build with tools/package-release.mjs. It atomically creates the tag at that SHA, creates a draft with host archives/catalog/checksums and notes, downloads and checks every uploaded asset, then publishes. Prereleases cannot become latest stable. It never pushes source, merges PRs, force-updates tags or replaces release assets. Keep its build directory if publication fails: inspect the reported stage, tag, draft and SHA before any manual recovery; an unchanged retry must refuse an existing tag/release.

npm run package:build alone produces local-preview, not a releasable publication-build. A version number in source does not establish that a release exists. Owner exception (2026-10-20): reissue the modified 5.0.2 on cognivex006/agrimap-agent-skills only, using --migrate-5.0.2. The script pins the legacy local tag to 2447be9bdbaf31d7c17b2e07c8718d5f8d4a42d7, preserves it unchanged, refuses any existing new-remote tag/release, and records the previous repository/SHA and changed-source reason in release.json. This does not permit overwriting published assets/tags on either repository. Normal releases still reject existing local tags; the exception cannot be used for another version or remote. Other historical releases require original verified source/assets and separate scope. Follow-up owner authorization (2026-10-20): after correcting remaining account references, delete and recreate the new-account v5.0.2 tag/release at the verified corrected main commit. Perform explicit cleanup separately; the publisher still refuses existing tags/releases and must verify newly uploaded assets. Preserve the original local v5.0.2 tag and migration provenance. This is not general overwrite authority.

Owner exception (2026-10-31): v5.0.8 was published from PR #20 before PR #22 (QUALITY-05 ADV-10..14, context-first orientation) merged, so the release omitted part of the 5.0.8 changelog. The owner confirmed nobody had installed 5.0.8 (everyone on 5.0.7) and authorized deleting the v5.0.8 tag/release and republishing 5.0.8 from the merged main commit. This is not general overwrite authority.

Server setup is separate authorized administration. On main/develop remove retired required status contexts verify (ubuntu-latest) and verify (windows-latest), or their actual names shown in protection/rulesets, including any required-workflow rule for the removed Package CI. Retain PR rules, force-push/deletion restrictions, v* tag protection and immutable releases where supported. Do not assume the new repository copied any old settings. The former package-release Actions environment no longer gates local gh publication; authorization is enforced by the approved release instruction and GitHub account/repository permissions. Report this loss of environment approval explicitly; there is no replacement server approval configured by these scripts.

## Previous versions and adoption

GitHub Releases is the version listing. Each new release's release.json maps that exact version/source SHA to host archives and SHA-256 values. Use the selected version's assets, not branch HEAD or the automatic source zip. See docs/VERSIONS.md for the consumer procedure; it contains no development rules.

For history before this pipeline, first prove the historical commit, manifest version and available artifacts. Do not fabricate old tags or rebuild today's source under yesterday's version. Backfilling historical tags/releases requires a separate approved mapping of versions to verified commits; record reconstructed artifacts honestly. On 2026-09-10 the read-only origin tag listing was empty; existing changelog entries alone do not establish installable tagged releases. No retrospective publication is performed by this migration.

Current adoption: preserve the existing uncommitted 3.7.0 work, create local develop from the existing main baseline and work on feature/package-development-4.1.0 in the same directory. The requested final source version is 4.1.0. Commit/push, PRs, protection setup and first publication remain separate actions.

Follow-up authorization on 2026-09-10: publish the prepared work on GitHub, show the latest documentation version and retain historical version tags. config/release-history.json records the 24 verified stable mappings for retrospective tagging, excluding the test prerelease and unpublished 3.7.0 draft. This publication request covers development/release PR integration and 4.1.0 publication, not bypassing checks or required reviewer approvals. Server protection setup remains a separate decision.

References: [SemVer](https://semver.org/), [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [GitHub release create](https://cli.github.com/manual/gh_release_create).
