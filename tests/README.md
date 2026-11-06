# Tests for 3.0.0

- `npm test`: package/mirror/bootstrap/golden validation and the current behavioral suite, once.
- `npm run test:docs`: user-guide links/anchors, valid example aliases/actions, exact distributed copies and negative validation fixtures; no installation or release commands executed.
- `npm run test:unit`: v3 runtime fixtures plus retained parser, SQL file-contract, golden-integrity, token and MCP tests.
- `npm run test:workspace`, `test:usage`, `test:integration`: compatibility command names for the same v3 fixture suite; do not run all three routinely.
- `npm run audit:tokens:strict`: route coverage and context-budget audit.
- `npm run test:legacy-v2`: retained historical v2 expectations, not a 3.0.0 release gate. They assert intentionally removed five-file/default-QA behavior; failures here are not a claim of v3 compatibility.

Tests use isolated temporary workspaces, no live database, release publication or Jenkins pipelines. Script-level tests do not establish model-family performance.
