# Security — Next.js

Next.js is not a Golden lane yet. Catalog rows for the day an app is approved; TypeScript rows apply too ([typescript.md](typescript.md)). Class definitions: [security-baseline.md](../security-baseline.md).

| Class | Key | Do not write | Write it this way |
| --- | --- | --- | --- |
| SEC-21 | S6299-like, team | `dangerouslySetInnerHTML={{ __html: value }}` with API or user content | Render text; sanitize trusted HTML on the server |
| SEC-28 | S6418 | Secrets in `NEXT_PUBLIC_*` variables (shipped to the browser) | Server-only env vars read in Server Components, Route Handlers or Server Actions |
| SEC-05 | team | Server Actions or Route Handlers without an auth check (middleware alone is not enough) | Check the session inside every action/handler |
| SEC-15 | S5146-like | `redirect(searchParams.next)` | Allow-listed internal paths |
| SEC-19/30 | team | No security headers | `headers()` in `next.config` or the gateway, same set as [nginx.md](nginx.md) |
| SEC-13 | S5122 | `Access-Control-Allow-Origin: *` on Route Handlers with credentials | Configured origins |
| SEC-29 | S5148 | `<a target="_blank">` without `rel` | `rel="noopener noreferrer"` |
