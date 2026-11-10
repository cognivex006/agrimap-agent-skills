# Security matrix (index by language and surface)

Entry point for security hotspots and vulnerabilities by where they are written. Class IDs (SEC-01..31), their OWASP/CWE mapping, the response contract and the tiers are defined once in [security-baseline.md](security-baseline.md); this index and the files under [security/](security/) map each class to the Sonar keys and the idiom of one language or configuration surface. Code smells are in [sonarqube-matrix.md](sonarqube-matrix.md).


Owner of each quality/security concern: [quality-security-index.md](../quality-security-index.md).
## Contents

- [Surface files](#surface-files)
- [Class map across surfaces](#class-map-across-surfaces)
- [Hotspot review and suppression](#hotspot-review-and-suppression)
- [Adding a surface](#adding-a-surface)

## Surface files

| Surface | File | Applies to | Evidence |
| --- | --- | --- | --- |
| C# | [security/csharp.md](security/csharp.md) | `agmws-*`, `agmbo-*`, `AgriMap.*` | license-management (cookies, forwarded headers), file-management (SHA-1), identity (secrets) |
| TypeScript | [security/typescript.md](security/typescript.md) | all `.ts` | platform-ng (zip slip/bomb, ReDoS, `Math.random`) |
| Angular | [security/angular.md](security/angular.md) | `agmwa-*`, `@agrimap/*` | suite-ng (`safeHtml`, `target=_blank`), platform-ng (redirects, storage) |
| JavaScript | [security/javascript.md](security/javascript.md) | Node scripts, bootstrap tools | release-notify.mjs |
| HTML | [security/html.md](security/html.md) | templates, `index.html`, `.cshtml` | suite-ng |
| SQL | [security/sql.md](security/sql.md) | procedures, `.sql` | SEC-01 baseline |
| nginx | [security/nginx.md](security/nginx.md) | `nginx/<env>/nginx.conf` of `agmwa-*` | pro-ng, platform-ng, suite-ng configs |
| Docker/CI | [security/docker.md](security/docker.md) | `Dockerfile*`, `.dockerignore`, Jenkinsfile | file-management `e32825d`, dynamic-dashboard `b7f1b87`, identity `1eee1c3` |
| Next.js | [security/nextjs.md](security/nextjs.md) | not a Golden lane yet | catalog |
| Go | — | not a Golden lane yet | add `security/go.md` with the lane |

## Class map across surfaces

`●` the class applies on that surface and the file has its rows; blank: not applicable. [sec-coverage.json](../../assets/sec-coverage.json) records the same map with Golden Lint scanner status and detector IDs per class; `examplesTested` marks classes whose BAD/GOOD shapes run in `tests/unit/security-examples.test.mjs` (C# and TypeScript first; other surfaces are catalog-only). `tests/unit/sec-coverage.test.mjs` fails when this table, the baseline, a surface file or the installed Golden Lint drift apart.

| Class | C# | TS | Angular | JS | HTML | SQL | nginx | Docker/CI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-01 SQL injection | ● | | | | | ● | | |
| SEC-02 command injection | ● | | | ● | | | | |
| SEC-03 LDAP injection | ● | | | | | | | |
| SEC-04 path traversal | ● | ● | | ● | | | ● | |
| SEC-05 missing authorization | ● | | ● | | | | | |
| SEC-06 error detail exposure | ● | | | | | ● | ● | |
| SEC-07 sensitive logging | ● | ● | ● | ● | | | | ● |
| SEC-08 weak crypto / randomness | ● | ● | | ● | | | | |
| SEC-09/10 token validation, issuance | ● | | | | | | | |
| SEC-11 TLS bypass | ● | | | ● | | | | |
| SEC-12 unsafe deserialization | ● | | | | | | | |
| SEC-13 permissive CORS | ● | | | | | | ● | |
| SEC-14 method override | ● | | | | | | | |
| SEC-15 open redirect | ● | | ● | | | | | |
| SEC-16 sensitive query value | ● | | ● | | | | | |
| SEC-17 sensitive response field | ● | | | | | | | |
| SEC-18 unbounded input | ● | | | | | | | |
| SEC-19 security headers | ● | | | | | | ● | |
| SEC-20 insecure cookie | ● | | | | | | | |
| SEC-21 DOM XSS | | | ● | | ● | | | |
| SEC-22 token in Web Storage | | | ● | | | | | |
| SEC-23 regex backtracking | ● | ● | | ● | | | | |
| SEC-24 Docker build context | | | | | | | | ● |
| SEC-25 archive expansion (zip slip, zip bomb) | ● | ● | | ● | | | | |
| SEC-26 container runs as root | | | | | | | | ● |
| SEC-27 secrets and scripts at build time | | | | | | | | ● |
| SEC-28 committed secrets | ● | ● | ● | ● | | | | ● |
| SEC-29 reverse tabnabbing | | | ● | | ● | | | |
| SEC-30 web server hardening | | | | | | | ● | |
| SEC-31 forwarded-header trust | ● | | | | | | ● | |

## Hotspot review and suppression

- A security hotspot is closed in SonarQube as **Reviewed → Safe** or **Fixed** by a person with that permission, with the evidence in the comment. Code never claims a hotspot is safe on its own.
- `// NOSONAR`, `#pragma warning disable` and `[SuppressMessage]` follow QUALITY-08 in [sonarqube-remediation.md](../sonarqube-remediation.md): rule ID, the guard that makes it safe, and only after that guard exists. A suppression never replaces a fix the class requires.
- Fixing a hotspot keeps the response contract of [security-baseline.md](security-baseline.md#how-to-apply): valid callers see the same status, body and data.

## Adding a surface

Copy [security/_template.md](security/_template.md) to `security/<surface>.md`, add a row to [Surface files](#surface-files) and a column to the class map. A new class takes the next free `SEC-*` number and is defined in [security-baseline.md](security-baseline.md) first (Golden Lint binds to it there); surface files only add keys and idioms.
