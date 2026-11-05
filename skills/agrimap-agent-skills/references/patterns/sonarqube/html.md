# SonarQube — HTML

`Web` rules for Angular templates, `index.html` and Razor `.cshtml`. Angular template syntax: [angular.md](angular.md). Security (`target=_blank`, SRI, inline script): [security/html.md](../security/html.md). `verify` keys are certain concepts whose rule number you confirm in the scan before quoting it.

| Golden | Key | Smell | New code | Existing code | Seen |
| --- | --- | --- | --- | --- | --- |
| ADV-37 | S1090 | `<iframe>`/`<frame>` without `title` | must | safe | platform-ng `a30558f5` (`title="Pdpa"`) |
| ADV-37 | S1077 | `<img>` without `alt` (decorative image: `alt=""`) | must | safe | catalog |
| ADV-37 | S5254 | `<html>` without `lang` (`lang="th"`) | must | safe | catalog |
| ADV-37 | S5256 | `<table>` without `<th>` headers | must | recommend | catalog (PrimeNG tables render their own) |
| ADV-37 | verify | `<label>` not associated with its control (`for`/`id` or wrapping) | must | safe | catalog |
| ADV-37 | verify | Clickable `<div>`/`<span>` with `(click)` and no role or keyboard handler | must (`<button>`) | recommend | catalog |
| ADV-37 | verify | `<a>` without `href` used as a button; link or heading with no text | must | safe | catalog |
| ADV-37 | verify | `index.html` without `<title>` | must | safe | catalog |
| ADV-23 | verify | Commented-out markup (`<!-- <div> ... -->`) | must | safe | platform-ng `a30558f5` (`</div> -->` around the iframe) |
| — | verify | Duplicate `id` in one template | must | safe | catalog |
| — | verify | Deprecated elements or attributes (`<center>`, `align=`, `bgcolor=`) | must | safe | catalog |
| — | team | Inline `style="..."` on new markup | should (component styles) | recommend | platform-ng iframe |
| SEC-29 | S5148 | `target="_blank"` without `rel="noopener"` | must | safe | suite-ng |
| SEC-21 | team | `[innerHTML]` through a bypass pipe | must not | recommend | suite-ng |

Accessibility fixes keep layout and wording: add attributes, do not restyle. Text for `title`/`alt` comes from the requester or existing labels, not invented copy.
