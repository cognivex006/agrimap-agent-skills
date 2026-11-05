# Security — Angular

Angular rules on top of [typescript.md](typescript.md) and [html.md](html.md). Class definitions: [security-baseline.md](../security-baseline.md). Index: [security-matrix.md](../security-matrix.md).

| Class | Key | Do not write | Write it this way | Seen |
| --- | --- | --- | --- | --- |
| SEC-21 | S6268 | `bypassSecurityTrustHtml(value)` on API or user content, directly or in a `safeHtml` pipe | `[innerHTML]="value"` (Angular sanitizes); bypass only for constant or server-sanitized content, named in the summary | suite-ng `caf7cfd` (`[innerHTML]="soilLimitation \| safeHtml"`) |
| SEC-21 | team | `ElementRef.nativeElement.innerHTML = ...`, `document.write` | Template binding or `Renderer2.setProperty` with sanitized text | baseline |
| SEC-15 | S5146-like | `window.location.href = queryParam`; `returnUrl` from the query without checking | `router.navigateByUrl` for in-app paths; external hosts from an environment allow-list | platform-ng `post-registration-redirect.ts` (callback URL matched against configured targets) |
| SEC-16 | team | Tokens, PIN, citizen ID in route or query params | Body or header through the generated API | baseline |
| SEC-22 | team | Access/refresh tokens in `localStorage`/`sessionStorage` in new code | The project's established flow (HttpOnly cookie or in-memory token); changing it is a staged cross-lane migration | platform-ng auth storage (existing flow, recommend only) |
| SEC-29 | S5148 | `target="_blank"` without `rel`; `window.open(url)` | `rel="noopener noreferrer"`; `window.open(url, '_blank', 'noopener,noreferrer')` | suite-ng, pro-ng, platform-ng |
| SEC-05 | team | A route that needs a login without its guard; permission checked only by hiding a button | Route guard plus the backend `[Authorize]`; the UI check is convenience only | baseline |
| SEC-07 | team | Logging HTTP responses or form values | No console output; mask in the logging service | platform-ng `e7190db2` |
| SEC-28 | S6418 | Secrets in `environment*.ts` (they ship to every browser) | Only public identifiers in the bundle; secrets stay on the server | baseline |

`DomSanitizer` and `safeHtml`-style pipes are a review trigger: each use names its content source. A pipe that bypasses for every input is SEC-21 even when every current caller is safe.
