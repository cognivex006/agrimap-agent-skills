# Tests for 3.0.0

- `npm test`: package/mirror/bootstrap/golden validation and the current behavioral suite, once.
- `npm run test:docs`: user-guide links/anchors, valid example aliases/actions, exact distributed copies and negative validation fixtures; no installation or release commands executed.
- `npm run test:unit`: v3 runtime fixtures plus retained parser, SQL file-contract, golden-integrity, token and MCP tests.
- `npm run test:workspace`, `test:usage`, `test:integration`: compatibility command names for the same v3 fixture suite; do not run all three routinely.
- `npm run audit:tokens:strict`: route coverage and context-budget audit.
- `test:legacy-v2` was retired in 6.4.1 (owner decision 2026-11-11). Its tests that still described current behavior moved into `npm test`; the rest asserted removed v2 contracts and are in Git history.

Tests use isolated temporary workspaces, no live database, release publication or Jenkins pipelines. Script-level tests do not establish model-family performance.
