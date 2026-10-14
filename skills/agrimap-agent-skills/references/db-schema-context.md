# Database context: schema evidence and SP → table tracing

Most AgriMap work reaches data through stored procedures, so this gate is on by default for `be-main`, `be-library`, and SQL targets. Run it whenever the target calls a procedure, executes SQL, or maps a persisted result — a procedure name in application code is a pointer, never the contract. Record `db-schema: not-applicable` with a reason only when the target provably touches no database object.

## Source of trust

Resolve database truth in this order and record which level answered:

1. `.agrimap-agent/knowledge/references/db-schema/**/*.sql`: owner-provided DDL for tables, views, and procedures. Load matching files as `FACT`.
2. Product SQL inside the repository, typically `sql/<GROUP_OR_DOMAIN>/procedure/<PROCEDURE>.sql`, `sql/<GROUP_OR_DOMAIN>/table/<TABLE>.sql`, and `sql/<GROUP_OR_DOMAIN>/messages.sql`.
3. `.agrimap-agent/knowledge/drafts/sql/`: AI-generated and `tentative`. Never schema `FACT` and never evidence for a conclusion.
4. Nothing matches: name the exact missing object, keep the claim at `HYPOTHESIS`/`UNKNOWN`, and ask the owner.

`agm-sql context check` lists which used objects lack local DDL; `agm-sql context migrate` (explicit request) fills that folder. If local evidence is missing or stale, use [sql-context-readonly.md](sql-context-readonly.md) through the current connected sql-context-pack profile. Metadata and bounded protected SELECT are allowed; database DDL/DML/EXEC, metadata sync and routine deployment are forbidden. Never infer missing schema facts.

## Required lookup

Uppercase filename stems equal object names, so resolve by object name before inspection:

1. Collect every procedure, view, and table name the target calls, including names built from constants, configuration, or repository helpers.
2. Search both reference roots for each name, for example `**/<PROCEDURE>.sql`, and load every match.
3. Open each loaded procedure and collect the tables, views, and `LUT_*` lookups it reads or writes, then load those DDL files too. One hop past the procedure is mandatory; go further when a join, trigger, or nested call carries the behavior in question.
4. Report `db-schema: <loaded>/<expected>` in the receipt and list every object that stayed unresolved.

## SP → table trace for a failing call

Use this order when a call fails, returns 500, or returns unexpected data. Stop at the first level that explains the observation, and keep the evidence pointer for each level you passed.

1. Surface: HTTP status or exception, the user-facing code, and where the caller mapped it. Separate a contract error code from a raw technical failure.
2. Caller: the repository or Infrastructure method, its parameter names, types, casing, the `PO_*` output parameter it reads, and whether it throws from that output.
3. Procedure: the matching `THROW <number>, '<error_code>'` and the nearest `Validate ...` section guarding it. An unhandled failure instead means a conversion, arity, missing-object, or permission error, which fails before any `Validate` gate.
4. Condition: the predicate of that gate — parameter compared, table or lookup queried, `DEL_FLAG`/`ACTIVE` filters, join keys, and the declared type on both sides. Check actor versus target parameters (`@PI_SESSION_USER_ID` versus `@PI_USER_ID`) before blaming data.
5. Table: the referenced DDL, confirming the column, nullability, type, key, and constraint the predicate assumes actually exist with those semantics.
6. Message: for a user-facing code, confirm the entry in `[agrimap_app].[LUT_APP_MESSAGES]` through the domain `messages.sql`.

Report the failing condition with file, procedure section, and column-level evidence. A condition you could not open is an `UNKNOWN` to name, not a cause to guess.

For authoring, naming, formatting, and deployment rules, use [patterns/sql.md](patterns/sql.md); this file governs only how database evidence is located, trusted, and traced.
