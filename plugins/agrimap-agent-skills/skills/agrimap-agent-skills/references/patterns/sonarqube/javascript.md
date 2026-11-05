# SonarQube — JavaScript (Node scripts)

Plain `.js`/`.mjs`/`.cjs` files: bootstrap tools such as `tools/agrimap/release-notify.mjs`, build and Jenkins helper scripts. Every rule in [typescript.md](typescript.md) applies under its `javascript:` key except the type rows (ADV-03, ADV-40). This file lists only what differs for untyped Node code. Security: [security/javascript.md](../security/javascript.md).

| Golden | Key | Smell | New code | Existing code | Seen |
| --- | --- | --- | --- | --- | --- |
| ADV-15 | S6594 | `str.match(/re/)` without `g` | must (`/re/.exec(str)`) | safe | release-notify.mjs (5.0.14) |
| ADV-16 | S6353 | `[A-Za-z0-9_]`, `[0-9]` | must (`\w`, `\d`) | safe | release-notify.mjs |
| ADV-42 | S7781 | `replace(/lit/g, ...)` for a literal | must (`replaceAll`) | safe | release-notify.mjs |
| SEC-23 | S5852 | `\s*` under the `m` flag, overlapping quantifiers | must | recommend | release-notify.mjs profile/registry patterns |
| — | S6324 | Control or invisible characters in a regex or string (a raw BOM) | must (escape it: `﻿`) | safe | release-notify.mjs |
| — | verify | `require('fs')`/`import 'fs'` without the `node:` prefix | should (`node:fs`) | safe | catalog |
| — | verify | `main().catch(...)` wrapper in an ES module | should (top-level `await`) | safe | catalog |
| ADV-24 | S1854 | Dead store | must | safe | identity `Tests/Tools/ReleaseNotify.test.mjs` |
| ADV-20 | S1128 | Unused import | must | safe | identity `4e2171e` |
| ADV-26 | S2681 | Unbraced `if` bodies, several statements per line | must (braces, one statement per line) | safe | release-notify.mjs `main()` (5.0.14) |
| QUALITY-01 | S3776 | Long script functions | must ≤ 15 | recommend | observability script (57) |

Scripts that projects receive through bootstrap are fixed in this package's canonical copy and synced; never hand-edit a project's installed copy.
