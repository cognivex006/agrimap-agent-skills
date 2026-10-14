# Team git workflow

Load for product writes in a Git repository or for a short integration reply. Scripts plan; run `apply` only with the returned `planHash`. On any non-ok result stop and follow its `next` or card. Never create worktrees or clones, stash, reset, force-push or stage with `git add -A`/`.`.

## Repository and policy

1. `agm-workspace.mjs context --cwd <session cwd> [--paths <files>] [--hint <project>]`. Read every `readRequired` file completely, then `context --ack <sha12,…>`. Each repository you write needs its own ack; never write `.agrimap-agent` outside a Git root.
2. `policy show`. Missing: `policy infer` and put its card in the first question round, then `decide record`. Never guess prefixes, bases or targets.

## Start

After `start`, run `branch plan --type feature|fix|hotfix|refactor|docs|chore --slug <english-kebab>` then `branch apply`. Work branches are `feature/<slug>` or `hotfix/<slug>` only (owner decision 2026-10-14): fix, refactor, docs and chore branch as `feature/` and keep their commit type; guard G9 denies other prefixes. The work type is yours unless it changes base or target (hotfix vs feature); then use a card. Pre-existing dirty files are carried but never delivered. Host-created worktree branches follow `hostWorktreeBranch`.

## Deliver

After verification, add the changelog entry required by the project AGENTS, then `deliver plan [--input message.json]` and `deliver apply`. Failed or missing verification still delivers the work branch with `AGM-Verification` and the `DELIVERED_UNVERIFIED` warning; merge is not offered until it passes. Messages follow the team style (bootstrap AGENTS.md §10.6): `feature|fix|comment: <Thai description>` of at most 100 characters that a BA and the team understand, English only for technical names (policy `delivery.commitLanguage`, default `th`); agm-release commits use `bump|audit|ci`. Pass a Thai `subject` in message.json when the objective is English. Conventional types in explicit input are normalized (feat→feature, docs/refactor→comment, chore/build→ci) without scope; guard G7 denies any other header typed with `git commit` unless the policy sets `delivery.commitConvention: conventional`. Separate work of different types into separate commits. The script stages exact own paths and verifies the remote SHA; it refuses protected branches, suspected secrets, missing acknowledgement or changelog. If the policy disables delivery, report exact paths and commit only when asked (`--explicit commit|push`). Then run `integrate options` and end with the delivery summary (at most 12 lines, warnings under `⚠️ ต้องตามต่อ` with code, impact and fix) and its next-step card.

## Release gather

agm-release only (AGENTS.release.md §6.4–§6.5): `release preflight` reads branch pairs, owners, tag, dirty paths and M once and returns auto actions, at most three questions and blockers; `release sync plan [--allow jenkins|jenkins-release]` then `release sync apply --plan-hash <hash>` merges a clean `origin/develop` and history-only `jenkins`/`jenkins-release` into local develop without pushing. `integrate gather plan [--branches a,b] [--scope release|all]` then `integrate gather apply --plan-hash <hash>` builds Git merge commits into local develop without switching or pushing; the release D stage pushes develop once. Scope `release` (default) takes only the current branch, the session's delivered branch and `--branches`; a conflict returns `resolve` steps the agent performs. `--scope all` with `integrate pending` covers every branch.

## Short replies

| Reply | Intent |
| --- | --- |
| an option number | the stored card option |
| merge, รวม, รวมเข้า <branch>, ship, ผ่าน รวมได้, LGTM | integrate |
| pr, mr, เปิด PR, ส่งรีวิว | open-pr |
| อัปเดต branch, sync | update-branch (merge, never rebase or force) |
| แก้ต่อ, พักไว้ | continue, park |
| ทิ้ง, ยกเลิก branch | abandon (R3 card) |

Questions ("merge ยังไง?") and quoted text are not commands. A resolved reply is the explicit instruction for exactly the planned action; deleting branches, other targets or merging with failing checks needs its own card. Default integration is `local-merge` (no MR/PR): merge only after local verification passes; open a PR/MR only on `pr`/`mr` or a `pull-request` policy. Run `integrate plan --intent <intent>` then `integrate apply`. For local merge, run the verification the plan requests before `--stage push`. Report blocked reviews, failing checks, conflicts and server rejections with evidence; never bypass reviews or enable auto-merge unless the reply asked for it. `jenkins` and `jenkins-release` are release targets: use the project release intents.
