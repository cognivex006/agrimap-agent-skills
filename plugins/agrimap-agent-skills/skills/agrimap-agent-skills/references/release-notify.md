# Release Description and team notification (N)

Applies to `release production`, `release full` (with or without `--flash`) and `promote`, every time the Production tag checkpoint (T) is verified, including a release that paused for an anomaly answer or a stop condition and finished through `promote` or a resume. Send once per version. `release inhouse`, `pipeline` and `prepare` never notify. The target's AGENTS.release.md §8.2 owns the wording rules; follow it when present. This is the AI summary card (`POST …/release-description`: project name, version, items with related projects); the Jenkins build card (`POST …/release`) is sent by each Jenkinsfile and is not the Agent's.

## Flags

`--silent` (alias `--skip-noti`) is a bare modifier accepted only on `release production|full` and `promote`; it may precede or follow the command words and combines with `--flash`. It skips sending only. Reject it on other actions, valued or duplicated, before writes.

## Write the description

Generate it; never hand-write or reword it, so every project gets the same format and the same change reads the same across projects:

```text
node tools/agrimap/release-notify.mjs generate --version <Production version> --out .agrimap-agent/reports/YYYY-MM/<RUN_ID>-release-description.md
```

1. Items are the `feature:`/`fix:` commit headers (team style, Thai) since the previous `v*` tag (`--from`/`--to` override), without the `(x.y.z)` suffix, duplicates merged, in commit order; `comment:`/`bump:`/`audit:`/`ci:` are left out.
2. Header `# <repository name> / <version>` (`--project-name` only when the repository name is wrong).
3. `(เกี่ยวข้อง: …)` is added automatically from a `เกี่ยวข้อง:`/`Related:` line in the commit body and from changed `AgriMap.*` NuGet (named by its first two segments, e.g. `AgriMap.Platform`) or `@agrimap/*` package references.
4. A wrong or unclear item is fixed at its source (commit header wording for the next release), not by editing the generated file. Exit 1 `RELEASE_DESCRIPTION_EMPTY` means no `feature:`/`fix:` commit in range: report it, do not invent items.
5. The file is carried by the F `audit:` commit.
6. The final answer always has a `description-released` heading followed by the full text in a `markdown` code block, whether notify is sent, pending or skipped (`--silent`). Missing it means the release is not `completed`.

```markdown
# <project> / <version>
- xxx
- yyy
- zzz
```

## Send

Unless `--silent`, run from the target root after F:

```text
node tools/agrimap/release-notify.mjs send --description <file> --environment Production
```

The script checks `GET …/healthz` before POST. Missing `tools/agrimap/release-notify.mjs` is a bootstrap freshness repair (managed file), not a reason to skip.

| Exit | Meaning | Action |
| --- | --- | --- |
| 0 | `sent: true` | Report `notify: sent`; never send again |
| 2 | `NOTIFY_WEBHOOK_URL` (…/agrimap-notify/release-description) not set | Ask once with the host question tool (Claude AskUserQuestion, the Codex/Antigravity equivalent; plain text only when none) using the script's `question`, standard URL first; run the chosen `set-url`, then `send` again in this invocation |
| 3 | Health failed | Report `notify: pending (health HTTP <status>)` and the resend command; no POST was made |
| 4 | POST failed or unknown | Report `notify: pending` with the status; if `sent` is `unknown`, ask before resending |

Notification never changes release success, branches, tags or versions. Do not retry in a loop.
