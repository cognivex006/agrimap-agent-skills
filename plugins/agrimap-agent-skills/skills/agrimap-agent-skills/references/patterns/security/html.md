# Security — HTML

Templates, `index.html` and Razor `.cshtml`. Angular binding rules: [angular.md](angular.md). Class definitions: [security-baseline.md](../security-baseline.md).

| Class | Key | Do not write | Write it this way | Seen |
| --- | --- | --- | --- | --- |
| SEC-29 | S5148 | `<a target="_blank">` without `rel` | `rel="noopener noreferrer"` | suite-ng (`open-meteo.com` link), 9 links across the three apps |
| SEC-21 | S5247 (Razor `Html.Raw`), S6268 | `@Html.Raw(model.Value)`; `[innerHTML]` through a bypass pipe | Encoded output (`@model.Value`); sanitized HTML only from a trusted server source | identity `Login.cshtml` (review) |
| — | S5725 | `<script src="https://cdn...">` or a stylesheet from a CDN without `integrity` | Bundle the dependency, or add `integrity` + `crossorigin="anonymous"` | catalog |
| — | team | Inline `<script>` or `on*=` handlers in `index.html` | Code in the bundle; CSP without `'unsafe-inline'` becomes possible | catalog |
| SEC-16 | team | Forms posting secrets with `method="get"` | `method="post"`; never put tokens in `action` URLs | baseline |
| — | S6840-like | `autocomplete` off for passwords or wrong tokens | Valid `autocomplete` values (`current-password`, `one-time-code`) | catalog |
