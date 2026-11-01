# Compact operation entrypoint: agm-doctor

<!-- Generated from config/operations.json. Do not edit directly. -->

- Operation: `doctor`
- Workflow depth: default `light`; allowed `light`, `standard`, `regulated`
- Mode: `action-routed`
- Purpose: Check AGM installation versions, host compatibility and workflow dependencies, or update the selected host's AGM package and its installed companions (golden-lint, sql-context-pack).
- Deliverable: evidence-backed readiness report or verified package update; never a product release or host upgrade

No arguments means read-only status. version and check are read-only too: no identity question, lifecycle, installation, cache refresh or project bootstrap. Only an explicit update authorizes changing the selected host's AGM installation. Resolve host from runtime evidence, never from the model name. --host gemini identifies legacy Gemini only, not Antigravity; explain migration without changing either installation. Use doctor-workflow.md; do not load product release prerequisites.

## Action gate

Resolve exactly one action before target inspection or product writes. Safe defaults are read-only; fallback is action routing, not a passive capability. Capabilities support the chosen read or authorized write but cannot choose it or create write intent.

| Action | Mode | Activation | Allowed depth | Purpose |
| --- | --- | --- | --- | --- |
| `status` | `product-read-only` | `explicit-or-safe-default` | `light`, `standard`, `regulated` | Summarize installed AGM version, host and readiness without mutation |
| `version` | `product-read-only` | `explicit-or-safe-default` | `light`, `standard`, `regulated` | Compare installed and available AGM versions with source and freshness evidence |
| `check` | `product-read-only` | `explicit-or-safe-default` | `light`, `standard`, `regulated` | Inspect compatibility, configuration and dependencies by workflow |
| `update` | `product-write` | `explicit` | `light`, `standard`, `regulated` | Update only the selected host's AGM package to the verified requested or available version |

## Inputs and help

- Required: current AGM installation or an explicitly selected host.
- Conditional: --host codex|claude|antigravity (agy alias) when selecting another host; --to <version> for a pinned update.
- Minimal example: `$agm-doctor check`

## Execute this contract

1. Resolve status (default), version, check or explicit update and the selected host. --to is valid only for update; reject unknown actions/options without mutation. Missing host evidence leaves the dependent update unresolved; continue independent read-only checks.
2. Follow doctor-workflow.md to inspect installed paths/manifests, host help, workflow-specific dependencies and source provenance. Report ready, recommended, missing-required or unknown for each capability; a missing SQL dependency does not fail unrelated FE/BE work.
3. For update, prepare and validate the exact replacement and recovery path before native host installation. Preserve local modifications, user configuration and other hosts. Verify installed version/path after success and distinguish a fresh installation from the still-loaded session. Stop dependent steps on failure; never claim a repository sync updated a cached plugin.

## Load now

- [doctor-workflow.md](../doctor-workflow.md) — host discovery, read-only checks, package provenance and scoped update procedure
- [goal-rules.md](../goal-rules.md) — bounded changes and proportional verification
- [recommendations.md](../recommendations.md) — evidence-calibrated readiness and repair advice

## Load only when the condition matches

- When you are about to ask the requester a question: [autonomy.md](../autonomy.md) — ask only requester-owned material choices, with a decision card

Do not read the router `SKILL.md` during operation execution. If this generated entrypoint is missing or corrupt, stop with `PACKAGE_ENTRYPOINT_MISSING` and ask for package sync/reinstallation; never broaden into the router.
