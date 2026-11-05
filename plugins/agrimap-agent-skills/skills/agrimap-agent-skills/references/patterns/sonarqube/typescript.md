# SonarQube — TypeScript

Rules Sonar's JS/TS analyzer raises on every `.ts` file (`typescript:` keys; the same number under `javascript:` applies to `.js`/`.mjs`, see [javascript.md](javascript.md)). Angular-specific rules: [angular.md](angular.md). Templates: [html.md](html.md). Column meanings: [sonarqube-matrix.md](../sonarqube-matrix.md). Policy: [sonarqube-remediation.md](../../sonarqube-remediation.md). Security hotspots: [security/typescript.md](../security/typescript.md).

## Contents

- [Complexity and structure](#complexity-and-structure)
- [Dead code and noise](#dead-code-and-noise)
- [Types](#types)
- [Modern API](#modern-api)
- [Async](#async)
- [Before/after](#beforeafter)
- [More before/after](#more-beforeafter)

## Complexity and structure

| Golden | Key | Smell | New code | Existing code | Seen |
| --- | --- | --- | --- | --- | --- |
| QUALITY-01 | S3776 | Cognitive Complexity above 15 | must | recommend | pro-ng `505babb` (16 → `buildExternalAppUrl`); platform-ng `1082b9f9` (`validateFormBeforeSave`), `a2924c4a`, `c1fb6dd2`; license-management generated API |
| QUALITY-01 | team | More than 7 `if`/`else if` in one function | must | recommend | team limit |
| QUALITY-02 | S107 | More than 7 parameters (an options object counts as one) | must | recommend | team limit |
| QUALITY-03 | S3358 | Nested ternary, also inside `computed()`, template-literal and object properties | must | safe | pro-ng `e70ec87`, `c8dee2d`, `f315c3a`; platform-ng `ed13c75d`, `96a7133d`; suite-ng `b68a9d9`, `6a70e74`, `c71acbb` |
| ADV-25 | S1871 | Two branches with the same body | must | recommend | pro-ng `10e5e1c`, `7645900` (merged into one condition) |
| ADV-26 | S2681 | Multi-line body after an unbraced `if`: only the first line is conditional | must | recommend (it is a bug) | pro-ng `3bef5cd` |
| ADV-39 | S1066 | `if` nested directly in an `if` with no `else` | must | safe | pro-ng `47acb57` (`removeStaleMapLayers`) |
| ADV-27 | S1788 | Default parameter before a required one | must | recommend | pro-ng `6eb3319`; platform-ng `efddd92b` |
| ADV-28 | S4144 | Two functions with the same body | must | recommend | six copies of the trailing-slash loop (see anti-fixes) |
| QUALITY-06 | S3626 | Redundant `return;`/`continue;` at the end | must | safe | agmws-* (same rule in TS); platform-ng `publish-name.component` (`return;` closing the last `if`) |

## Dead code and noise

| Golden | Key | Smell | New code | Existing code | Seen |
| --- | --- | --- | --- | --- | --- |
| ADV-05 | S1481 | Unused local | must | safe | license-management |
| ADV-24 | S1854 | Useless assignment (overwritten or never read) | must | safe | pro-ng `37771f2` (`url`), `b62f00f` (`layerOptions`), `1611417` (`message`), `54697ed` (`identityAuthService`) |
| ADV-20 | S1128 | Unused import, including one name in a list | must | safe | suite-ng `a23277e` (`permissionIds` ×3); platform-ng `1082b9f9`, `3a3c5d53`; license-management `XLSX`; platform-ng `data-import.facade` (`switchMap`, `of`), `data-warehouse.facade` (`formatDate`), `iot.facade` (`WarehouseIotUpdateRequestDto`), `my-content.facade` (`filter`, `FileExplorerItem`), `map-viewer` (`HttpClient`, unused DTO) |
| ADV-48 | S3863 | The same module imported in two statements | must | safe | platform-ng `user-groups.store` (`./user-groups.model` ×2), dynamic-form models (×2), `group-item-setting` (`@angular/forms` lines 3 and 21) |
| ADV-21 | S1135 | TODO/FIXME | must | safe | license-management; platform-ng `map-viewer.model.ts` (`// TODO: mock ไว้ก่อน — รอ backend ...`) |
| ADV-47 | S1874 | Deprecated API (`event.returnValue`, `substr`, `toPromise()`, `KeyboardEvent.keyCode`) | must | recommend | platform-ng `app.component` `onBeforeUnload` (`event.returnValue = ''`) |
| ADV-49 | S1301 | `switch` with one `case` plus `default` | must | safe | platform-ng `publish-datasource.component` `getLayerFetchStepLabel` |
| ADV-23 | S125 | Commented-out code | must | safe | pro-ng `9607869`; platform-ng `d552a541`, `e7190db2`, `df97a0d9`, `d7c7429e`, `1a80c14c`, `efddd92b`; suite-ng `6a70e74` (a whole commented component) |
| ADV-33 | S1186 | Empty function or handler | must | recommend | platform-ng `d7c7429e` (`onMoveToTarget(event) { // console.log }`, removed with its template binding) |
| ADV-34 | S2486, S108 | Empty `catch {}` | must | recommend | platform-ng `catch {}` |
| ADV-38 | S1192 | Same string literal 3+ times | should | recommend | catalog |
| — | team | `console.log` left in feature code | must | safe | platform-ng `e7190db2` (`console.log('Loaded data imports', ...)`), 20 removals overall |
| — | S1172 | Unused function parameter | should (`_name` only where a signature requires it) | recommend | catalog |

## Types

| Golden | Key | Smell | New code | Existing code | Seen |
| --- | --- | --- | --- | --- | --- |
| ADV-03 | S4325 | Assertion that does not change the type (`x as T` when `x: T`, `!` on a non-null) | must | recommend | platform-ng `a2924c4a`; pro-ng |
| ADV-40 | S4204, S6571 | `any` where a type exists; `as any` to silence the compiler; `string \| any` | must | recommend | platform-ng `a2924c4a` (`sharesResponse?.content as any`); suite-ng `caf7cfd` (`(response as any).soilLimitations`) |
| ADV-29 | S1125 | `x === true` on a `boolean` | must | safe | catalog |
| ADV-32 | S2933 | Private member never reassigned is not `readonly` (`inject()`, `signal()`, `computed()`) | must | safe | platform-ng (279 `readonly` additions), suite-ng |
| ADV-35 | S6551 | Object stringified with `${x}` or `+ ''` | must | safe | platform-ng `efddd92b` (`new Date(\`${value}\`)` → `new Date(String(value))`) |
| ADV-41 | team | Import from `node_modules/...` or a package's internal chunk | must | safe | platform-ng `3a3c5d53` (`'node_modules/@angular/common/types/_module-chunk'`) |
| — | S6606 | `a !== null && a !== undefined ? a : b` instead of `??` | must | safe | platform-ng, suite-ng |
| — | S6582 | `a && a.b && a.b.c` instead of `a?.b?.c` | must | safe | platform-ng `a2924c4a` (`ctrl && ctrl.formGroup` → `ctrl?.formGroup`) |
| — | S7735 | Negated condition with an `else` (`if (!x) {a} else {b}`) | should | safe | catalog |

## Modern API

| Golden | Key | Smell | New code | Existing code | Seen |
| --- | --- | --- | --- | --- | --- |
| ADV-31 | S7773 | Global `isNaN`, `parseInt`, `parseFloat`, `isFinite` | must (`Number.isNaN`, `Number.parseInt(x, 10)`) | safe (check: global `isNaN` coerces strings, `Number.isNaN` does not) | suite-ng `b68a9d9` |
| ADV-42 | S7781 | `replace(/x/g, ...)` with a literal pattern | must (`replaceAll('x', ...)`) | safe | release-notify.mjs |
| ADV-42 | S7755 | `arr[arr.length - 1]` | should (`arr.at(-1)`) | safe | catalog |
| ADV-42 | S7764 | `window`/`self`/`global` for the global object | should (`globalThis`) | safe (not for `window.location` in browser-only code) | catalog |
| — | S4138 | `for (let i = 0; i < a.length; i++)` that only reads `a[i]`, or `forEach` with an early exit | should (`for...of`) | safe | platform-ng, pro-ng `47acb57` |
| ADV-15 | S6594 | `str.match(re)` without `g` | must (`re.exec(str)`) | safe | release-notify.mjs |
| ADV-16 | S6353 | `[0-9]`, `[A-Za-z0-9_]` | must (`\d`, `\w`) | safe | release-notify.mjs; platform-ng `publish-name.component` (`/^[A-Za-z][A-Za-z0-9_]{0,119}$/` → `/^[A-Za-z]\w{0,119}$/`) |
| — | S2245 | `Math.random()` for an id or key | must (`crypto.randomUUID()`) | safe | platform-ng `4ab68dc6` (role-detail key) — see SEC-08 |

## Async

| Golden | Key | Smell | New code | Existing code | Seen |
| --- | --- | --- | --- | --- | --- |
| ADV-19 | S3735 | `void promise` / `void this.facade.load()` | must | safe | license-management operations console; suite-ng `b68a9d9` (`void windowStatus`) |
| — | S6544 | Promise passed where a value or `void` callback is expected; un-handled `router.navigate*` | must (`.catch()` or `await`) | recommend | platform-ng (`navigateByUrl(path).catch(...)`) |
| — | S4123 | `await` on a non-promise | must | safe | catalog |
| — | team | Busy flag reset before the request finishes | must (`finalize(() => this.busy = false)`) | recommend | platform-ng `cfb77e6a` |

## Before/after

### ADV-26 unbraced multi-line body (bug)

```ts
// before: only `return` is conditional; the rest runs even when ctrl is null
if (!ctrl) return
  if (workspace) { ctrl.setFormValue(workspace) } else { ctrl.onResetForm() }
// after (pro-ng 3bef5cd)
if (!ctrl) {
  return
}
if (workspace) {
  ctrl.setFormValue(workspace)
} else {
  ctrl.onResetForm()
}
```

### ADV-25 identical branches

```ts
// before
if (isVector && (type === 'FeatureLayer' || type === 'GraphicsLayer')) {
  filterLayer.push(toOption(config))
} else if (isRaster && type === 'ImageryTileLayer') {
  filterLayer.push(toOption(config))
}
// after (pro-ng 10e5e1c)
if ((isVector && (type === 'FeatureLayer' || type === 'GraphicsLayer')) || (isRaster && type === 'ImageryTileLayer')) {
  filterLayer.push(toOption(config))
}
```

### ADV-27 default parameter last

```ts
// before
confirmDelete(title = 'ยืนยันการลบ', content: string, data: any = {}): Promise<boolean>
// anti-fix: `title: string` (callers lose the default) or `title: string | undefined` (callers must pass undefined)
// after: required first; when changing a shared API, add the new shape and migrate callers
confirmDelete(content: string, options: { title?: string; data?: unknown } = {}): Promise<boolean> {
  return this.openConfirmAsync({ title: options.title ?? 'ยืนยันการลบ', content, data: options.data ?? {}, variant: 'delete', primaryLabel: 'ลบ' })
}
```

### QUALITY-03 nested ternary

```ts
// before
const message = status === 1 ? 'รับคำขอสำเร็จ' : status === 2 ? 'บันทึกผลการพิจารณาสำเร็จ' : this.editId() ? 'แก้ไขคำขอสำเร็จ' : 'ส่งคำขอทำ Dashboard สำเร็จ'
// after (suite-ng b68a9d9)
let message = 'ส่งคำขอทำ Dashboard สำเร็จ'
if (status === 1) {
  message = 'รับคำขอสำเร็จ'
} else if (status === 2) {
  message = 'บันทึกผลการพิจารณาสำเร็จ'
} else if (this.editId()) {
  message = 'แก้ไขคำขอสำเร็จ'
}
```

Four or more cases with fixed keys: a lookup `Record<Status, string>` is shorter. Inside `computed()`, use a block body with early returns (platform-ng `1082b9f9` `chunkAccept`).

### ADV-28 shared helper instead of copied loops

```ts
// before: `.replace(/\/+$/, '')` (S5852) in six files, then six hand-written while loops
// after: one helper with a test, imported everywhere
export function trimTrailingSlashes(value: string | null | undefined): string {
  if (!value) return ''
  let end = value.length
  while (end > 0 && value.codePointAt(end - 1) === 47) end--
  return value.slice(0, end)
}
```

Before adding a helper, search `core/utils` and `@agrimap/*` for an existing one (frontend reuse index).

### ADV-40 `as any`

```ts
// before
const content = sharesResponse?.content as any
const canEdit = content?.canEdit ?? content?.can_edit
// after: type the two wire shapes once; the generated API type wins when it exists
type SharePermissionFlags = Partial<Record<'canEdit' | 'can_edit', boolean | 0 | 1 | '0' | '1'>>
private determineCanEditPermission(content: SharePermissionFlags | undefined): boolean { /* ... */ }
```

### QUALITY-01 extract helpers

Split a long method into named steps that each own one decision (platform-ng `a2924c4a`: `determineCanEditPermission`, `applyGeneralShare`; `c1fb6dd2`: `requestStatusItems`, `featureMenuItems`). Keep validation order and messages; a validator that must mark every invalid field keeps `filter(...)` instead of `find(...)` (platform-ng `1082b9f9` comment).

## More before/after

### ADV-05 unused local

```ts
// before
const total = rows.length; // never read
this.facade.load(id);
// after
this.facade.load(id);
```

### ADV-20 unused import

```ts
// before
import { Component, OnInit, inject } from '@angular/core'; // OnInit not implemented
import * as XLSX from 'xlsx';                                // never referenced (S1128 on XLSX)
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'; // takeUntilDestroyed unused
// after: remove only the unused names, keep the used ones
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
```

Check: the symbol is not used in a template (`.html`), decorator, `declare`, type-only position or conditional compilation (`#if`). Removing a side-effect import (`import 'zone.js'`, polyfills) is not ADV-20.

### ADV-21 TODO/FIXME

```ts
// before
// TODO: add error handling
save(): void { this.facade.save(this.form.getRawValue()); }
// after: either implement it now or report it to the requester; never leave the marker
save(): void { this.facade.save(this.form.getRawValue()); }
```

A TODO that records an assumption must not just be deleted: that hides the risk. Encode the assumption in code and report it.

```ts
// before (S1135: "Complete the task associated to this TODO comment")
// TODO(API): swagger does not document action codes; assumed 1=Disable, 2=Recovery, 3=Refresh.
this.api.applyAction(id, 1);
// after: a named constant carries the meaning; the open API question goes in the delivery summary
export const OperationAction = { Disable: 1, Recovery: 2, Refresh: 3 } as const;
this.api.applyAction(id, OperationAction.Disable);
```

Summary line: "Action codes 1/2/3 are not in the swagger; confirm with the agmws-license-management owner." When the backend contract documents them, use the generated enum instead.

Never add TODO/FIXME/HACK markers, including ones copied from a snippet, template or generator. Unfinished work goes in the delivery summary. Existing TODOs written by people are reported (recommend), not deleted, unless the work they describe is done in this task.

### ADV-22 unused package

```jsonc
// before: package.json
"dependencies": { "@angular/core": "...", "xlsx": "^0.18.5" } // no import of 'xlsx' anywhere
// after: remove the entry and update the lock file with the package manager (npm uninstall xlsx)
```

Check before removing: search all source, templates, config (`angular.json` scripts/styles, `builder`), build scripts, transitive peer requirements and reflection/DI registration; then restore, build and test. Never add a package the change does not use. A used package with a known vulnerability (the npm `xlsx` 0.18.x line has published advisories) is a security finding: report it with the advisory; upgrading or replacing it is a dependency change that follows the decision boundary.

### ADV-01 overload adjacency

```ts
// TS overload signatures sit directly above their implementation
format(value: Date): string;
format(value: string): string;
format(value: Date | string): string { /* ... */ }
```

### ADV-03 redundant cast

```ts
// before
const name = (user.name as string).trim(); // user.name is already string
// after
const name = user.name.trim();
```

### ADV-19 void operator

```ts
// before
if (from && to) void this.facade.loadUserActivity(mode, from, to, bucket);
// after
if (from && to) {
  this.facade.loadUserActivity(mode, from, to, bucket);
}
```

### QUALITY-01 split validation

```ts
// before: one function with 12 guarded ifs (S3776 = 16)
getDashboardUserActivity({ mode, from, to, bucket_minutes, source, time_zone }: Params) {
  if (mode === undefined || mode === null) { throw new Error('mode is required'); }
  if (mode !== undefined && mode !== null && !/^(login-trend|daily-distribution)$/.test(mode)) { throw new Error('...'); }
  // ...same for from, to, bucket_minutes, source
}
// after: one named check per field; the function only orchestrates
getDashboardUserActivity(params: Params) {
  validateUserActivityParams(params);
  return this.http.get<Response>(url, { params: toQueryParams(params) });
}
function requirePattern(name: string, value: string | null | undefined, pattern: RegExp): void {
  if (value === undefined || value === null) { throw new Error(`${name} is required`); }
  if (!pattern.test(value)) { throw new Error(`${name} does not match pattern`); }
}
```

In `generated-apis/` apply this to the gencode-api template and regenerate; never hand-edit generated files.

### ADV-20 / ADV-48 import hygiene

```ts
// before
import { catchError, EMPTY, map, Observable, tap, throwError, finalize, switchMap, of } from 'rxjs' // switchMap, of unused
import { FormGroup, AbstractControl, ValidationErrors, ReactiveFormsModule } from '@angular/forms'
import { FormsModule } from '@angular/forms'                                                      // S3863
// after
import { catchError, EMPTY, map, Observable, tap, throwError, finalize } from 'rxjs'
import { FormGroup, AbstractControl, ValidationErrors, ReactiveFormsModule, FormsModule } from '@angular/forms'
```

Before removing a module such as `FormsModule`, check the component's `imports: []` and the template (`ngModel`). `rxjs` and `rxjs/operators` are different modules; new code imports operators from `rxjs`.

### ADV-47 deprecated beforeunload API

```ts
// before
onBeforeUnload(event: BeforeUnloadEvent): void {
  if (this.largeUpload.atRisk()) { event.preventDefault(); event.returnValue = '' }
}
// after: preventDefault() is the standard trigger for the leave-page prompt
onBeforeUnload(event: BeforeUnloadEvent): void {
  if (this.largeUpload.atRisk()) { event.preventDefault() }
}
```

Check the supported browsers first: if one still needs `returnValue`, keep it and resolve the issue in SonarQube with that reason, not a bare NOSONAR (QUALITY-08).

### ADV-49 one-case switch

```ts
// before
switch (step) {
  case 'CHECK_LAYER_IN_WORKSPACE': return 'กำลังตรวจสอบชั้นข้อมูลภายในไฟล์...'
  default: return 'กำลังประมวลผล...'
}
// after
return step === 'CHECK_LAYER_IN_WORKSPACE' ? 'กำลังตรวจสอบชั้นข้อมูลภายในไฟล์...' : 'กำลังประมวลผล...'
```

When more steps are coming, a `Record<Step, string>` lookup with a default is clearer than a growing switch.

### QUALITY-06 return closing the last branch

```ts
// before
if (this.currentStep() === 2) {
  this.handleStepTwo();
  return;   // last statement of the method
}
// after
if (this.currentStep() === 2) {
  this.handleStepTwo();
}
```
