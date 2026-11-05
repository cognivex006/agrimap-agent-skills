# SonarQube — Angular

Angular rules on top of [typescript.md](typescript.md) (component and service TypeScript) and [html.md](html.md) (templates). Golden structure, signals and facades: [frontend.md](../frontend.md). Security (sanitization, storage, redirects): [security/angular.md](../security/angular.md). Rows keyed `team` are Golden rules without a Sonar key (angular-eslint often has one).

## Contents

- [Components and services](#components-and-services)
- [Templates](#templates)
- [Generated code](#generated-code)
- [Before/after](#beforeafter)

## Components and services

| Golden | Key | Smell | New code | Existing code | Seen |
| --- | --- | --- | --- | --- | --- |
| ADV-32 | S2933 | `inject()`, `signal()`, `computed()`, `viewChild()` members not `readonly` | must | safe | platform-ng (`private readonly store = inject(DataImportStore)`) |
| ADV-20 | S1128 | Unused imports, including names in a standalone component's `imports: []` | must | safe | platform-ng `1082b9f9`, `862106ee`; suite-ng `caf7cfd` |
| ADV-33 | S1186 | Empty lifecycle hook or event handler | must (delete the hook, its `implements` entry and the template binding) | recommend | platform-ng `d7c7429e` |
| ADV-19 | S3735 | `void this.facade.load()` | must | safe | license-management |
| ADV-24 | S1854 | Signal read only to register a dependency (`const { x } = this.stat(); void x`) | must (read it inside the `effect`/`computed` that uses it) | recommend | suite-ng `b68a9d9` |
| QUALITY-03 | S3358 | Nested ternary inside `computed(() => ...)` | must | safe | platform-ng `1082b9f9` (`chunkAccept`) |
| — | team | `subscribe()` inside `subscribe()` | must (`switchMap`/`concatMap`) | recommend | catalog |
| — | team | Subscription without teardown in a component | must (`takeUntilDestroyed`, `toSignal`, `async` pipe) | recommend | catalog |
| — | team | Busy/loading flag reset synchronously after starting a request | must (`finalize`) | recommend | platform-ng `cfb77e6a` |
| — | team | `map` used for side effects or `tap` used to produce a value | must (`tap` for effects, `map` for values) | recommend | suite-ng `b68a9d9` (`pdpa-consent.service`) |
| — | team | `ChangeDetectionStrategy.Default` in a new component | should (`OnPush`) | recommend | platform-ng (OnPush added) |

## Templates

| Golden | Key | Smell | New code | Existing code | Seen |
| --- | --- | --- | --- | --- | --- |
| — | team | `*ngFor`/`*ngIf` in new templates (Angular 17+) | must (`@for (...; track id)`, `@if`) | recommend | suite-ng `caf7cfd` |
| — | team | `@for` tracked by `$index` or by object identity when an id exists | must (`track item.id`) | safe | suite-ng (`track soilLimitation` on strings is fine) |
| NULL-* | team | `x!.y` in a template to silence strict templates | must not | recommend | suite-ng `caf7cfd` (`location.weather!.tempIcon`) |
| ADV-37 | S1090 | `<iframe>` without `title` | must | safe | platform-ng `a30558f5` |
| SEC-29 | S5148 | `target="_blank"` without `rel="noopener noreferrer"` | must | safe | suite-ng, pro-ng, platform-ng (9 links) |
| SEC-21 | S6268 | `[innerHTML]` through a `bypassSecurityTrust*` pipe (`safeHtml`) | must not | recommend | suite-ng `caf7cfd` |
| — | team | Method calls in bindings (`{{ format(x) }}`) | should (`computed` or a pure pipe) | recommend | catalog |

## Generated code

Findings inside `generated-apis/` (S3776, S3358, S1854 ...) are fixed in the gencode-api template and regenerated, never by hand ([gencode-api.md](../gencode-api.md)). Seen: license-management generated API, suite-ng generated validators.

## Before/after

```ts
// before: deep import of an internal chunk (ADV-41) and an unused Router (ADV-20)
import { HttpErrorResponse } from 'node_modules/@angular/common/types/_module-chunk'
import { Router } from '@angular/router'
// after
import { HttpErrorResponse } from '@angular/common/http'
```

```html
<!-- before -->
<span>{{ location.weather!.tempIcon }}</span>
<a href="https://open-meteo.com/" target="_blank">open-meteo.com</a>
<!-- after -->
@if (location.weather; as weather) {
  <span>{{ weather.tempIcon }}</span>
}
<a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">open-meteo.com</a>
```

```ts
// before: the flag is false before the request finishes
this.isSubmitting = false
this.facade.publish(id).subscribe({ next: (ok) => { /* ... */ } })
// after (platform-ng cfb77e6a)
this.facade.publish(id).pipe(finalize(() => (this.isSubmitting = false))).subscribe({ next: (ok) => { /* ... */ } })
```
