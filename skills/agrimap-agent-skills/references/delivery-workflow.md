# Delivery workflow — risk-weighted, end to end (6.0)

How durable work moves from a request to production and back into the rules. The depth chosen at triage decides which steps run and how heavy each one is. A light task finishes in minutes; a regulated one keeps every gate. Lighter depth drops ceremony (documents, approvals, breadth of checks), never correctness: the [invariant floor](#invariant-floor) runs at every depth. Delegation details: [subagents-and-branches.md](subagents-and-branches.md).

## Contents

- [Triage](#triage)
- [Invariant floor](#invariant-floor)
- [Steps A–O](#steps-ao)
- [Which steps each depth runs](#which-steps-each-depth-runs)
- [Gates between steps](#gates-between-steps)
- [Escalation](#escalation)
- [Human decision points](#human-decision-points)
- [Examples](#examples)

## Triage

Before the first write, answer four questions and announce the result in the first line of the reply, with one reason:

1. Does it touch a public contract (API, DTO, route, message code), security/auth, personal data, schema/DB, production or something already published? Yes → **regulated**.
2. Does it cross lanes (FE+BE, BE+SQL) or change code that has callers outside the edited file? Yes → at least **standard**.
3. Do tests cover the code being changed? No → one level heavier.
4. Is "done" known as a check that can run? No → clarify (step C) before writing anything.

Mechanical, behavior-preserving work inside one lane with a runnable check is **light**. Depth equals the heaviest signal, not an average and not the file count: deleting unused imports in 50 files is light; one line in token validation is regulated.

> **Depth: standard** — changes `handleLoginFailure` signature; one caller in `login()`; auth facade spec covers it.

The requester can correct the depth at once; that is cheaper than correcting the work.

## Invariant floor

Runs at every depth, including a one-line change. Each item takes seconds to minutes.

1. Read the real state: branch, `git status`, the current file. Shared folders change under you.
2. Load the rules for the language being written (lane checklist and `patterns/sonarqube/<language>.md`).
3. Self-gate on every file written or edited, tests included: no unused import/local/dead store, TODO, commented code, nested ternary, bare suppression; a tool-suggested fix keeps the original logic; no logic copied where a helper exists.
4. Run the cheapest check that proves the change (build or the touched tests at minimum).
5. Report what was verified and what was not, separately.
6. Nothing irreversible without authority.

## Steps A–O

| Step | Purpose | Output | Owner | Skill / tool |
| --- | --- | --- | --- | --- |
| A Intake | Receive the request (BA, user, scan, bug) | Raw request | Human | — |
| B Triage | Four questions → depth | Depth line + reason | Agent proposes, human may correct | — |
| C Contract | What changes, what "done" means as a runnable check, what must not be touched | Contract / acceptance criteria | Agent drafts, human confirms | `agm-prompt` |
| D Analyze | Impact, callers, lanes, options; root cause for a bug | Impact summary + chosen approach | Agent; human chooses at regulated | `agm-analyze`, `agm-architect`, `agm-diagnose` |
| E Plan | Units provable by one check each, order, rollback points | Unit list / work graph | Agent | `agm-plan` |
| F Prepare | Fresh base, real state, work branch (worktree only for parallel writers) | Clean branch | Agent | git, `branch apply` |
| G Implement | Per unit: load rules → test → change → self-gate → unit check → commit | One commit per unit | Agent / Worker | `agm-fe`, `agm-be`, `agm-sql`, `agm-exec` |
| H Verify | Lint, build, full tests of touched projects; SonarQube when configured | Actual results | Tools | npm, dotnet, Sonar |
| I PR | PR with: what changed, behavior change yes/no, verified / not verified | PR | Agent opens, human reads summary | `gh` |
| J Integrate | Merge into develop; resolve conflicts without overwriting unrelated work | New develop | Agent | git |
| K Inhouse | Publish develop to Jenkins Inhouse | Inhouse build | Agent within authority | `agm-release` pipeline inhouse |
| L Accept | Test against the step C criteria on the real environment | Pass/fail + evidence | QA/BA + agent | `agm-qa` |
| M Production | Version, changelog, promote | Production release | Human approves, agent runs | `agm-release` production/promote |
| N Observe | Logs, error rate, main-branch Sonar, user feedback after release | Post-release note | Agent + human | logs, Sonar |
| O Learn | New or recurring finding → Golden rule (stable ID) → write-time checklist → lint rule when machine-checkable | Rule change proposal | Agent proposes, owner decides | this package, golden-lint |

## Which steps each depth runs

`●` full · `◐` short form · `—` skipped

| Step | light | standard | regulated |
| --- | --- | --- | --- |
| B Triage | ● one line | ● | ● |
| C Contract | ◐ one sentence in chat | ◐ three lines in chat | ● versioned Prompt Result |
| D Analyze | — | ◐ callers / root cause | ● cross-lane options; human chooses |
| E Plan | — | ◐ unit list in chat | ● work graph with rollback |
| F Prepare | ● | ● | ● |
| G Implement | ● one unit | ● units | ● units per plan |
| H Verify | ◐ build/tests of what was touched | ● lint + project tests | ● + SonarQube + consumer tests |
| I PR | ◐ short, may batch | ● | ● + human reviews decisions |
| J Integrate | ● | ● | ● |
| K Inhouse | ◐ with the next run | ● | ● |
| L Accept | — | ◐ when users see the result | ● against every criterion |
| M Production | ◐ with the next release | ● | ● human approval |
| N Observe | — | ◐ | ● |
| O Learn | ◐ only for a new finding | ◐ | ● post-review after an incident |

Light work typically runs A → B → F → G → H → J and rides the next release. Record-keeping per depth (memory, savepoint, task record) stays as in [lifecycle-core.md](lifecycle-core.md).

## Gates between steps

| Before | Requires |
| --- | --- |
| G Implement | "Done" is a runnable check; branch and file state confirmed |
| I PR | Step H passed on actual runs, not on expectation |
| K Inhouse | develop builds |
| M Production | Step L passed; version and changelog ready; human approval |
| Closing | Summary separates verified from not verified |

## Escalation

Stop and announce when a signal appears mid-way, then run the steps of the new depth before continuing:

- a smell fix needs a binding, URL, contract or behavior change;
- a tool-suggested fix would change the logic (CA1862 inverting a lowercase check);
- the touched code has no tests;
- a file outside the agreed scope must change;
- a caller or consumer appears that the analysis missed.

> ⚠️ **Escalating light → standard:** the CA1862 suggestion makes the lowercase check always pass; rewriting the condition and adding an uppercase test.

Escalating to standard: announce and continue. Escalating to regulated: wait for the human. De-escalating needs evidence (for example the change proved FE-only) and is announced too; never de-escalate for speed.

## Human decision points

The only places a human is required. Everything else follows existing authority ([autonomy.md](autonomy.md)).

| Point | When |
| --- | --- |
| C contract | standard and regulated (light: the depth line) |
| D approach | regulated |
| I PR summary | standard when behavior changes; regulated always |
| L acceptance | when users see the result |
| M production | always |
| Anything irreversible | every depth |

## Examples

| Work | Depth | Why |
| --- | --- | --- |
| Remove unused imports in 10 files | light | mechanical; build proves it |
| `handleLoginFailure` → `Promise<void>` | standard | internal signature with a caller; ordering of `await` matters |
| CA1862 on `previewHash` | light → standard | the suggested fix inverts the check |
| Forwarded-header trust (SEC-31) | regulated | security, every environment, caused a production 500 before |
| Package release | regulated | published artifacts are irreversible |
