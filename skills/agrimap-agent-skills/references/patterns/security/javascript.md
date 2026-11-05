# Security — JavaScript (Node scripts)

Node scripts, bootstrap tools and build helpers (`.js`, `.mjs`). TypeScript rows apply as well ([typescript.md](typescript.md)). Class definitions: [security-baseline.md](../security-baseline.md).

| Class | Key | Do not write | Write it this way | Seen |
| --- | --- | --- | --- | --- |
| SEC-02 | S4721, S2076 | `exec(\`git log ${arg}\`)`, `execSync` with a composed command string, `shell: true` | `execFileSync(commandPath('git'), ['log', arg])` with an argument array | release-notify.mjs (`execFileSync(commandPath('setx'), [ENV, url])`) |
| SEC-02 | S4036 | Bare command names resolved through `PATH` | Resolve the executable once (`commandPath`) | release-notify.mjs |
| SEC-04 | S2083 | `path.join(root, input)` without containment | `path.resolve` then check the prefix | baseline |
| SEC-23 | S5852 | `^\s*` with `m`, nested quantifiers | `[ \t]*`, one quantifier per span | release-notify.mjs (5.0.14) |
| SEC-25 | S5042 | Extracting archives without limits | Same guard as [typescript.md](typescript.md#sec-25-archive-guard-one-helper-tested) | catalog |
| SEC-11 | S4830 | `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0` | Default TLS; internal CA through `NODE_EXTRA_CA_CERTS` | baseline |
| SEC-07, SEC-28 | S6418, team | Tokens in script arguments, logs or committed `.env` | Read from the environment; print presence, never the value | baseline |
| SEC-08 | S2245 | `Math.random()` for temp names or tokens | `crypto.randomUUID()`, `fs.mkdtempSync` | identity tests (`mkdtempSync`, correct) |
