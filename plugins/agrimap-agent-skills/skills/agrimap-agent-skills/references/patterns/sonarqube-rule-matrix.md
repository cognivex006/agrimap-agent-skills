# SonarQube rule matrix (C# and TypeScript)

One table of every SonarQube/Roslyn finding the team has met in AgriMap scans, by language. Read it before writing or refactoring C# (`agmws-*`, `agmbo-*`, `AgriMap.*`) or TypeScript (`agmwa-*`, `@agrimap/*`) and before fixing a scan finding. Policy (notice, recommend-first, safe tier) stays in [sonarqube-remediation.md](../sonarqube-remediation.md); rule text stays in [csharp.md](csharp.md), [frontend.md](frontend.md) and [security-baseline.md](security-baseline.md); longer worked fixes are in [sonarqube-fix-examples.md](sonarqube-fix-examples.md). This file adds the language split and one before/after per rule.

## Contents

- [How to read the columns](#how-to-read-the-columns)
- [1. Shared rules (C# and TypeScript)](#1-shared-rules-c-and-typescript)
- [2. C# only](#2-c-only)
- [3. TypeScript/JavaScript only](#3-typescriptjavascript-only)
- [4. Before/after by rule](#4-beforeafter-by-rule)
- [5. After a fix](#5-after-a-fix)

## How to read the columns

- **Shared** rules exist in both languages under the same concept; write the fix in the idiom of the language you are in, never copy the other language's syntax.
- **Write new code** — `must`: code you write or rewrite never raises it. `safe`: also fix it in a file the current task already edits. `recommend`: report with evidence, fix only on request.
- **Seen in** is the scan where the team found it (evidence for why the row exists), not the only place it applies.

## 1. Shared rules (C# and TypeScript)

| Concept | Golden | C# key | TS/JS key | Write new code | Seen in |
| --- | --- | --- | --- | --- | --- |
| Cognitive Complexity ≤ 15 | QUALITY-01 | csharpsquid:S3776 | typescript:S3776 | must | agmws-plus PlusRight (18); agmwa-license-management generated API (16); observability script (57) |
| At most 7 if/else-if per function | QUALITY-01 | team rule | team rule | must | team limit |
| At most 7 parameters | QUALITY-02 | csharpsquid:S107 | typescript:S107 | must | team limit |
| No nested ternary | QUALITY-03 | csharpsquid:S3358 | typescript:S3358 | must | anonymous-object branches |
| No redundant `return;`/`continue;` | QUALITY-06 | csharpsquid:S3626 | typescript:S3626 | must | agmws-* |
| Unused local variable | ADV-05 | csharpsquid:S1481 | typescript:S1481 | must + safe | agmws-identity `isDevMode`, `data2` |
| Unused import / `using` | ADV-20 | csharpsquid:S1128, IDE0005 | typescript:S1128 | must + safe | agmwa-license-management `operations-console.component.ts`: `import * as XLSX from 'xlsx'`, `takeUntilDestroyed` |
| TODO/FIXME left in code | ADV-21 | csharpsquid:S1135 | typescript:S1135 | must + safe | agmwa-license-management `operations-console.facade.ts`: `// TODO(API): ... assumed 1=Disable, 2=Recovery, 3=Refresh` |
| Declared but unused package | ADV-22 | — (dependency hygiene) | — (dependency hygiene) | must (never add); recommend (remove) | unused `xlsx` in a frontend, reported 2026-11-04 |
| Overloads not adjacent | ADV-01 | csharpsquid:S4136 | typescript:S4136 | recommend | agmws-identity `IOAuthUseCase` |
| Redundant cast / assertion | ADV-03 | csharpsquid:S1905 | typescript:S4325 | recommend | agmws-identity `as List<...>` |
| Verbose regex character class | ADV-16 | csharpsquid:S6353 | javascript:S6353 | must + safe (TS); C# with Unicode caveat | release-notify.mjs |
| Regex backtracking | SEC-23 | csharpsquid:S5852 | javascript:S5852 | must | release-notify.mjs |

## 2. C# only

| Smell | Golden | Key | Write new code | Seen in |
| --- | --- | --- | --- | --- |
| Member uses no instance data → `static` | ADV-02 | CA1822, S2325 | must | agmws-identity `RedirectWithErrorAsync`, `BuildAuthFlowPayload`; agmws-plus `OnException`, `ServiceFixture.Create` |
| Caller-info argument passed explicitly | ADV-04 | S3236 | safe | agmws-identity `ThrowIfNull(name, "key")` |
| `Assert.IsAssignableFrom<T>` | ADV-06 | xUnit2032 | must | agmws-identity tests |
| `Dispose()` without `GC.SuppressFinalize` | ADV-07 | CA1816 | recommend | agmws-identity tests |
| Constant array argument | ADV-08 | CA1861 | must | agmws-plus `LegacyCompatibilityTests` |
| `Regex.IsMatch` without `[GeneratedRegex]` | ADV-09 | SYSLIB1045 | recommend | agmws-plus MAC address check |
| Header indexer instead of typed property | ADV-10 | ASP0015 | safe | agmws-identity `X-Requested-With`, `Authorization`, `Cookie`, `Cache-Control`, `Expires` |
| One-char string overload | ADV-11 | CA1866, CA1865 | must | agmws-identity `StartsWith("/")` |
| Hardcoded URI or path delimiter | ADV-12 | S1075 | recommend (skip when unsure) | agmws-identity `Login.cshtml`, `"/" + url` |
| Interface where a concrete private type fits | ADV-13 | CA1859 | recommend (skip when unsure) | agmws-identity `RedirectToLogin`, `ReadMetadata` |
| Loop body is only an `if` filter | ADV-14 | S3267 | must | agmws-identity `BuildQueryString`; agmws-license-management `ImportFileParserResolver`, `SensitiveParameters` |
| `ContainsKey` then indexer | ADV-17 | CA1854 | must | agmws-plus `GetCustomHeaderToken` |
| `SHA256.Create().ComputeHash` | ADV-18 | CA1850 | must | agmws-plus `HashExtensions` |
| Reserved exception thrown | ERR-06 | S112 | must | agmws-identity `?? throw new NullReferenceException()` |
| `paramName` not a real parameter | ERR-07 | S3928, CA2208 | must | agmws-identity `ArgumentNullException("key")`, `("s")` |
| Cookie without literal `Secure`/`HttpOnly` | SEC-20 | S2092, S3330 (hotspot) | must | agmws-license-management `AuthController` |

## 3. TypeScript/JavaScript only

| Smell | Golden | Key | Write new code | Seen in |
| --- | --- | --- | --- | --- |
| `void` operator on a promise/call | ADV-19 | typescript:S3735 | must | agmwa-license-management operations console |
| `String.match` without `g` | ADV-15 | javascript:S6594 | must | release-notify.mjs |
| Hand-edited `generated-apis/` | frontend.md | (raises S3776 etc.) | must: fix the gencode-api template, regenerate | agmwa-license-management generated API |

## 4. Before/after by rule

Examples not already in [sonarqube-fix-examples.md](sonarqube-fix-examples.md). Keep the real code's order, messages, side effects and contracts.

### ADV-05 unused local — C# and TS

```csharp
// before
var isDevMode = env == Environments.Development || env == "Inhouse";   // never read
var data2 = result?.GetOutputParameter<DataTable>("data2")?.ToDictionary(); // never read
// after: delete both; keep a needed side effect as `_ = Call();`
```

```ts
// before
const total = rows.length; // never read
this.facade.load(id);
// after
this.facade.load(id);
```

### ADV-20 unused import — C# and TS

```csharp
// before
using System.Text;            // nothing from System.Text is used
using AgriMap.Web.Service.Shared.Helpers;
// after: delete the unused using; keep global usings untouched (NS-01)
using AgriMap.Web.Service.Shared.Helpers;
```

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

### ADV-21 TODO/FIXME — C# and TS

```csharp
// before (snippet scaffold left behind)
public Task<PlotDto> GetAsync(int id)
{
    // TODO: implement
    return _repository.GetAsync(id);
}
// after: the code is complete, so the TODO goes
public Task<PlotDto> GetAsync(int id) => _repository.GetAsync(id);
```

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

### ADV-22 unused package — package.json and .csproj

```jsonc
// before: package.json
"dependencies": { "@angular/core": "...", "xlsx": "^0.18.5" } // no import of 'xlsx' anywhere
// after: remove the entry and update the lock file with the package manager (npm uninstall xlsx)
```

```xml
<!-- before: .csproj -->
<PackageReference Include="Newtonsoft.Json" Version="13.0.3" /> <!-- no Newtonsoft namespace used -->
<!-- after: remove the PackageReference -->
```

Check before removing: search all source, templates, config (`angular.json` scripts/styles, `builder`), build scripts, transitive peer requirements and reflection/DI registration; then restore, build and test. Never add a package the change does not use. A used package with a known vulnerability (the npm `xlsx` 0.18.x line has published advisories) is a security finding: report it with the advisory; upgrading or replacing it is a dependency change that follows the decision boundary.

### ADV-01 overload adjacency — C# and TS

```csharp
// before
Task<RevokeTokenResponseDto> RevokeTokenAsync(ControllerBase controllerBase, RevokeTokenRequestDto request);
Task<IActionResult> LoginAsync(...);
Task<RevokeTokenResponseDto> RevokeTokenAsync(RevokeTokenRequestDto request);
// after: all overloads together, fewest parameters first
Task<RevokeTokenResponseDto> RevokeTokenAsync(RevokeTokenRequestDto request);
Task<RevokeTokenResponseDto> RevokeTokenAsync(ControllerBase controllerBase, RevokeTokenRequestDto request);
Task<IActionResult> LoginAsync(...);
```

```ts
// TS overload signatures sit directly above their implementation
format(value: Date): string;
format(value: string): string;
format(value: Date | string): string { /* ... */ }
```

### ADV-03 redundant cast — C# and TS

```csharp
// before
return result.DataTable.ToDictionary() as List<Dictionary<string, object?>> ?? new List<Dictionary<string, object?>>();
// after: ToDictionary() already returns that type
return result.DataTable.ToDictionary() ?? [];
```

```ts
// before
const name = (user.name as string).trim(); // user.name is already string
// after
const name = user.name.trim();
```

### ADV-02 static member — C# only

```csharp
// before
private void OnException(ObjectResult result, ResultExecutingContext context) { /* no field or this */ }
// after (and update callers that used an instance, e.g. fixture.Create() → ServiceFixture.Create())
private static void OnException(ObjectResult result, ResultExecutingContext context) { /* ... */ }
```

### ADV-04 caller-info argument — C# only

```csharp
// before
ArgumentNullException.ThrowIfNull(name, "key");
// after
ArgumentNullException.ThrowIfNull(name);
```

### ADV-09 generated regex — C# only

```csharp
// before
if (!Regex.IsMatch(request.Macaddress, @"\A(?:[0-9A-Fa-f]{12}|...)\z", RegexOptions.CultureInvariant)) { ... }
// after: class becomes partial; the timeout also closes S6444
[GeneratedRegex(@"\A(?:[0-9A-Fa-f]{12}|...)\z", RegexOptions.CultureInvariant, matchTimeoutMilliseconds: 1000)]
private static partial Regex MacAddressRegex();
if (!MacAddressRegex().IsMatch(request.Macaddress)) { ... }
```

### ADV-10 typed headers — C# only

```csharp
// before
var auth = httpContext.Request.Headers["Authorization"].ToString();
headers["Cache-Control"] = $"public,max-age={_days * 24 * 60 * 60}";
var ajax = string.Equals(controller.Request.Headers["X-Requested-With"], "XMLHttpRequest", StringComparison.OrdinalIgnoreCase);
// after
var auth = httpContext.Request.Headers.Authorization.ToString();
headers.CacheControl = $"public,max-age={_days * 24 * 60 * 60}";
var ajax = string.Equals(controller.Request.Headers.XRequestedWith, "XMLHttpRequest", StringComparison.OrdinalIgnoreCase);
```

### ADV-12 hardcoded URI — C# only (skip when unsure)

```csharp
// before
var easyServiceLoginUrl = "https://webapp.ldd.go.th/singlesignon/client/login.php";
// after: only when every environment's value is proven
var easyServiceLoginUrl = _configuration["WebServiceSettings:EasyService:LoginUrl"];
```

### ADV-13 concrete private types — C# only (skip when unsure)

```csharp
// before
private IActionResult RedirectToLogin(Controller controller, Dictionary<string, StringValues> query) => controller.Redirect(url);
// after: private, every return is a RedirectResult
private RedirectResult RedirectToLogin(Controller controller, Dictionary<string, StringValues> query) => controller.Redirect(url);
```

### ADV-07 SuppressFinalize — C# only

```csharp
public void Dispose()
{
    LogManager.Configuration = _originalConfiguration;
    GC.SuppressFinalize(this);
}
```

### ERR-06 / ERR-07 — C# only

```csharp
// before
var scheme = (context.HttpContext ?? throw new NullReferenceException()).Request.Scheme;
if (TryMatchValue(param.Name ?? throw new ArgumentNullException("key"), ...)) { ... }
// after: not a parameter of this method, so not an Argument*Exception with a fake name
var scheme = (context.HttpContext ?? throw new InvalidOperationException("HttpContext is not available.")).Request.Scheme;
if (TryMatchValue(param.Name ?? throw new InvalidOperationException("Constructor parameter has no name."), ...)) { ... }
```

### ADV-19 void operator — TS only

```ts
// before
if (from && to) void this.facade.loadUserActivity(mode, from, to, bucket);
// after
if (from && to) {
  this.facade.loadUserActivity(mode, from, to, bucket);
}
```

### QUALITY-01 in TS — split validation

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

## 5. After a fix

Rerun lint, build and tests; run the project's SonarQube analysis when available and report its actual result. A clean local build does not prove a finding is closed, and a skipped or unverified rule is named in the summary ([sonarqube-remediation.md](../sonarqube-remediation.md)).
