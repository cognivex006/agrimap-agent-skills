# Changelog

Release history, not current operating instructions. Start with [Getting Started](docs/GETTING-STARTED.md) and [Migration](docs/MIGRATION-3.0.md) for current behavior.

## 5.0.3 — 2026-10-28

- Make backend C# file layout explicit as NS-01: optional required imports, blank line, file-scoped namespace, blank line, type. Add both with/without-using examples and links from service/library checklists; preserve global usings, top-level entrypoints, directive scope and published namespaces.
- When adding or editing `*.Tests.csproj`/`*.Test.csproj`, inspect affected Dockerfiles and explicitly select the production `.csproj` in `dotnet publish`; preserve stage paths, restore compatibility and existing flags.
- Add backend team limits of seven `if`/`else if` decisions per method and seven parameters per method/constructor, plus a separate check of the configured SonarQube Cognitive Complexity gate. Prohibit nested ternaries and include behavior-preserving replacements for job status, message-code selection and conditional anonymous response objects.
- When a backend project has unit tests and a matching `*.Tests.csproj`/`*.Test.csproj`, configure the main production `.csproj` with `InternalsVisibleTo` for the test assembly and `Compile Remove="Tests\**\*.cs"` so nested test sources are compiled only by the test project. Resolve an explicit `AssemblyName` before falling back to the test project filename, handle signed assemblies and preserve existing configuration without duplicate entries.
- Load the C# baseline for `.csproj` and .NET-publishing Dockerfile work as well as C# source across analysis, diagnosis, planning, architecture, backend, QA, handoff and execution skills.

## 5.0.2 — 2026-10-20 (new-repository reissue)

- Correct the author account and generated historical source links to `cognivex006`; preserve original migration provenance. The owner explicitly authorized deleting and recreating the new-account 5.0.2 tag/release after this correction.

- Move the active repository, installation instructions and doctor source to `cognivex006/agrimap-agent-skills`; retain original historical release links and attribution. Historical assets are not assumed to exist on the new account.
- Replace GitHub Actions CI/publication with local `package:verify` and explicit `package:publish` commands. Publication verifies the fresh remote SHA, clean versioned source, new tag/release and downloaded draft checksums before publishing; it never pushes source or replaces an existing release.
- Limit local unit verification to two concurrent suites to reduce Git/Node subprocess exhaustion on Windows.
- Document retired required checks and the loss of automatic Windows/Linux checks and Actions environment approvals. Owner explicitly approved reissuing the modified 5.0.2 on the new repository. The original local v5.0.2 tag remains at 2447be9bdbaf31d7c17b2e07c8718d5f8d4a42d7; the new repository tag points to the migrated source and release.json records this distinction. The owner-authorized account-correction reissue is a one-time exception; other existing remote tags/assets must never be overwritten.

### Original 5.0.2 — 2026-10-16 (previous repository)

Goal planning belongs to agm-plan and agm-prompt only, sized to about three hours with a small-work gate.

- agm-plan and agm-prompt apply a size gate: work of about three hours in one lane stays one goal with no script, A/B lines or subagents; larger or cross-lane work becomes goals of about three hours (warning above 3.5) with Main/Subagent ownership written into the spec.
- agm-exec follows the goals an approved plan or Prompt Result carries and never invents goals for a direct request.
- agm-analyze no longer plans goals; it fans out read-only subagents, one per project, when evidence spans three or more projects, and Main synthesizes.
- goal-graph.mjs drops the GOAL_SMALL warning and the 3-hour minimum.
- Worktrees created by hosts other than Claude (Codex, Gemini, Qwen, DeepSeek and others) live under the OS temp directory (%TEMP%), never inside the source checkout, and are removed after integration.
- Helper files agents write to drive work (PR bodies, scripts, checkpoint copies) go in the scratchpad or %TEMP% and are deleted when the work is delivered (bootstrap §3 and subagents-and-branches.md).

## 5.0.1 — 2026-10-16

Less asking and less recording, work that resumes across sessions, orchestration decided every time with A/B goals, and agm-sql context migrate on sql-context-pack 3.3.1.

- Raw prompt history keeps requester text only: `hook-context.mjs` removes Claude Code `<task-notification>` blocks (background-task completions that carry the agent's own commands, such as `gh workflow run …` or `git push …`) before archiving to `prompts/YYYY-MM/<conversation>/history.md`, and archives nothing when no requester text remains. Before, 11 of 24 histories in this repository held such blocks, and product repositories committed them. Existing histories are not rewritten.
- Release asks only for anomalies (owner decision 2026-10-14): `release full|production|inhouse`, `pipeline` and `promote`, with or without `--flash`, are the confirmation for every step they cover — Inhouse, `jenkins-release`, the Production tag and notify. The one possible question, before the first push, is a version anomaly (an owner version that is not PATCH+1, such as baseline 1.0.3 with `version 1.0.5`) or a candidate anomaly (content the run did not prepare, or a changed destination or tag). Stop conditions stay stops, not questions; a `PROJECT CUSTOM` confirmation rule still applies. Before, rules in `AGENTS.release.md` §2.1, the Production step C and autonomy R3 asked one to five times per release. Changed: `release-workflow.md` (Command authority and anomaly confirmation), `release-steps.md` R/C, `release-flash.md`, `AGENTS.release.md` §2.1/§6.5, `config/operations.json`, README and docs.
- Savepoint and resume (owner decision 2026-10-14): the current-execution memory file is the savepoint — goal, done, remaining, next step, decisions, session and branch (`scripts/savepoint.mjs`). `checkpoint` accepts `--done`, `--remaining` and `--next`; new `agm-workspace.mjs savepoint`, `pending` (every unfinished execution in the project) and `resume --execution <id> --session <id>` (moves it to this session; a session active in the last 10 minutes needs `--take-over`, a busy session is never overwritten, and lost runtime state is rebuilt from the savepoint and its `created` log event). The hook puts `⏸ Pending work` right after the digest target line, answers `งานค้าง`, `ทำต่อ` and `savepoint`/`พักไว้` without a lifecycle, and tells the agent to fold a related interjection into the open execution or remind about it after an unrelated answer. `validate` warns `savepoint-remaining-items`; `complete` copies the done list into recent memory.
- `agm-sql context check|migrate` (owner decision 2026-10-14): `scripts/sql-context-scan.mjs` lists the procedures and tables a repository uses — names passed to `CallProcedureAsync`-style calls in any case, `CommandText`/`new SqlCommand`, `EXEC` in strings and schema-qualified literals; never `PI_`/`PO_` parameters or columns — plus the tables one hop behind each procedure with local DDL (CTEs, temp tables, `STRING_SPLIT(...)` and comments excluded), the local DDL file of each from repository SQL or `.agrimap-agent/knowledge/references/db-schema`, and `missing`/`includePatterns` (real services scan in 0.1–0.4 s). `context migrate`, only on an explicit request, exports the missing names through sql-context-pack (catalog → selected materialization → `sqlctx_export_batch` in batches of at most 25 → fetch/assemble into the registered db-schema folder → validate), checks again for tables behind newly exported procedures, and reports the owner's inventory-sync command; it never syncs `DB_METADATA_CONTEXT`, classifies, deploys, connects a profile or reveals values. `skill-routing.json` gains `migrateRule`/`migrateTools`, `sqlContextToolAllowed(name, {action: 'context-migrate'})` allows only those tools, and the hook, `sql-context-readonly.md`, `db-schema-context.md`, bootstrap `AGENTS.md` §0 and the maintainer `AGENTS.md` say so.
- agm-sql golden format for `context migrate` (owner decision 2026-10-15): sql-context-pack exports neutral DDL and `table_metadata` YAML, and agm-sql owns the golden layout. New `scripts/sql-golden-format.mjs` reads that YAML (sql-context-pack 3.1.0+; no regex parsing of DDL) and writes the DDL contract of `references/patterns/sql.md` — SET/GO header, schema and rerun guards, one TRY/CATCH transaction, uppercase types, golden group comments repeated when the physical column order leaves a group, then `ALTER TABLE ... ADD CONSTRAINT` defaults, `WITH CHECK`/`NOCHECK` FKs with `CHECK CONSTRAINT`, indexes with INCLUDE/WHERE and multi-line `sp_addextendedproperty`. Content is the database: types, constraint names (system names included) and column order never change; differences are `golden_deviation`, missing facts `metadata_gap` (blocking ones skip the table), and SQLFluff (pinned) reports `formatted N/N`, where only LT05 long data literals may remain. Path choice: golden files go to `.agrimap-agent/knowledge/references/db-schema/agm-golden/sql/<SCHEMA>/table/<TABLE>.sql`, a folder of their own beside the sql-context-pack export, so the export's managed files are never overwritten (a file with the `-- sqlctx-context:` header is preserved, and an output folder overlapping the export is refused); `db-schema-context.md` reads the golden copy first and `sql-context-scan.mjs` prefers it. sql-context-pack minimum for agm-* operations is 3.1.0; the MCP tool names are unchanged, so `migrateTools` and `sqlContextToolAllowed` stay as they are.
- sql-context-pack 3.3.1 (checked 2026-10-16 against 3.2.0, 3.2.1, 3.3.0 and 3.3.1; MCP tools, managed header and output format `2` unchanged): the minimum for agm-* operations and `context migrate` rises from 3.1.0 to 3.3.1, because before 3.3.1 SQL Server table catalogs failed every table with `DATABASE_OPERATION_FAILED` on a non-Latin1 database collation such as `Thai_CI_AS`. Golden formatting and the `references/patterns/sql.md` SQLFluff command also exclude `CV02`, as sql-context-pack 3.3.0 does, so `ISNULL` is never rewritten to `COALESCE` (different result type and evaluation). The `table_metadata` YAML fields read by `sql-golden-format.mjs` are unchanged since 3.1.0.
- Frontend core-first (owner decision 2026-10-14): `frontend-engineer.md` "Core-first for multi-screen work" — before two or more screens, list their parts; a part used by two or more screens (requested or existing) is built or extended first in `shared/`/`core/`/the library and the screens compose it; shared look or behavior changes once there, and copies across screens are reported with a consolidation proposal. Screens of the current request count as proven consumers. New eval scenario `fe-scenarios.md` S13; the QA FE token budget rises to 8,300 words / 22,200 tokens for this rule.
- Orchestration is decided every time (owner decision 2026-10-14): any plan, execution, Prompt Result or analysis with two or more units loads `subagents-and-branches.md` and states `Orchestration: sequential` or `N agents`. The Leader builds a work graph, fixes shared contracts first, runs disjoint units in parallel, never asks how many agents (at most five), and keeps a rolling queue — each finished job is verified and integrated and the next ready unit is dispatched at once instead of waiting for the whole wave. Subagent models come from `model-capability-matrix.yaml` `subagent_execution` (Claude haiku/medium → sonnet/low → opus/low; Codex GPT-6 Luna low → GPT-5.6 Terra low → GPT-5.6 Luna medium; Antigravity Gemini 3.8 Flash; host default without a model choice). `agm-plan` ends with that decision, and `agm-prompt` Subagent Assignments carry the job rules.
- A/B goal planning (owner decision 2026-10-16): every analysis, plan, Prompt Result and execution that breaks work into goals and tasks, one goal included, classifies goals by the real task graph with new `scripts/goal-graph.mjs` — entry tasks (no predecessor inside the goal), their transitive prerequisites, and a full-goal gate where an entry needs every task of a predecessor goal. A goal is A (`GA<n>`) when one entry has no gate, B (`GB<n>`) when every entry has one, each entry keeping its own gates; neither class means immediate or sequential. Missing references, cycles, a task in two goals and duplicate numbers block classification; the number is the identity and a class change is reported as a rename (`GA002 → GB002`). The script also returns ready tasks from the accepted list and warns about goals outside 3–8 hours (target 3–5, one day at most). New `goal-planning.md` holds the plan shape (Group A and Group B always shown, empty when empty) and the dispatch loop; agm-plan loads it always, agm-analyze, agm-prompt and agm-exec when goals or tasks are present, and `subagents-and-branches.md` points to it. Savepoint items start with the goal and task ID; no new file or `tasks/` directory.
- Ephemeral worktree, durable job context (`scripts/worktree-lifecycle.mjs`): `branch plan|apply --worktree --slug <s> [--into <branch>] [--parent-job <id>]` gives a parallel writer its own worktree `<repo>.worktrees/<job-id>` on `feature/<slug>-<id>` from the Leader's integrated tip; single-writer work keeps the normal branch. `integrate apply --job <id> --verification passed --evidence <checks>` merges the job into the Leader branch, writes the `integrated` audit event, then removes the worktree (`git worktree remove`, never forced) and the temporary branch — `-d` for proven ancestry, `-D` only after a rebase (`git cherry`) or squash (`merge-tree`) proof. A failed gate, an unpersisted context, a dirty or locked worktree, a conflict or a foreign job blocks cleanup; a per-job lock serializes it, a stale lock is taken over, and every `integrate` call first finishes interrupted cleanups of its Leader. Rework is a new job linked by `--parent-job`; a worktree is never reused.
- Work branches are `feature/<slug>` or `hotfix/<slug>` only (owner decision 2026-10-14): workflow profiles hold just these two work types; `branch plan --type fix|refactor|docs|chore` creates `feature/<slug>` and keeps the change type for the commit header (`fix:`, `comment:`, `ci:`). A policy written earlier is normalized on load (`WORK_TYPE_RETIRED` warning; `policy set` writes the normalized form) and `validatePolicy` refuses any other prefix. Guard G9 denies agent-typed `git switch -c`, `checkout -b`, `branch`, `branch -m` and `worktree add -b` with another prefix in product repositories, except protected and host branches and checking out an existing remote branch of the same name; the skill-package repository is exempt. Release gather still picks up `fix/*` and other branches created before 5.0.1. Bootstrap `AGENTS.md` §10.3 says so.
- Less recording: new v3 tracked work creates no `tasks/` directory (runs started earlier keep their `task.md` gate); reports are written only when requested (bootstrap `AGENTS.md` §9.3/§9.4); raw prompt history is local only — `prompts/` joins the managed `.agrimap-agent/.gitignore`, release never stages it, a tracked history raises `PROMPT_HISTORY_TRACKED` and the next release's final audit untracks it once with `git rm --cached` (files stay on disk). Logs, memory, changelog and runtime requester attribution are unchanged.
- Autonomy weight up: `autonomy.md` judges effects by reach and reversibility; R1 at low confidence and reversible R2 (work branch, develop/Inhouse) are decided and listed instead of asked. `decide card` auto-decides R0/R1 at high or medium confidence and R2 with `"reversible": true` without needing five prior signals; a kind the requester keeps overriding (calibration `ask`) or marks always-ask still asks.

## 4.11.0 — 2026-10-09

Supports sql-context-pack 3.0.0, which keeps sensitive data from reaching AI models: values come back as marked fakes, aliases, generalized or redacted values, and real values go only to the user through a reveal handoff.

- `sql-context-readonly.md` recipes (from `assets/skill-routing.json`): "representative data shape" filters on public columns only and says a quoted value marked `⟨FAKE|ALIAS|GENERALIZED|REDACTED|SCANNED…⟩` is not real; a new "real sensitive values" recipe relays `reveal_handoff` verbatim and never works around `QUERY_SENSITIVE_USAGE_RESTRICTED`. The supporting rule names sql-context-pack 3.0.0 or later and adds reveal of protected values to the prohibited operations.
- Guard G8: `git-guard.mjs` denies `sqlctx query --reveal` (also `python -m sqlctx` and `sqlctx.exe`) typed by the agent, so real sensitive values never enter an agent transcript. sql-context-pack itself already refuses `--reveal` without an interactive terminal; G8 is defence in depth and fails open like the other guards.
- Wording: "masked SELECT" becomes "protected SELECT" in AGENTS.md, `db-schema-context.md`, `sql-context-readonly.md` and the session context line in `hook-context.mjs`.

## 4.10.2 — 2026-10-05

`release-notify.mjs` passes the SonarQube scan; the copy maintained in `agmws-identity-netcore` becomes the bootstrap source.

- Commands (`git`, `reg`, `setx`) resolve only from explicit installation locations, never from inherited PATH or cwd.
- Same commands and output as 4.10.1 (`check`, `set-url`, `generate`, `send`).

## 4.10.1 — 2026-09-30

The Release Description is generated by a script, so every project gets the same shape and wording.

- `release-notify.mjs generate --version <x.y.z> [--from <ref>] [--to <ref>] [--project-name <name>] [--out <file>]` builds `# <repository> / <version>` plus one bullet per `feature:`/`fix:` commit header since the previous `v*` tag (version suffix removed, duplicates merged; `comment:`/`bump:`/`audit:`/`ci:` left out).
- `(เกี่ยวข้อง: …)` is added automatically from a `เกี่ยวข้อง:`/`Related:` commit-body line and from changed `AgriMap.*` NuGet (first two segments, e.g. `AgriMap.Platform`) or `@agrimap/*` references. Before, the agent wrote the text by hand, so the same Platform logging change read differently in `agmws-data-management-netcore` 1.0.23 and the Dynamic Dashboard 1.0.17 and only one listed `AgriMap.Platform`.
- `send` also reads a `เกี่ยวข้อง: …` line placed under a bullet instead of dropping it.
- `AGENTS.release.md` §8.2 and `release-notify.md`: generate only, never hand-write or reword; fix wording at the commit header.

## 4.9.10 — 2026-09-29

The Release Description always appears in the final answer in one fixed shape. 4.9.9 was never published; 4.9.10 carries it.

- Release Description output: the final answer of `release production|full` and `promote` always has a `description-released` block in the fixed shape `# <project> / <version>` followed directly by `- ` bullets (no blank line or extra text), whatever the notify outcome (AGENTS.release.md §8.2, release-notify.md, release-steps.md).

## 4.9.9 — 2026-09-29 (not published)

A release only cares about `develop`, `jenkins`, `jenkins-release` and its own work branch; a version mismatch never stops work. 4.9.8 was never published; 4.9.9 carries it.

- Release scope: `integrate gather` (and `release preflight`) default to scope `release` — the current work branch, this session's delivered branch and `--branches`. Other people's branches are no longer read, reported or asked about; `--scope all` keeps the old sweep. No gather card in release scope.
- Conflicts are resolved, not asked: a conflict between the own branch and develop returns `resolve` steps (merge develop into the branch, resolve keeping both intents, test, commit with Git's message, push, gather again). `release sync` now back-merges `jenkins`/`jenkins-release` content (hotfixes) into develop automatically and reports the files; a conflict there is also a resolve step on develop, never a question or blocker. The only remaining question is the Production confirmation.
- Bootstrap: a different `AGRIMAP BOOTSTRAP VERSION` is a warning, never a stop, and never needs `bootstrap upgrade`. `project-bootstrap apply` merges customized copy files automatically: `assets/bootstrap/template-lines.json` (normalized line hashes of every template version, generated by `npm run sync` from Git history) separates template lines from project lines; the new template wins and project lines stay in `PROJECT CUSTOM` blocks under their heading, with a backup. The merge is idempotent; apply writes everything it can and reports a still-conflicting file as `pending` instead of refusing.
- Notify URL: `release-notify.mjs` exit 2 returns a ready `question` (standard URL `https://appserv2.cdg.co.th/agrimap-notify/release-description` first, another URL, skip) to ask with the host question tool instead of plain text.
- Wording: commit descriptions and Release Descriptions keep technical terms the team knows as they are (header, `x-correlation-id`, API names) instead of vague Thai paraphrases (bootstrap AGENTS.md §10.6, AGENTS.release.md §5.2, release-notify.md).

## 4.9.8 — 2026-09-29 (not published)

A release finishes in one invocation when nothing needs a decision, `--flash` is lean again, and commit descriptions are Thai.

- `release preflight` (agm-workspace) fetches once and reports the three branch pairs, both owner pairs, the latest tag, dirty paths and finished work branches (M), with `autoActions`, at most three `questions` for one round, and `blockers`. It replaces a series of separate checks at R.
- `release sync plan|apply` builds history-preserving merge commits into local develop without pushing: a clean `origin/develop`, and `origin/jenkins`/`origin/jenkins-release` history that changes no file, so the `--ff-only` promotion works (owner decision 2026-09-29). Content-bearing back-merges become one preflight question (`--allow <branch>`); real conflicts stop only that step. It runs at R and again before the D push; a push rejected by a concurrent push is synced and retried at most twice without asking.
- M never stops a release: work branches that conflict with develop are reported under `⚠️ ต้องตามต่อ` without a question; after a candidate exists M only reports. This fixes the 4.9.6 wording that made an agent wait on three conflicting manual branches.
- `AGENTS.release.md` §6.5: one question round at R, automatic sync, no bootstrap upgrade in the middle of a release (a resumed release keeps its rules), records written with file tools, no intermediate audit commits. §6.2 names the two approved non-fast-forward exceptions.
- `--flash`: `release-flash.md` is a self-contained fast path built on preflight/sync; it reads only §2.3, §5.2, §6, §7 and §8.2 of the target `AGENTS.release.md`, loads `release-steps.md`/`release-tools.md` only for recovery, reuses .NET tool evidence up to 7 days, and targets about five active minutes. Its token scenario loads about 25% less than a full release.
- Production tag and notify: `release production`, `release full` and `promote` always create and push the annotated Production tag and send the Release Description (`AGENTS.release.md` §2.2, §7, §8.1, §8.2; `promote` now ends with N). Before, the target contract said only `Version + Tags` creates a tag and that `promote` never notifies, so a release that paused for Production confirmation and finished through `promote` skipped both (seen in `agmwa-platform-ng` 1.0.42). A newer bootstrap no longer blocks promote/tag/notify of a frozen candidate.
- Commit descriptions are Thai by default (policy `delivery.commitLanguage: "th"`): at least 30% of the description's letters are Thai, English stays for technical names. `deliver` refuses an English objective with a hint to pass a Thai `subject`; guard G7 and package CI apply the same rule. Bootstrap `AGENTS.md` §10.6 says `<คำอธิบายภาษาไทย>`.

## 4.9.7 — 2026-09-29

The skills know the AgriMap service matrix without being told.

- New `references/service-url-matrix.md`: gateway base per environment (Development/Inhouse `appserv2.cdg.co.th/agmws-gateway`, K8s.dev `agrimap-api.cdg.co.th/gw`, Production `agrimap-api.ldd.go.th/gw`, Staging unknown), tiers and namespaces, and every service, proxy and job with its gateway key and Kubernetes Service, including `agmws-plus-netcore`, `agmws-license-management-netcore`, `agmbo-cleansing-service-netcore` and `agmbo-cleansing-file-netcore`. Verified against the gateway `ocelot.<environment>.json` routes, FE environment files, service Jenkinsfiles and the infra Kubernetes base.
- The matrix deliberately holds no database endpoints, IP addresses, credentials or connection strings; a test fails if an IPv4 address or a database/storage endpoint appears in it.
- It loads automatically as a conditional reference of `agm-be`, `agm-exec`, `agm-diagnose`, `agm-analyze`, `agm-architect`, `agm-plan` and `agm-prompt` whenever a service/job URL, gateway route, Pod-to-Pod call, base path or health endpoint is in scope. The `be-main` checklist uses it for cross-service calls instead of the stale golden 030-13 table (whose job Service names were wrong); the `fe-main` checklist and `application-url-matrix.md` point to it. `agm-fe` and `agm-qa` reach it through those links to stay within their token budgets.
- Known gaps are recorded at the end of the matrix: no Staging route for license-management, no Kubernetes manifests yet for license-management and the cleansing jobs, no gateway route for `agmws-plus-proxy`, and no verified Staging public gateway.

## 4.9.6 — 2026-09-29

Team commit style is enforced, and releases gather finished work branches into develop.

- Commit style: `deliver` normalizes Conventional types in explicit input or in the subject (`feat(x):` → `feature:`, `docs:`/`refactor:`/`test:` → `comment:`, `chore:`/`build:` → `ci:`) and drops the scope; English Conventional headers pass only with policy `delivery.commitConvention: "conventional"`. `checkCommitHeader`/`teamHeader` in `git-flow.mjs` are the single check.
- Claude guard G7 (`git-guard.mjs`): in an AgriMap repository (workflow policy, `.agrimap-agent/` or the bootstrap marker) a `git commit -m/--message/-F` whose header is not `feature|fix|comment|bump|audit|ci: …` is denied with the header to use. Heredoc (`$(cat <<'EOF' …)`) and PowerShell here-string messages are read; Git-written merge/revert headers, editor, stdin and unresolved `$VAR` messages fail open.
- Bootstrap `AGENTS.md` §10.6 says the style is mandatory for every Agent commit (deliver, release, direct commit), bans `feat(x):`/`docs:`/`chore:`, and splits work of different types into separate commits. The core file stays within the 24,000-character diet.
- Release gather (M): `integrate pending` lists work branches not yet in develop as ready (delivered with AGM-Execution, tests passed), unverified, manual (no delivery trailer or product commits after it) or conflicting (`merge-tree` preview). `integrate gather plan|apply` builds Git merge commits into local develop without switching the worktree or pushing; ready branches merge without a question, unverified/manual need one card, conflicting branches are reported with their fix and never merged. Audit-only commits after a delivery keep a branch ready.
- `AGENTS.release.md` §6.4 and `release-steps.md`: prepare and release run M after the pending-work gate and before indexing/preparation; pipeline with a prepared candidate only checks pending work and asks once to re-prepare at the same version or leave new branches for the next release; promote gathers after T for the next round. The merges ship with the single D (or F) develop push. §6.3 names the content commit types and the `audit:` final commit. Post-delivery `.agrimap-agent` logs that block a switch to develop are committed on the work branch as `audit:`.
- Stop reminder: failed verification also triggers the one-time delivery reminder, because failed work still delivers to the work branch with `AGM-Verification: failed` (AGENTS.md §10.3).
- Package repository: `DEVELOPMENT.md` documents the same commit style, and package CI checks the non-merge commits of every PR (`tools/check-commit-style.mjs`, checkout with full history).

## 4.9.5 — 2026-09-28

Skill routing: the Agent picks the right skill without being told, in every repository and at the multi-repository workspace root.

- One routing registry, `skills/agrimap-agent-skills/assets/skill-routing.json`: lanes (`sql`, `be-main`, `be-library`, `fe-main`, `fe-library`) with their evidence, intents with Thai/English keywords and precedence, host invocation per host, and supporting packages. `npm run sync` renders `references/skill-routing.md`, bootstrap `AGENTS.md` §0 and the sql-context recipes from it; the validator fails on drift. A new package (the coming axiom) is added there, not in prose.
- Intent × lane instead of a domain-only table: single-lane explain/analyze/design/create/edit/refactor/test uses the lane skill; cross-lane changes use `agm-exec` and cross-lane analysis `agm-analyze`; finding a cause without a fix request uses `agm-diagnose`; plan, architect, QA, prompt, release and doctor keep their own skill. This removes the conflict between §0 ("one skill per lane") and the router ("never combine operation skills"): one operation skill per turn plus the lane references its entrypoint loads.
- Lane evidence order is file path/extension → repository name → request words. Broad words (table/ตาราง, view, column, index) count as SQL only with an object name or outside a frontend context, so "เพิ่มคอลัมน์ในตารางหน้า user list" in `agmwa-*` stays `agm-fe` and "แก้ function calculateTotal" never becomes SQL. The old first-match row no longer sends UI tables/views to `agm-sql`.
- Bootstrap `AGENTS.md` §0 is generated (heading now "Skill routing, Workflow และ Release"): host invocation per host (Claude Code `agrimap-agent-skills:agm-sql`, Codex `$agm-sql`, Antigravity `/agm-sql`), the lane and intent tables, and a `Skill · Lane · Golden` first line for answers as well as writes. The core file stays under the 24,000-character diet.
- Prompt hook: routing replaces the old SQL regex (it missed 10 of 11 realistic Thai prompts such as `ทำไม SP_ORDER_Q ช้า`, `แก้ UM_USER_I …`, `เพิ่ม index ให้ ORDER_H`). Each code/SQL request gets `Skill for this turn: <host invocation> (lane · intent → action)`, also outside a Git repository, and code questions without a change verb now activate it. General questions (`merge ยังไง?`) and quoted examples get nothing. The stale "AgriMap 3.0" line is gone.
- Claude skill gate (`PreToolUse` Edit|Write|MultiEdit|NotebookEdit, `scripts/skill-gate.mjs`): editing `.sql`/`.cs`/`.ts`/`.html` in an AgriMap repository without the lane skill (or `agm-exec`) loaded in the session is denied once with the skill to load; the retry passes, so a requester who declines skills is never locked out. Fail-open; `governance.skillGate:false` or `guards:false` turns it off. Codex and Antigravity: `not-supported-on-host`.
- Workspace root: `skill-routing.mjs workspace --cwd <folder>` plans (and with `--apply` writes) an `AGENTS.md` + `CLAUDE.md` for a non-Git folder holding several repositories, with a repository → lane table and the §0 matrix. It never overwrites a file the team wrote. The hook suggests it when the folder has none.
- sql-context-pack ownership (owner decision 2026-09-28): inside any `agm-*` operation it stays read-only supporting evidence; a direct owner request (`$sql-context-pack …`, or naming it with export/sync/classify/deploy) is that package's own turn under its approval gates, and AgriMap no longer injects a contradicting prohibition into that turn. `sql-context-readonly.md` now carries read-only recipes (capabilities → active profile → context index → `INFORMATION_SCHEMA` columns/parameters → bounded masked rows); `sqlctx_get_active_profile` joins the read-only tool guard.
- Skill descriptions name their triggers in Thai and English (for example `agm-diagnose`: หาสาเหตุ bug, error, 500, ช้า …) and drop most of the negative wording that suppressed automatic selection. The router description and `operation-index.md` point to the routing matrix.
- Release timing: `release-timing.mjs output` on an unfinished timeline now exits 0 and prints `Release timing: IN-PROGRESS` with a "Not final" line, instead of exit 1 that hosts showed as "Failed (exit 1)" during a healthy release. A missing or invalid timing file still exits 1. `release-timing.md` says `report` is the mid-run command and `output` follows `finish`.
- Tests: `skill-routing.test.mjs` (44 Thai/English routing evals, sql-context ownership, generated artifacts, hook in and outside a repository, workspace install) and `skill-gate.test.mjs`.

## 4.9.4 — 2026-09-28

Release Description notification fix. 4.9.3 reached main but was never published; its notify script could not deliver.

- Two notifications stay separate: the Jenkins build card (`POST /release`, sent by each Jenkinsfile, unchanged) and the AI Release Description, which now has its own agrimap-notify endpoint `POST /release-description`.
- `tools/agrimap/release-notify.mjs` (managed bootstrap file, replaced on upgrade) posts only `{projectName, version, environment?, items[{text, relatedProjects}]}`. An item ending with `(เกี่ยวข้อง: a, b)` lists the other projects it affects. Items are clipped to the service limits (50 items, 500 characters, 20 related projects).
- The health check uses `GET …/healthz`; 4.9.3 checked `/health`, got 404 and never posted.
- Set `NOTIFY_WEBHOOK_URL=https://appserv2.cdg.co.th/agrimap-notify/release-description`; the notify stack must be redeployed with the `/release-description` endpoint.
- Docs: `docs/USAGE.md` explains which commit type the Agent writes when (`feature|fix|comment` for work, `bump|audit|ci` for agm-release); the `AGENTS.release.md` example no longer uses an undefined `release:` type.
- `AGENTS.release.md` §8.2, `release-notify.md` and user docs describe both notifications and the `(เกี่ยวข้อง: …)` item format.

## 4.9.3 — 2026-09-25

Skill-first routing, team commit style, pending-work release and customer-facing Release Description with Teams notification.

- Bootstrap `AGENTS.md` §0 makes skill loading mandatory for every model before code/SQL work, with an evidence table: `agmws-*`/`agmbo-*` → `agm-be` (be-main), .NET libraries → `agm-be` (be-library), `agmwa-*` → `agm-fe` (fe-main), Angular library workspaces → `agm-fe` (fe-library), tables/SP/views/`.sql` → `agm-sql`. Golden format is the default from the first draft; a `Skill · Target · Golden` receipt line and a pre-delivery self-check are required.
- `agm-fe`, `agm-be` and `agm-sql` descriptions now name their triggers (agmwa/agmws/agmbo, Angular/.NET libraries, tables/SP/views) so hosts pick them without an explicit skill name.
- Prompt hook adds a domain skill line from the repository name/root markers and an `agm-sql` line when SQL intent is detected (the previously unused SQL intent detector is now wired in; `SP`, `procedures` and `ตาราง` are recognized).
- agm-release pending work: publishing commands (`release`, `pipeline`) now include all pending product work automatically, like group B `Version *`: dirty paths and unpushed develop commits become a reviewed content commit before the version commit. Work stays local only on explicit requester exclusion; secrets, ignored state and nested repos are always excluded and listed.
- After publication the final audit commit is pushed to develop once and verified, so develop ends clean and equal to origin. This replaces the 4.9.1 carry-forward (`--push-audit` is no longer needed); a develop-triggered pipeline, if configured, runs once more.
- Team commit style (bootstrap `AGENTS.md` §10.6): `feature:`, `fix:`, `comment:` plus a plain-language description an App Leader, BA or customer can read (at most 100 characters, no scope); agm-release commits use `bump:`, `audit:`, `ci:`. `git-flow.mjs` generates and validates this style (legacy English Conventional Commits in explicit input still pass); new workflow policies default to `commitConvention: agrimap`, `commitLanguage: th`.
- Release Description (`AGENTS.release.md` §8.2, `release-notify.md`): `release production|full` (including `--flash`) end with a plain-Thai `# <App> / <version>` bullet summary a BA can send to customers, naming the source project for changes from another project (e.g. `agmws-identity-netcore`). It is saved under `.agrimap-agent/reports/` and always shown in the final answer.
- Teams notification: new managed bootstrap file `tools/agrimap/release-notify.mjs` (`check`, `set-url`, `send --preview`). It reads `NOTIFY_WEBHOOK_URL`, checks `GET …/health` before every POST, asks once for the URL when it is missing and saves it as a user environment variable. Failures leave the release completed with notify `pending`. `--silent` (alias `--skip-noti`) skips sending only.
- Integration without MR/PR: new workflow policies default to `integration.method: local-merge` (also the fallback when no policy exists). `merge`/`รวม` merges into the target and pushes only after local verification passes; `pr`/`mr` still opens one on request. Existing confirmed policies keep their recorded method (switch with `agm-workspace.mjs policy set --key integration.method --value local-merge`).
- Fix: `start` no longer fails with `RUN_ID_COLLISION` when two runs start in the same second; a generated `ddHHmmss` ID moves to the next free second as bootstrap §9.2 requires (explicit `--execution` IDs still report the collision). This made `git-flow` CI flaky on Linux.
- Bootstrap manifest mode `managed`: the bundle owns the file and always replaces it (with backup) instead of reporting a merge conflict.
- Docs: `docs/RELEASE.md` no longer says `--flash` is unsupported on prepare/pipeline (supported since 4.9.1).

## 4.9.1 — 2026-09-22

agm-release fixes.

- `--flash` is accepted on `prepare inhouse|production` and `pipeline inhouse|production` (previously rejected); still rejected on indexing, promote and bootstrap. Pipeline with flash never creates a missing candidate.
- Single push per ref: develop, jenkins and jenkins-release are pushed at most once per invocation and the tag once, after all local commits are built. This stops the post-release develop audit push that started an extra pipeline per release.
- The final audit (history added after D, e.g. at confirmation) is committed locally on develop and carried into the next release's develop push; push it now only on explicit request (`--push-audit`).
- Local develop commits ahead of origin/develop and tracked agent recording (`.agrimap-agent/prompts/**/history.md`, logs, memory, reports) from earlier conversations are included in the release by default; only ignored/runtime state, secrets and requester exclusions are left out.

## 4.9.0 — 2026-09-19

Agent Collaboration Governance, phase P4 (spec §20.4; runbook `specs/acg-roadmap-4.7-4.9.md` §7).

- `git-guard.mjs` (Claude `PreToolUse`, matcher `Bash|PowerShell`): parses Bash and PowerShell command lines (`;`, `&&`, `||`, `|`, `&`, newline, backslash/backtick continuation, `git -C`) and denies force/mirror pushes (G1), pushes to protected branches outside a release execution (G2), add-everything and `.agrimap-agent/local` (G3), deletion of protected branches and tags (G5); asks for `reset --hard`, `clean -f`, `checkout -- .`, `restore .` (G4) and `stash` (G6). Fail-open with one stderr line.
- `delivery-reminder.mjs` (Claude `Stop`): blocks once per execution when verified work is not delivered under a policy that commits on completion; `stop_hook_active` never blocks.
- Hooks are generated only for Claude Code; Codex and Gemini/Antigravity are `not-supported-on-host` until their pre-tool formats are confirmed. The validator enforces this.
- `governance.guards` defaults to true (one-time switch of the earlier `false` default, `guardsDefault`); `false` makes both hooks no-ops.

## 4.8.0 — 2026-09-19

Agent Collaboration Governance, phase P3 (spec §20.3; runbook `specs/acg-roadmap-4.7-4.9.md` §6).

- Decision memory: `recall --topic --paths --kind` scores approved decisions (topic, area, scope glob, kind, age) from a cached index (`cache/decisions-index.json`), output at most 2,000 characters. Decisions now record `value`, `scope_paths` and `applies_when`.
- Every card (`decide card` and the git cards of branch/deliver/integrate) is checked first: an approved precedent with a matching option suppresses it (`suppressed`, counted as a question avoided); a calibrated R1 medium card is `autoDecided` unless the requester said "always ask" for that kind. `governance.decisionMemory:false` restores 4.7.0 behaviour.
- Learning under `runtime/` (never committed): `decide record` and `decide correction` write signals; the same value chosen twice becomes `promotable` (`decide promote`, one card per session; "not needed" is never offered again); per-kind R1 calibration (10 signals, n ≥ 5, 0.8 / 0.5); `decide always-ask --kind`; `decide list`.
- `complete` records `precedents` and `questions_avoided`.
- Hook session digest: at most three lines / 600 characters (target, branch, policy, mode, decisions, open execution), only when its hash changes; no git or network.
- Instruction diet: the bootstrap `AGENTS.md` core keeps §1, §3, §9, §10 and a short §2 (21,074 characters, from 61,058; includes the owner rule that explicit human instructions such as a chosen version take precedence over defaults but never over §3 safety invariants); §2 in full and §4–§8 moved verbatim to the new `AGENTS.release.md` with unchanged section numbers. Bootstrap installs it; an unmodified 4.7.0 template updates automatically.
- `governance.decisionMemory` defaults to true (one-time switch of the earlier `false` default, `decisionMemoryDefault`).

## 4.7.0 — 2026-09-19

Agent Collaboration Governance, phase P2 (spec `specs/agent-collaboration-governance-v2.md` §20.2; runbook `specs/acg-roadmap-4.7-4.9.md`).

- Spec Read Gate: `spec context --tasks|--query|--paths` returns at most eight files to read first (goal READMEs first), the matching task/requirement/acceptance items and the open questions that block them.
- Spec Sync Gate: `spec sync plan|apply` updates task status (the file's own status words; `statusMap` override; `STATUS_VALUE_NEW`/`STATUS_VALUE_UNKNOWN`/`TASK_STATUS_LINE_ADDED` are warnings), appends implementation evidence, the spec changelog and `manifest.sha256`, and writes each file through temp + rename keeping line endings. Evidence paths must be repository-relative. `--deviation` records a decision. Adapters: `morynth-context-index@1` and `generic-markdown`; spec-kit, kiro and openspec layouts fall back with `SPEC_FORMAT_FALLBACK`. YAML goes through a new line-based subset (`yaml-lines.mjs`), no dependency.
- `deliver plan` precondition 7: covered work returns `SPEC_NOT_SYNCED` as a self-fix; after a failed sync attempt the work still delivers with the warning. `--spec-na "<reason>"` skips it; `specs.enforcement: "block"` stops with `SPEC_SYNC_REQUIRED`. Delivery returns `specLine` for the summary and `SPEC_SOURCE_NOT_GIT` for a non-Git spec pack.
- A spec pack in its own Git repository is a second target root: sync links the execution there, it is delivered with that repository's policy (or `--explicit`), and the code delivery reports both commits.
- `spec check` reports manifest mismatches, missing evidence, done tasks without evidence and executions that touched spec scopes without a sync; the first `context` of a session in spec-first scope shows up to five of them (`openWarnings`).
- `spec semantic` stores the R2 card for a spec gap the work revealed; while it is open, sync warns `SPEC_DECISION_PENDING` and keeps the mechanical updates. `spec standing` turns a one-off "update the spec too" in a code-first project into the rule for every task (hybrid + sync auto for the touched directories) without asking, reported as decided for you.
- `governance.specSync` defaults to true; a 4.6.0 config still holding the unused `false` default is switched on once (`specSyncDefault`).
- Fix: audit written after a delivery (`logs/`, `memory/recent/`, `reports/`, `decisions/`) is no longer snapshotted as pre-existing work and is committed by the next delivery.
- `glab` merge request flags checked against glab 1.115: `--description-file`, and `--auto-merge=false` for a plain merge.
- Pre-write gate item 9 and the After-verification section of `spec-driven.md`; direct and required budgets are unchanged.

## 4.6.0 — 2026-09-18

Agent Collaboration Governance, phase P1 (spec `specs/agent-collaboration-governance-v2.md` v2.1).

- Resolve the target repository and its AGENTS chain before writing: new `agm-workspace.mjs context` (read-only unless `--ack`) returns the target root, the chain outer→inner with sha12, `readRequired`, stray `.agrimap-agent` roots, the project mode and resolved spec paths. The hook no longer archives prompts or reads config outside a Git root and points to `context` instead.
- Decide, ask or confirm by owner × risk × confidence (`references/autonomy.md`); `decide card|record` validate, render and store one Decision Card and apply its `recordAs` once.
- Team workflow policy `.agrimap-agent/policy/workflow.json` (`policy show|infer|init|set`): asked once per project, then a standing authorization to commit and push only the execution's work branch.
- `branch plan|apply` creates the work branch from `origin/<base>` without touching local protected branches; host worktree branches push under the team name. `start` snapshots pre-existing dirty files.
- `deliver plan|apply` stages exact own paths only, refuses protected branches, suspected secrets (values never shown), missing acknowledgement or changelog and machine-local path leaks, then commits (Conventional Commits, `AGM-Execution` trailer) and verifies the remote SHA. Failed or missing verification still delivers the work branch with `AGM-Verification` and a `DELIVERED_UNVERIFIED` warning; merge is not offered until it passes.
- `integrate options|plan|apply`: next-step card, PR via `gh` (`glab` flags unverified), compare URL fallback, or local merge through `commit-tree` and one non-force push. Short replies (`1`, `merge`, `รวมเข้า dev`, `pr`) resolve through `resolveShortIntent` and the hook; questions never trigger git actions.
- Development mode `.agrimap-agent/policy/project.json` (`project show|infer|init|set`) with machine-local spec paths in the Git-ignored `.agrimap-agent/local/memory.md` (`local show|set-path|note`).
- Audit logs are one file per execution (`logs/YYYY-MM/YYYY-MM-DD/<id>.jsonl`); `project.md` no longer accumulates completed work unless `memory.completedWorkInProjectMd` is true. Older daily logs stay readable.
- Bootstrap AGENTS template: §10 team workflow (repository, policy, delivery, short replies, development mode), `policy/**` allowlist, `local/**` exclusion and the new log path.
- Eight token-coverage scenarios; direct and required budgets are unchanged (prose was trimmed to fit).

## 4.5.5 — 2026-09-17

- Route golden patterns by detected target kind. `fe`, `be`, `sql` and `execute` now declare conditional references to a per-collection checklist; previously only one golden entry was reachable from any operation and `fe`/`sql` declared none.
- Add `references/patterns/checklists/` — the `MUST`-tier extract of each golden collection with the entry owning each rule and its detection command, so a collection is entered by rule instead of browsed through five hops.
- Define `MUST` verify / `SHOULD` justify / `FREE` decide tiers, making the existing structure-over-logic stance checkable without turning internal implementation choices into blocking questions.
- Load the frontend, backend and SQL pattern contracts in `execute`, which previously carried none for frontend or SQL work, plus the generated-API source and the delegation contract when Subagent assignments are dispatched.
- Stop the generated command prompts from classing golden material as background: a golden entry or checklist named by a matched conditional reference is required, not an optional example.
- Add pre-write gate item 6: name the checklist loaded, the entries actually opened, and every `MUST` row conflicting with project code. Evidence, not a remembered convention.
- Add six token-coverage scenarios for the new routing; adjust two regulated scenario budgets for the added governance prose. Direct and required budgets are unchanged.

## 4.5.4 — 2026-09-14

- Release results, including `--flash`, must display elapsed, active, excluded human wait and per-step timing. The helper renders the final block; missing or incomplete measurement is explicitly disclosed.

- Redact recognizable credentials and personal-data labels before recording prompt history, audit logs, memory and new Prompt Results; retain deterministic markers without raw-value sidecars.
- Sanitize workspace input before slug generation and checkpoint truncation, and preserve valid JSON, prompt hashes and retry deduplication.
- Document detection limits and manual-recording requirements; do not rewrite historical records, Git tags or application source files.

## 4.5.2 — 2026-09-14

- Measure release elapsed time separately from active per-step time, excluding requester/confirmation waits and disclosing unmeasured interruptions; persist timing across turns and retries.
- Include reviewed release-owned prompt history before the candidate commit and after confirmation in develop-only final audit publication; verify no eligible audit leftovers without changing the frozen release SHA/tag.
- Make completion checks explicit for every model and normal/flash flow; retain local-only and unrelated/ignored-content boundaries.

## 4.5.1 — 2026-09-13

- Add explicit delta-only release --flash for full, inhouse and production, including short aliases; skip full-project Backfill while retaining owner, verification, confirmation and publication safeguards.
- Reuse matching tool/bootstrap/test evidence, batch scoped release recording and resume successful publication checkpoints without duplicate pushes.
- Publish the owner-requested 4.5.1 version with regenerated host metadata and bootstrap version tracking; preserve prior published versions.

## 4.1.1 — 2026-09-11

- Reduce repetitive release confirmations: proceed with assessed, authorized routine steps and consolidate Production branch/tag approval into one concise action/evidence/impact/recovery summary.
- Reuse matching human approval across retries and resume; retain successful publication checkpoints without duplicate pushes. Reconfirm only missing or materially changed approval.
- Preserve scope, work-loss, access and server-review safeguards; document recovery commands as plans, not rollback authority or a promise to undo deployment effects.
- Document all six project bootstrap targets, receipt and backup paths in the doctor guide, including custom-rule preservation and unchanged-file behavior.
- Regenerate package metadata, bootstrap version tracking and provider documentation for 4.1.1; preserve published tags and release assets.

## 4.1.0 — 2026-09-10

- Add maintainer-only source governance and development/release/hotfix branches without changing product runtime release rules.
- Separate edit, commit/push, PR integration and publication authority; preserve same-directory development and all prior work.
- Add explicit runtime packaging allowlists, provider-specific archives, version/SHA catalogs and checksums; exclude source-maintainer instructions while retaining product bootstrap templates.
- Add PR verification and manual, exact-version publication workflows with immutable-version collision checks. Server protection configuration and publication remain separate authorized steps.
- Document exact-version selection, rollback limitations and evidence-based historical backfill; do not invent historical releases.
- Bump source and generated version metadata to 4.1.0 at the requester's direction; incorporate the previously prepared 3.7.0 changes below.
- Show the current package version in documentation and retain 24 evidence-backed historical source tags; exclude the test prerelease and unpublished 3.7.0 draft from historical releases.
- Restore 62 canonical golden Git blobs to the exact raw bytes already preserved by committed mirrors and manifest hashes; repair inherited LF/CRLF index drift without changing golden content or rehashing evidence.

## 3.7.0 — 2026-09-10 (prepared changes; publication not verified)

- Keep product release work in the requested repository directory. Check all three local/remote release branches before new artifacts, use safe fast-forward pulls, and remove automatic product cloning/worktree recovery from entrypoints, release steps and bootstrap governance.
- Fix project-bootstrap CLI positional command handling; exercise plan/apply/upgrade through the executable rather than only imported functions.
- Honor start --requested-by and share confirmed requester lookup between hooks/runtime, including unambiguous valid local session recovery, read-only requester inspection, and protection against expired/revoked/foreign/conflicting identity reuse.
- Clarify that feature/hotfix integration into develop is a separate scoped action, not an implicit capability or permission of the existing release command surface.

- Add agm-doctor with read-only status, version and compatibility/dependency checks, plus explicit host-scoped AGM updates and requested-version selection.
- Distinguish loaded versus installed package versions, verified source availability, workflow-specific missing dependencies and unknown checks; preserve local changes and recovery evidence during native host updates.
- Generate native Antigravity root plugin.json and flat Markdown operation skills. Replace current Gemini extension installation guidance with agy plugin install, retain GEMINI.md and legacy Gemini adapters/records, and state unverified host hook/MCP integration limits.
- Add agm-release bootstrap upgrade for backed-up bootstrap refresh and reviewed custom-rule preservation; retain legacy upgrade as explicit scoped contract replacement. Keep product versions, publication and host package installation outside bootstrap maintenance.
- Track reviewed custom bootstrap merges against exact target/source hashes and verified backups; invalidate approvals after content or bundle changes instead of repeatedly treating reviewed custom rules as fresh conflicts.
- Document every release action, owner-version precedence, Production-only notes/tags, prerequisite repair, dirty-checkout recovery, indexing/backfill, resume and concrete Production confirmation.
- Add complete doctor command/status tables to the doctor guide and Getting Started, with package-update versus project-bootstrap examples and host syntax.
- Bump package/manifests, bootstrap version tracking, tool-lock skillVersion and generated adapters to 3.7.0; retain prior changelog history and the SQLFluff dependency pin.

## 3.6.1 — 2026-09-09

- Make release indexing perform Project Backfill, including historical changelog, complete capability/evidence catalog and README capability/API inventory.
- Require proven reachable-history coverage, reuse complete prior evidence and reconcile durable outputs instead of completing with a scoped or Temp-only index.

## 3.6.0 — 2026-09-09

- Pin SQLFluff 4.2.2 in the distributed tool lock associated with the skill version.
- Verify before SQL formatting; reuse exact matches and automatically install or align mismatched versions, checking the actual executable after installation.

## 3.5.0 — 2026-09-09

- Add Antigravity CLI recording examples and provider metadata support while preserving legacy Gemini records and adapter compatibility.
- Separate host identity from actual model identity; replace speculative Gemini model examples with runtime-reported model IDs or unknown.
- SQL authoring continues to use SQLFluff with the T-SQL dialect and the existing scoped formatting/validation contract.

## 3.4.5 — 2026-09-09

- Recover release preparation from dirty or occupied caller checkouts using isolated develop worktrees or separate clones, preserving original changes and classifying migration artifacts by evidence.

## 3.4.1 — 2026-09-09

- Add explicit agm-release upgrade for scoped contract replacement with backups, version tracking and verification.
- Keep freshness checks in all nine release actions; explicit upgrade does not grant release publication or replace product files.

## 3.4.0 — 2026-09-09

- Track installed AGENTS.md contract version and compare it with the active skill before durable project work.
- Automatically migrate recognized legacy bootstrap templates with exact backups and receipts; preserve custom instructions and README content, and report unknown content for scoped reconciliation.
- Generate the version marker and bootstrap manifest from the package version to prevent tracking drift.

## 3.2.5 — 2026-09-09

- Surface owner-version precedence directly in the generated release skill, operation entrypoint and Gemini command, including the 1.0.8 / 1.0.5 case.
- Resolve legacy project PATCH-only restrictions during planning as well as execution without requiring bootstrap adoption or governance migration; re-read current contracts before repeating stale refusals.

## 3.2.4 — 2026-09-09

- Honor explicit owner Version/Patch targets per environment, including skipped patches and minor/major changes; PATCH+1 applies only when no target is supplied.
- Reconcile revised unfinished candidates without repeated version approval or a governance rewrite, preserving published history and tag collision checks.
- Permit scoped direct preparation with equivalent verification when the release CLI only supports PATCH+1; retain Production publication confirmation and report CLI incompatibility truthfully.

## 3.2.3 — 2026-09-09

- Release indexing/preparation now creates missing `.agrimap-agent/memory/project.md` and required recording directories from scoped evidence, then continues without a separate Project Backfill invocation.
- Align bootstrap preflight and lifecycle instructions with missing-memory recovery while preserving history and prepared-candidate safeguards for standalone pipeline/promote.

## 3.2.2 — 2026-09-09

- Integrate compatible missing bootstrap installation into scoped agm-release readiness before audit, with verification and continuation in the same invocation.
- Retain concrete adoption decisions for conflicting replacements, prepared-candidate boundaries, and Production/tag confirmation.
- Distinguish missing project files from CLI installation failures; keep Jenkinsfile reconstruction outside bootstrap.

## 3.2.1 — 2026-09-09

- Synchronize each release-stage branch with its remote using fast-forward-only semantics before evaluating publication gates.
- Re-evaluate synchronized SHAs and continue within the same invocation when the mismatch was only stale local state, avoiding unnecessary repeated `$agm-release` commands.
- Preserve safe stops for genuine remote divergence and re-confirm Production when its concrete candidate, destination or tag changes.

## 3.2.0 — 2026-09-09

- Define nine exact agm-release sequences with explicit prerequisites, owner-specific patching, resume checkpoints, Production confirmation and completion evidence.
- Restrict versioned release notes, release.md and tags to the Production candidate; Inhouse-only work updates its owner, changelog and project index.
- Add verified .NET Global Tool discovery/install instructions, PATH fallback and source-backed compatibility diagnosis for environment notes and planned tag metadata.
- Document model-independent execution for the requested model families without claiming cross-model behavioral certification; the external CLI and installed target contracts are not migrated by this package change.

## 3.1.0 — 2026-09-09

- Add agm-release with tool readiness and missing-tool installation guidance, indexing, patch preparation, pipeline publication, Production promotion, and full/environment release flows.
- Require confirmation of the concrete candidate before Production branch and annotated tag publication; pipeline production stops at the verified Inhouse checkpoint.
- Document every command, version owner, push destination, resume behavior, and confirmation boundary in the README.

## 3.0.1 — 2026-09-08

- Package the current v3 skills and documentation for local Codex plugin installation
- Clarify that the target repository AGENTS.md governs project work; the bundled contract is an installation source, not an automatic override
- Preserve the owner-supplied bootstrap AGENTS.md bytes and document remaining CLI-template/runtime compatibility limits; this patch does not migrate product repositories

## 3.0.0 — 2026-09-08

Major redesign of governance and runtime behavior.

- Replaced bootstrap project AGENTS with the complete owner-supplied canonical release/deployment/portable-recording contract; synchronized bundle hashes, thin pointers and supporting documentation
- Aligned group-B complete working-copy publication, separate content/version/final-audit commits, exact remote tag checkpoints and non-blocking pipeline status reporting

- Removed public agm-design, agm-simulate, agm-review and agm-history aliases and generated commands. Existing audit evidence/internal history tooling remain available.
- Design is now passive in all remaining operations: proactive supported recommendations, visible evidence gaps, separated facts/assumptions, justified confidence and conditional provisional advice; no fabricated details or automatic implementation.

- Intent-first hooks: unrelated questions and quoted commands do not open workflows; SessionStart is silent.
- Lazy state: no question task trees, one task.md for new tracked runs, optional separate reports, legacy history retained.
- Persistent confirmed user/workspace identity without the default daily prompt; authority remains separate.
- Prompt revisions require meaningful requester-backed changes; identical bodies are idempotent.
- Proportional verification with matching-evidence reuse; no automatic third-run full QA or one-correction-only policy for v3.
- Managed SQL context is metadata/SELECT only; database writes and routine execution are prohibited.
- Canonical bootstrap bundle and guarded idempotent installer, branch/version/release knowledge, main 1.0.0 and library 0.0.x distinction.
- Model profiles outcome/guided/bounded; provider labels are not capability rankings.
- Golden portability: restore 31 hash-proven LF files and refresh two curated-reference hashes to reviewed repository text; raw evidence hash checks remain strict.
- Breaking changes and compatibility details: docs/MIGRATION-3.0.md.
- Reorganized Thai user documentation into Getting Started, operation reference, 12 beginner recipes, workflows, release, troubleshooting and maintainer guides. Installation commands are separate from chat instructions and internal runtime commands.
- Added documentation link/anchor, example alias/action and distributed-mirror validation; updated generated help to match v3 execution authorization.

### Carried-forward database-context work

- Added `references/db-schema-context.md` as the owner of database evidence: owner DDL lookup by object name, the mandatory one-hop expansion from a stored procedure to the tables and `LUT_*` lookups it touches, and an ordered SP → table trace from a failing call to the exact condition, `THROW` code, and column that raised it.
- Routed that gate as a conditional reference from `analyze`, `diagnose`, `simulate`, `plan`, `design`, `architect`, `review`, `be`, `sql`, `qa`, `prompt`, and `execute`, so stored-procedure work can no longer be diagnosed or reviewed from application code alone.
- Added a `Database source of trust` gate to `backend-engineer.md`, made `analysis-discipline.md` name the db-schema path before declaring evidence missing, and gave `diagnose` an explicit instruction to open the procedure and its tables instead of stopping at the caller.
- Re-baselined token-coverage budgets for the added mandatory context and added a `diagnose-be-stored-procedure-light` coverage scenario plus contract regression tests.

## 2.1.0 - 2026-07-24

- Added a read-only stdio MCP server (`skills/agrimap-agent-skills/scripts/mcp-server.mjs`, declared in `gemini-extension.json` under `mcpServers.agrimap`) so Gemini can load bundled AgriMap contract and reference files that its workspace-sandboxed file tools cannot reach.
- Regenerated the Gemini `/agm-*` commands to load `lifecycle-core.md`, their operation entrypoint, and conditional references through the `read_reference` MCP tool instead of an unreachable workspace-relative path; Codex and Claude activation paths are unchanged.
- Wired the MCP server into package validation and added a unit test that exercises the initialize/list/call handshake, `../`-prefixed reference resolution, and traversal refusal.

## 2.0.0 - 2026-07-24

- Redefined passive capabilities as embedded supporting skills that contribute relevant knowledge, understanding, criteria, and decisions to both read-only and already-authorized write work without selecting the operation, granting write authority, or expanding scope.
- Renamed implicit action fallback from `explicit-or-passive` to `explicit-or-safe-default`, constrained every safe-default action to `product-read-only`, and added generator validation plus regression coverage for that boundary.
- Clarified that Main is the primary writer, integration owner, and accountability point for a coupled assignment rather than a global prohibition on bounded Subagents or independent QA verification.

## 0.1.8 - 2026-07-24

- Made concise task artifacts, current memory, and append-only audit logs mandatory for every activated operation at `light`, `standard`, and `regulated` depth; depth now controls coordination and QA rather than persistence.
- Added generated `AGRIMAP_EXPLICIT_ALIAS` markers so provider command expansion cannot hide a direct alias invocation from the activation gate.

## 0.1.7 - 2026-07-18

- Assigned cosmetic SQL indentation, alignment, wrapping, and whitespace to SQLFluff instead of model hand-formatting; semantic SQL structure remains enforced.
- Added an exact `format_set` gate: every changed SQL path must be formatted and the identical complete set validated, with `formatted N/N` reported before handoff.
- Kept resolved SQL slices of at most three artifacts direct/light in `agm-create-feature`; only unresolved or material persisted-data decisions escalate to `agm-create-prompt`.

## 0.1.6 - 2026-07-18

- Changed SQLFluff setup to lazy installation: format directly, install only on command-not-found, then retry once; parser/format errors never reinstall.
- Removed co-loaded prose duplication from BE/FE pattern and prompt-delegation references while retaining canonical owners and route-contract tests for every cross-reference.

## 0.1.5 - 2026-07-18

- Added a deterministic first-use SQLFluff prerequisite that installs when missing, verifies the command, and blocks SQL writes on failure without wrapping the formatter.
- Required temporary probes to use the OS temp directory with guaranteed cleanup; workspace `.tmp-*` directories are forbidden and ignored only as a safety net.

## 0.1.4 - 2026-07-18

- Made `agm-analyze` light output CLI-readable and required real project code, local db-schema, and representative examples/data shapes before conclusive database analysis.
- Exposed all five SQL refactor modes in the operation input and first missing-mode response instead of returning a recommendation alone.
- Standardized writer formatting on direct `sqlfluff format` commands for one file or a folder, with prerequisite installation only when missing and validation after formatting.
- Made a nonzero folder-format run explicitly incomplete: isolate changed files, correct only in-scope parse defects, and rerun the folder command before handoff; QA remains product-read-only and never runs or installs SQLFluff.

## 0.1.3 - 2026-07-18

- Made conditional-reference loading a fail-closed activation gate before inspection, tools, writes, or delegation across generated provider entrypoints.
- Added deterministic SQL contract preflight with verified golden selection, explicit `[agrimap_app]` enforcement, and an executable guarded `LUT_APP_MESSAGES` insert template.
- Closed SQL verification to shipped skill scripts and static inspection; ScriptDom, database/runtime checks, and QA-mode self-promotion are forbidden.
- Prevented direct `agm-create-feature` from invoking QA or agents and routed persisted-data contracts to `agm-create-prompt` before product writes.
- Reconciled the SQL golden manifest, removed two proven byte-identical copies, and bumped the package version so Codex does not retain stale aliases.

## 0.1.2 - 2026-07-16

- Made the normalized SQL golden contract authoritative over inconsistent project structure for new artifacts, with one object per canonical domain path and exact `messages.sql` handling.
- Added AgriMap lookup/general key types, audit fields, stored-procedure suffixes, guarded `LUT_APP_MESSAGES (ID, DESCR)` inserts, a deterministic SQL artifact validator, and cross-provider SQL scenarios.
- Captured the host-reported model in session hook context and propagated it to requester identification instead of reporting `unknown` when the host supplies a model.
- Standardized stored-procedure section comments for validation gates, transaction boundaries, numbered business steps, and `PO_DATA` returns, with deterministic validation.
- Distinguished SQL session actor (`SESSION_USER_ID`) from target subject (`USER_ID`) and documented their audit-versus-filter usage.
- Made QA direct/light by default, renamed tracked fast QA to light QA, restricted full selection to explicit triggers, and added a closed QA execution allowlist that forbids database/runtime validation.
- Made QA depth, mode, tools, and acceptance provider-neutral so reasoning-heavy model labels cannot silently broaden verification.
- Made `agm-create-feature` light/direct-only with no brief, checklist, QA, result, memory, or log artifacts; tracked feature work now starts with `agm-create-prompt`.
- Defined tracked feature artifact ownership and order as prompt contract (`brief.md`/`checklist.md`) → execution → QA (`qa.md`) → final Leader closure (`result.md`), with command-level premature-artifact guards.
- Added provider-neutral checkpoint compaction budgets so Fable/Claude detail does not produce larger memory/log state than Codex/GPT or Gemini.
- Split alias loading into `lifecycle-core.md` plus exactly one operation contract, with glossary/discipline references conditional.
- Added enforced `light|standard|regulated` workflow depth: light is stateless, standard omits separate QA, and regulated retains the full gate.
- Replaced atomic-task checkpoint guidance with four milestone types and command-level rejection of created/terminal checkpoint events.
- Added the curated request-value normalization golden contract for both BE main/library and routed analyze, diagnose, refactor-be, and QA to it conditionally.
- Reduced subagent fallback progress from per-step heartbeat writes to meaningful state transitions, with native threads remaining the primary trace.
- Added a lightweight lane for bounded work: no requester receipt, task artifacts, memory/log writes, separate QA, or delegation; scope growth promotes to tracked before further product writes.
- Centralized workflow-depth selection in `lifecycle-core.md` and regulated QA/correction/completion policy in `qa-and-done.md`, replacing copies in workflows, roles, delegation, and prompt references.
- Allowed one bounded in-scope correction plus a fresh full verification pass in the same tracked task; repeated or material/scope failures use terminal closure.
- Excluded the byte-for-byte generated plugin mirror from default ripgrep searches while retaining full package validation.
- Reduced `agrimap-agent-skills` to a routing-only skill; each of the 16 generated `agm-*` skills now owns exactly one operation and never falls back to the router for execution.
- Added a generated operation routing index and fail-closed `PACKAGE_ENTRYPOINT_MISSING` behavior for absent/corrupt compact contracts.
- Isolated Codex, Claude, and Gemini hook discovery so each host records only its own provider.
- Added runtime provider correction for stale cross-loaded Codex/Claude hook artifacts.
- Added a normative workflow glossary separating requester from decision-owner authority and defining substantive work, durable milestones, material/complex/small work, proportional verification, verification-only QA, the exact two-light-then-full QA counter, and configured versus actual model identity.
- Centralized task artifact fields, required sections, QA/full-release rules, templates, generated documentation, and completion validation in `assets/task-artifact-schema.json`.
- Added historical QA-counter enforcement, separate verifier identity checks, workflow-write/product-read-only evidence, and schema/template/docs contract tests.
- Replaced stale Codex subagent fallback guidance with the current native app/CLI/IDE workflow, including `/agent`, inspectable threads, descriptive labels, and a mandatory non-silent 60-second status cadence.
- Changed generated aliases and Gemini commands from umbrella reloads to compact runtime-core + glossary + operation-specific entrypoints generated from `config/operations.json`.
- Bumped the package version so provider-hook fixes replace cached `0.1.1` installations.

## 0.1.1 - 2026-07-16

- Split Codex and Claude plugin hooks into explicitly selected provider-specific files; Gemini retains its extension hooks.
- Added Gemini prompt rendering and model-capability routing without inventing a fixed live model name.
- Enforced QA mode, pattern evidence, separate implementation/QA identity, delivery boundary, and Outstanding items in task completion validation.
- Updated silent task-hook integration expectations and restored green workspace/package tests.
- Linked frontend scenario evals from the skill and wired their structural contract into the automated unit suite.
- Added tables of contents to long operational references for selective loading.
- Consolidated five non-parseable legacy response-shape `.json` fragments into one clearly labeled Markdown reference.

## 0.1.0 - 2026-07-14

- Created the `agrimap-agent-skills` umbrella workflow and `/agm-*` provider adapters.
- Added role/workflow contracts, explicit refactor modes, prompt delegation, QA gates, and task-level memory/logging.
- Added per-session requester attribution for multi-person projects.
- Added phase-aware Front-end Engineer workflow and reusable-artifact index tooling.
- Preserved legacy FE/BE/SQL coding examples with provenance and hashes, then removed legacy `.agm` governance.
- Added a canonical conflict matrix that separates corrected defects, project-dependent choices, and owner-required logical/data decisions without modifying raw examples.
- Added one-file/one-logical-contract writer ownership, workspace-mode detection, and Frontier-owned sandbox integration.
- Normalized `agmws` and `agmbo` as the only `backend_profile` values under `target_kind=be-main`; removed them from the target-kind dimension.
- Bound installation and package metadata to `orchex006/agrimap-agent-skills`; license remains pending golden-example rights confirmation.
- Added Codex plugin, Claude marketplace/plugin, and Gemini extension packaging.
- Made `package.json` the single package-version source of truth for all generated provider manifests and marketplace metadata.
