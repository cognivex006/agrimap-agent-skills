# Security — SQL (SQL Server procedures)

Procedure and script rules. Golden SQL format: [sql.md](../sql.md); class definitions: [security-baseline.md](../security-baseline.md). AgriMap operations never execute DDL/DML; these rows govern what you write.

| Class | Key | Do not write | Write it this way | Seen |
| --- | --- | --- | --- | --- |
| SEC-01 | tsql S2077-like | `EXEC('SELECT ... ' + @param)`; `sp_executesql @sql` where `@sql` contains concatenated values | `sp_executesql @sql, N'@id INT', @id = @id`; identifiers through `QUOTENAME` or an allow-list | baseline |
| SEC-06 | team | `ERROR_MESSAGE()` returned to the caller as the response message | Message code from `messages.sql`; detail to the log table | baseline |
| SEC-17 | team | Password hash, salt or secret columns in a `_Q` result set | Select only the columns the contract needs | baseline |
| SEC-28 | S6418, S2068 | Passwords or keys in seed or migration scripts; `CREATE LOGIN ... PASSWORD = '...'` committed | Deployment variables; never commit credentials | identity `5de83da` (SQL scripts removed with secrets) |
| SEC-07 | team | Logging full parameter sets that include personal data | Log ids and outcome codes | baseline |
| — | team | `GRANT` to `public`; `EXECUTE AS OWNER` without need | Least privilege per application role | catalog |
