# AgriMap operation routing index

<!-- Generated from config/operations.json. Do not edit directly. -->

Use this file only to select one dedicated `agm-*` skill; pick by intent x lane in [skill-routing.md](skill-routing.md). It is not an execution contract.

| Dedicated skill | Operation | Purpose | Mode | Workflow depth |
| --- | --- | --- | --- | --- |
| `agm-doctor` | `doctor` | Check AGM installation versions, host compatibility and workflow dependencies, or update the selected host's AGM package | `action-routed` | default `light`; allowed `light`, `standard`, `regulated` |
| `agm-analyze` | `analyze` | Analyze scope, hidden problems, impacts, and trade-offs | `product-read-only` | default `light`; allowed `light`, `standard`, `regulated` |
| `agm-diagnose` | `diagnose` | Diagnose a problem to a proven root cause | `product-read-only` | default `light`; allowed `light`, `standard`, `regulated` |
| `agm-plan` | `plan` | Create a reverse-engineered execution plan | `product-read-only` | default `light`; allowed `light`, `standard`, `regulated` |
| `agm-architect` | `architect` | Design boundaries, contracts, and migration trade-offs | `product-read-only` | default `light`; allowed `light`, `standard`, `regulated` |
| `agm-fe` | `fe` | Analyze, design, create, edit, refactor, or explicitly test AgriMap Angular frontend work (agmwa-* apps, @agrimap/* libraries) in golden structure through one domain façade | `action-routed` | default `light`; allowed `light`, `standard`, `regulated` |
| `agm-be` | `be` | Analyze, design, create, edit, refactor, or explicitly test AgriMap .NET backend work (agmws-*/agmbo-* services, AgriMap.* libraries) in golden structure through one domain façade | `action-routed` | default `light`; allowed `light`, `standard`, `regulated` |
| `agm-sql` | `sql` | Analyze, design, create, edit, refactor, or explain AgriMap SQL work (tables, stored procedures/SP, views, .sql files) in golden format through one domain façade | `action-routed` | default `light`; allowed `light`, `standard`, `regulated` |
| `agm-qa` | `qa` | Verify an artifact under a product-read-only, execution-restricted QA contract | `verification-only` | default `light`; allowed `light`, `standard`, `regulated` |
| `agm-prompt` | `prompt` | Analyze and refine requester intent into one immutable versioned Prompt Result with explicit Main and Subagent ownership | `workflow-write-only` | default `light`; allowed `light` |
| `agm-exec` | `execute` | Implement an authorized objective, approved Prompt Result, or resumable task with proportional verification and scoped delivery | `product-write` | default `light`; allowed `light`, `standard`, `regulated` |
| `agm-release` | `release` | Upgrade project bootstrap while preserving custom rules, replace contracts explicitly, index projects, prepare versions, publish Inhouse pipelines and promote Production | `product-write` | default `light`; allowed `light`, `standard`, `regulated` |

After selecting one row, hand off to that skill and stop the router. One operation skill per turn: its entrypoint loads the lane references it needs, and cross-lane changes use `agm-exec`. Load a second operation skill only when the requester asks.
