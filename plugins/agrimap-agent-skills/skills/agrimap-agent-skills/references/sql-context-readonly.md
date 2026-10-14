# sql-context-pack: read-only supporting capability

Use when a task needs exact schema/metadata or bounded protected data that local authoritative references cannot answer. Local `sql/**` files and `.agrimap-agent/knowledge/references/db-schema/**` come first ([db-schema-context.md](db-schema-context.md)). Do not create a new AgriMap task for retrieval.

## Who owns the turn

<!-- AGM-SQL-CONTEXT:START -->
<!-- Generated from assets/skill-routing.json. Do not edit directly. -->

- Supporting: Inside any agm-* operation sql-context-pack (3.0.0 or later) is supporting evidence only: its read-only tools and recipes (metadata and protected SELECT). No DDL/DML, EXEC/CALL, metadata sync, classification, routine deployment or reveal of protected values; export only through agm-sql context migrate.
- Owner turn: A direct owner request to sql-context-pack (its invocation, or naming it with an owner operation) is that package's turn: follow its own SKILL and approval gates. AgriMap adds no authority, lifecycle or prohibition to that turn and never runs those operations inside an agm-* operation. Owner operations: export/catalog capture, DB_METADATA_CONTEXT sync, folder classification, context generation, routine deployment, profile connect/change, SQLFluff install/update.
- Context migrate: agm-sql context migrate (owner decision 2026-10-14; the requester asks for it explicitly) may run the catalog/export tools to write the DDL of the objects this repository uses, and the tables one hop behind them, into the registered db-schema managed folder. It never syncs DB_METADATA_CONTEXT, classifies, deploys, connects or changes a profile, or reveals values; it reports the owner's inventory-sync command instead. Tools: `sqlctx_get_capabilities`, `sqlctx_get_active_profile`, `sqlctx_list_managed_folders`, `sqlctx_list_context_index`, `sqlctx_create_catalog`, `sqlctx_get_catalog_status`, `sqlctx_get_materialization_plan`, `sqlctx_list_sitemap`, `sqlctx_export_batch`, `sqlctx_get_export_status`, `sqlctx_list_exports`, `sqlctx_validate_exports`.
- Owner invocations: `$sql-context-pack`, `/sql-context-pack:sql-context-pack`, `/sql-context-pack`, `$sql-content-pack`; naming the package with an owner operation counts too.

| Need | Read-only recipe |
| --- | --- |
| readiness and the connected profile | `sqlctx_get_capabilities`, then `sqlctx_get_active_profile`; no profile means a named gap (never connect, change or inherit a profile to answer) |
| which objects exist for a domain, context or tag | `sqlctx_list_context_index` with type/context/tag filters; read every page until `next_cursor` is null |
| columns, types and nullability of a table or view | `sqlctx_query_data` on `INFORMATION_SCHEMA.COLUMNS` filtered by exact `TABLE_SCHEMA`/`TABLE_NAME` |
| procedure or function parameters | `sqlctx_query_data` on `INFORMATION_SCHEMA.PARAMETERS` filtered by exact `SPECIFIC_NAME` |
| representative data shape | `sqlctx_query_data` with an explicit column list, a narrow WHERE on public columns only and `TOP` at most 500; columns marked `⟨FAKE|ALIAS|GENERALIZED|REDACTED|SCANNED…⟩` hold no real values, so say a quoted value is fake |
| real sensitive values (names, national IDs, phones, accounts, addresses) | never obtain them; relay the result or error `reveal_handoff` (`sql`, `user_steps`) verbatim so the user runs it outside the session; never run `sqlctx query --reveal` or rewrite a query around `QUERY_SENSITIVE_USAGE_RESTRICTED` |
| which tables and procedures this repository uses, and which DDL is missing locally | `agm-sql context check`: `scripts/sql-context-scan.mjs --cwd <repo>` (read-only, no database) |
| full DDL or routine body | read local `sql/**` or db-schema references first; if missing, name the gap and offer `agm-sql context migrate` (run it only when the requester asks); never materialize it from any other AgriMap operation |

Read-only tools: `sqlctx_get_capabilities`, `sqlctx_get_active_profile`, `sqlctx_list_context_index`, `sqlctx_list_managed_folders`, `sqlctx_query_data`.
<!-- AGM-SQL-CONTEXT:END -->

Read only the query and context-index parts of the installed sql-context-pack SKILL while supporting an agm-* operation; its export, sync, classification, generation and deployment routes belong to an owner turn, except the export steps `agm-sql context migrate` runs.

## agm-sql context check and migrate (5.0.1)

1. check: `node scripts/sql-context-scan.mjs --cwd <repo>` lists the procedures/tables the code and local SQL use, the local DDL file of each, and `missing`/`includePatterns`. Read-only, no database.
2. migrate (explicit request only): readiness and active profile (a missing profile is a named gap); the registered db-schema folder from `sqlctx_list_managed_folders` (none registered: give the owner its register command and stop); `sqlctx_create_catalog` with exactly `includePatterns` and `selected` materialization; poll status; read the materialization plan and sitemap; `sqlctx_export_batch` with those object ids, at most 25 per batch; poll; `sqlctx export fetch`/`assemble` into that folder and `sqlctx_validate_exports`.
3. Run check again; export newly found tables behind exported procedures once. Report used/local/missing before and after, each skipped or failed object, and the owner's `$sql-context-pack` inventory-sync command — migrate itself never syncs, classifies, deploys or reveals.

## Boundaries inside AgriMap operations

Use only the current conversation's explicitly connected profile and its allowed scope. Never inherit another room's profile or request credentials. Search exact object names, read index pagination to completion, preserve source/profile/object identity and freshness.
Permitted: capabilities, active profile, metadata/context index, registered-folder listing, relational SELECT via sqlctx_query_data with protected output (marked fakes, aliases, generalized or redacted values; never real sensitive values) and at most 500 rows.
Do not invoke CREATE/ALTER/DROP/INSERT/UPDATE/DELETE/MERGE/TRUNCATE, EXEC/CALL, SELECT INTO, procedure/function execution, routine deployment, metadata sync, owner-resolution apply or any database write. This restriction holds for all users/models/depths within AgriMap operations; a supporting skill cannot expand it.
Do not auto-run exports that materialize files (outside an explicit context migrate), classify/apply folders, install tools or change profiles merely to answer a query. Missing profile/service/evidence is a named gap; continue independent work. No direct database connection fallback.
The managed service's read-only profile and query parser are authoritative. scripts/governance-policy.mjs supplies a conservative tool/query guard for adapters; this package does not proxy arbitrary SQL or grant database permissions.
