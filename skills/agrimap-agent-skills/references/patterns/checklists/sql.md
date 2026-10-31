# Golden checklist — SQL

Collection `golden/sql/` · status `mixed` · evidenceMode `mixed`.
Tiers and the "open, do not recall" rule: [README.md](README.md).

`mixed` means authority differs **per entry**. This file is the status map so the collection can be
used without guessing. The rules themselves live in [patterns/sql.md](../sql.md), which the `sql`
operation already loads — this checklist does not restate them.

## MUST — pick evidence by status, not by filename

| Entry | Status | Use as |
| --- | --- | --- |
| `UM_USER_I.sql`, `UM_USER_U.sql`, `UM_USER_D.sql` | `legacy-compatible` | procedure shape only |
| `APP_USER_TOKEN.sql` | `current` | main-table DDL, `NUMERIC(38, 0) IDENTITY` ID |
| `AUTH_FLOW.sql`, `AUTH_FLOW_TRANSACTION.sql`, `AUTH_FLOW_DETAIL_Q.sql` | `current` | table + transaction + query procedure |
| `LUT_AUTH_TYPE.sql` | `current` | `LUT_*` DDL with `INT IDENTITY` and seed |
| `LUT_APP_MESSAGES.sql` | `current` | canonical message registry shape |
| `LUT_APP_MESSAGES.example.sql` | `current`, `curated-reference` | the idempotent `IF NOT EXISTS` insert to copy |
| `CONTENT.sql` | `current` | table DDL — **but its `INT` ID is legacy**, see below |
| `LUT_NOTI_CHANNEL.sql` | `legacy-compatible` | lookup shape only |
| `FILE_STORAGE_I.sql` | `legacy-compatible` | insert-procedure shape only |
| `NOTIFICATION_CONTENT.sql`, `NOTIFICATION_MESSAGE.sql`, `NOTIFICATION_TEMPLATE.sql`, `NOTIFICATION_USERS_Q.sql` | `legacy-compatible` | structural evidence only |

A `legacy-compatible` entry outranks neighbouring project structure **only inside its declared
structural scope**. It never carries behaviour or data semantics.

## MUST — never inferred from this collection

Cascade behaviour, seed IDs, list-input handling, indexing choices, and replace semantics are
`unverified` collection-wide. They require active-project evidence or an owner decision — a golden
file is not evidence for them. Collection `knownIssues`: competing default and cascade conventions,
a possibly redundant index, mixed splitter and cursor techniques, business-specific seed and replace
semantics.

`CONTENT.sql` uses `INT` for `[ID]` although it is not a `LUT_*` table. That is legacy: do not
imitate it, and do not change an existing table's ID type without an owner decision — it affects
every FK pointing at it.

## MUST — gates that apply regardless of the entry used

Each is owned by [patterns/sql.md](../sql.md); confirm all four before a write:

1. **Output ownership** — `output_owner=product|owner-reference|knowledge-draft` resolved. A missing
   directory is never create authority.
2. **`CREATE OR ALTER PROCEDURE`** on every created or edited procedure; standalone
   `CREATE`/`ALTER PROCEDURE`/`PROC` is replaced.
3. **DDL contract** for new table scripts — file section order, standard AgriMap columns, the closed
   ID-type rule, named constraints (`PK_`/`UQ_`/`DF_`/`CK_`/`FK_`/`IX_`/`UX_`), and mandatory Thai
   `MS_Description` extended properties. Run the `Detect` greps in that file as the review grade.
4. **Message collection gate** — a user-facing code goes to `sql/<GROUP_OR_DOMAIN>/messages.sql` and
   `[agrimap_app].[LUT_APP_MESSAGES]`, with one `IF NOT EXISTS`-guarded insert per new code. Same
   code + same meaning is reused; a conflicting meaning is an owner question.

Schema for any object read, joined, or written outside the edited file comes from
[db-schema-context.md](../../db-schema-context.md). Missing schema is a named `UNKNOWN` and an owner
question — never an inferred table, column, type, key, constraint, or message code.

## SHOULD

No dynamic SQL assembled from parameters (SEC-01, [security-baseline.md](../security-baseline.md)): use `sp_executesql` parameters and `QUOTENAME` or an allow-list for identifiers.

Procedure section comments, actor/target user parameter conventions, and splitter or cursor choice
follow [patterns/sql.md](../sql.md#stored-procedure-work); the mixed techniques across the legacy
entries are not a standard to reproduce.

## FREE

Query formulation, join order, and internal control flow inside a procedure whose contract, result
set, and error mapping are already fixed.

## Before the write

1. Each golden entry used is named with its status.
2. All four gates above confirmed; `db-schema: <loaded>/<expected>` recorded.
3. `Patterns:` line lists `agm:patterns/sql` + `agm:golden/sql` plus the exact entries opened.
