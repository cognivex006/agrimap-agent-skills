# Skill routing: intent x lane

<!-- Generated from assets/skill-routing.json. Do not edit directly. -->

Select exactly one AgriMap skill before answering about, reviewing or changing repository code/SQL. The request does not have to name a skill. Questions still load the lane skill for its golden references; they create no lifecycle, task files or tests.

## 1. Lane

Resolve from evidence in this order: file path/extension → repository name/root markers → words in the request. Broad words (table/ตาราง, view, column, index, store, schema) count as SQL only with an object name (`UPPER_SNAKE`) or outside a frontend context. `function` alone never means SQL.

| Evidence | Lane → skill |
| --- | --- |
| `*.sql`, `sql/**`, `LUT_*`, `*_I/_U/_D/_Q`, `[agrimap_app]`, SP/DDL | `sql` → `agm-sql` |
| `agmws-*`, `agmbo-*` | `be-main` → `agm-be` |
| `AgriMap.Platform.*`, `libraries/netcore/**`, csproj ไม่มี web host | `be-library` → `agm-be` |
| `agmwa-*`, Angular app (`src/app/`) | `fe-main` → `agm-fe` |
| `projects/<lib>/`, `@agrimap/*`, `libraries/angular/**` | `fe-library` → `agm-fe` |

Golden collection per lane: `sql` `golden/sql/`, `be-main` `golden/backend-main/`, `be-library` `golden/backend-libraries/`, `fe-main` `golden/frontend-main/`, `fe-library` `golden/frontend-libraries/`.

## 2. Intent

| Intent | Skill |
| --- | --- |
| อธิบาย / วิเคราะห์ / review / ออกแบบ | lane skill (`analyze`/`explain`/`design`); cross-lane `agm-analyze` |
| สร้าง / แก้ / แก้ bug / refactor / เขียน test | lane skill (`create`/`edit`/`refactor`/`test`); cross-lane `agm-exec` |
| หาสาเหตุ bug / error / ช้า (ยังไม่สั่งแก้) | `agm-diagnose` |
| วางแผน | `agm-plan` |
| ออกแบบระบบ / contract ข้าม service | `agm-architect` |
| ตรวจรับ / QA | `agm-qa` |
| กลั่นโจทย์เป็น Prompt Result | `agm-prompt` |
| version / changelog / release / Jenkins | `agm-release` |
| ติดตั้ง / อัปเดต skills | `agm-doctor` |

Precedence when several intents match: doctor > release > prompt > plan > architect > qa > refactor > test > change > diagnose > read. A fix request (แก้/fix) is a change even when it mentions an error; diagnose is for a cause without a fix request. Lane evidence without a verb takes the read-only `read` path; a request with neither is not code work. Outside any lane the lane-free intents still apply; otherwise use the router `agrimap-agent-skills`.

## 3. Combination

- One operation skill per turn. Its entrypoint loads the lane references it needs; cross-lane changes use `agm-exec`, which loads each lane's golden checklist.
- Do not load a second operation skill unless the requester asks. Supporting packages add evidence and never select the operation or grant write authority.
- Before the first answer line or write: `Skill: <skill> · Lane: <lane> · Golden: <entries actually opened>`.

## 4. Host invocation

| Host | Invocation |
| --- | --- |
| Claude Code | `agrimap-agent-skills:agm-sql` |
| Codex | `$agm-sql` |
| Antigravity | `/agm-sql` |

## 5. Supporting package: sql-context-pack

Use for live schema, columns, parameters or bounded protected rows (sensitive values are faked, aliased, generalized or redacted by sql-context-pack 3.0.0+) that local `sql/**` files and `.agrimap-agent/knowledge/references/db-schema/**` cannot answer.

- Supporting: Inside any agm-* operation sql-context-pack (3.1.0 or later) is supporting evidence only: its read-only tools and recipes (metadata and protected SELECT). No DDL/DML, EXEC/CALL, metadata sync, classification, routine deployment or reveal of protected values; export only through agm-sql context migrate.
- Owner turn: A direct owner request to sql-context-pack (its invocation, or naming it with an owner operation) is that package's turn: follow its own SKILL and approval gates. AgriMap adds no authority, lifecycle or prohibition to that turn and never runs those operations inside an agm-* operation.
- Context migrate: agm-sql context migrate (owner decision 2026-10-14; the requester asks for it explicitly) may run the catalog/export tools to write the DDL of the objects this repository uses, and the tables one hop behind them, into the registered db-schema managed folder, then formats each exported `table_metadata` YAML into the AgriMap golden layout with `scripts/sql-golden-format.mjs` (needs sql-context-pack 3.1.0+; database truth kept, `golden_deviation`/`metadata_gap` reported). It never syncs DB_METADATA_CONTEXT, classifies, deploys, connects or changes a profile, or reveals values; it reports the owner's inventory-sync command instead.
- Owner operations: export/catalog capture, DB_METADATA_CONTEXT sync, folder classification, context generation, routine deployment, profile connect/change, SQLFluff install/update.
- Read-only tools: `sqlctx_get_capabilities`, `sqlctx_get_active_profile`, `sqlctx_list_context_index`, `sqlctx_list_managed_folders`, `sqlctx_query_data`. Recipes: [sql-context-readonly.md](sql-context-readonly.md).
