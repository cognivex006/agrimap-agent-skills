# SonarQube — C#

C# rules for `agmws-*`, `agmbo-*` and `AgriMap.*` (`csharpsquid` and Roslyn analyzers). Column meanings and the cross-language concept map: [sonarqube-matrix.md](../sonarqube-matrix.md). Rule text: [csharp.md](../csharp.md); policy: [sonarqube-remediation.md](../../sonarqube-remediation.md); longer fixes: [sonarqube-fix-examples.md](../sonarqube-fix-examples.md). Security hotspots: [security/csharp.md](../security/csharp.md).

## Contents

- [Complexity and structure](#complexity-and-structure)
- [Dead code and noise](#dead-code-and-noise)
- [Types, members and APIs](#types-members-and-apis)
- [Errors, async and logging](#errors-async-and-logging)
- [Tests](#tests)
- [Before/after](#beforeafter)
- [More before/after](#more-beforeafter)
- [agmws-plus scan (5.0.17)](#agmws-plus-scan-5017)

## Complexity and structure

| Golden | Key | Smell | New code | Existing code | Seen |
| --- | --- | --- | --- | --- | --- |
| QUALITY-01 | S3776 | Cognitive Complexity above 15 | must | recommend | plus `PlusRight` (18); dynamic-dashboard `601d236` (split into `ResolveContentProxyUrlAsync`, `ResolveQueryConfigPayload`) |
| QUALITY-01 | team | More than 7 `if`/`else if` in one method | must | recommend | team limit |
| QUALITY-02 | S107 | More than 7 parameters | must | recommend | identity `79dc5af` (`GenerateTokenParams` record); license-management `2d30133` (`ImportPreviewRequest`) |
| QUALITY-03 | S3358 | Nested ternary, also `x is { } v ? (v == "a" ? ...)` | must | safe | identity `90c5edd`; dynamic-dashboard `ac3ff79` |
| QUALITY-06 | S3626 | Redundant trailing `return;`/`continue;` | must | safe | agmws-* |
| ADV-25 | S1871 | Two branches with the same body | must | recommend | catalog (TS twin seen in pro-ng) |
| ADV-26 | S2681 | Multi-line `if`/loop body without braces | must | recommend | catalog |
| ADV-39 | S1066 | `if` nested directly in an `if` with no `else` | must | safe | catalog |
| ADV-14 | S3267 | `foreach` body is only an `if` filter | must | recommend | identity `BuildQueryString`; license-management `ImportFileParserResolver`; dynamic-dashboard `9d52fd2`; license-management `ImportFileParserResolver` (`foreach (var signature in ZipSignatures)`), `SensitiveParameters` (`foreach (var key in masked.Keys.ToList())`) still open |
| ADV-30 | S2971, S6602, S6603, S6605 | `Where(p).FirstOrDefault()`, `Any(p)` on `List<T>`, `All(p)` on `List<T>` | must | safe | dynamic-dashboard `ade0d6e` (`FirstOrDefault(w => w.Checked)`) |

## Dead code and noise

| Golden | Key | Smell | New code | Existing code | Seen |
| --- | --- | --- | --- | --- | --- |
| ADV-05 | S1481 | Unused local | must | safe | identity `isDevMode`, `data2` |
| ADV-24 | S1854 | Value assigned and overwritten or never read | must | safe | identity `var key = configuration[keyName]` (`a08dd1d`); file-management `bbd0f29` |
| ADV-20 | S1128, IDE0005 | Unused `using` | must | safe | file-management `804df07`; dynamic-dashboard `b7f1b87`; identity `1eee1c3` (21 unused usings in `Program.cs`) |
| ADV-21 | S1135 | TODO/FIXME | must | safe | agmws-* |
| ADV-47 | CS0618 | Call to an `[Obsolete]` member | must (use the replacement it names) | recommend | catalog |
| ADV-49 | S1301 | `switch` with one case plus `default` | must (`if`/`else` or ternary) | safe | catalog (TS twin seen) |
| ADV-23 | S125 | Commented-out code | must | safe | dynamic-dashboard `601d236` (`// var filterAppiled`); identity (`// var items = await LoadMockupData()`) |
| ADV-29 | S1125 | `x == true`, `x != false` on `bool` | must | safe (non-nullable only) | dynamic-dashboard `9d52fd2`, `7700d73` |
| ADV-33 | S1186 | Empty method without a comment | must | recommend | catalog |
| ADV-38 | S1192 | Same string literal 3+ times | should | recommend | catalog; use `const`, configuration or the message table, never invent a message (ERR rules) |
| ADV-28 | S4144 | Two methods with the same body | must | recommend | file-management `f8a987e` (three preview actions → `ExecutePreview`) |
| ADV-22 | team | Unused `PackageReference` | must (never add) | recommend | — |

## Types, members and APIs

| Golden | Key | Smell | New code | Existing code | Seen |
| --- | --- | --- | --- | --- | --- |
| ADV-02 | CA1822, S2325 | Member uses no instance data (filters, middleware helpers too) | must | recommend | plus `ResponseActionResultFilter.OnAppException`, `OnException`; `GlobalExceptionMiddleware.ResolveStatusCode`, `GetDefaultErrorCode`; identity `RedirectWithErrorAsync`; plus `OnException`; plus tests `ServiceFixture.Create` |
| ADV-32 | S2933 | Private field assigned only in the constructor is not `readonly` | must | safe | catalog |
| ADV-01 | S4136 | Overloads not adjacent | should | recommend | identity `IOAuthUseCase` |
| ADV-03 | S1905 | Redundant cast | must | recommend | identity `as List<...>` |
| ADV-04 | S3236 | Caller-info argument passed explicitly | must | recommend | identity `ThrowIfNull(name, "key")` |
| ADV-08 | CA1861 | Constant array argument | must | recommend | plus `LegacyCompatibilityTests`; plus legacy route list (`new[] { "GET api/...", ... }.Order().ToArray()`) and expected `getActions`; identity tests `Assert.Equal(new[] { "modetor" }, response.Roles)`, `new[] { "superadmin", "admin", "modetor" }`, `new[] { 1, 2 }.BuildPagedResponse(...)` |
| ADV-09 | SYSLIB1045 | `Regex` with constant pattern, no `[GeneratedRegex]` | should | recommend | plus MAC address check |
| ADV-10 | ASP0015 | Header indexer instead of typed property (`Cache-Control`, `Pragma`, `Expires` too) | must | safe | plus `BrowserCacheAttribute`, no-cache action filter, `ResponseActionResultFilter` "webscan cache policy"; identity `Authorization`, `X-Requested-With`; plus `ProgramExtensions.GetHeaderToken` (`Headers["Authorization"]`) |
| ADV-11 | CA1866, CA1865 | One-char string overload | must | safe | identity `StartsWith("/")` |
| ADV-12 | S1075 | Hardcoded absolute URI | should | skip-if-unsure | identity `Login.cshtml` |
| ADV-13 | CA1859 | Interface or base type where one private concrete type flows (also `Exception` → `InvalidOperationException`) | should | skip-if-unsure | plus `DataTableExtensions.CreateConstructorException<T>`; identity `RedirectToLogin`; license-management `ReadSharedStrings` (`IReadOnlyList<string>` → `List<string>`), test helper `Upload(...)` (`IFormFile` → `FormFile`) |
| ADV-17 | CA1854 | `ContainsKey` then indexer | must | safe | plus `GetCustomHeaderToken`; identity `59872c9` (`lddUser["USER_ID"]` → `TryGetValue`); plus `ProgramExtensions.GetCustomHeaderToken` (`Headers.ContainsKey("token")`), `TelerikReportExtensions` (`data.ContainsKey(datasetName)`) |
| ADV-46 | CA1826 | `FirstOrDefault()`/`First()`/`Last()`/`Count()` on an `IReadOnlyList<T>`, array or `List<T>` | must | safe | plus `ProgramExtensions` route dump (`HttpMethods.FirstOrDefault() ?? "ANY"`) |
| ADV-50 | CA1862 | Case check through `ToLower*()`/`ToUpper*()` and `==`/`!=` | must | recommend (see the caveat: the suggested fix can invert the check) | license-management `previewHash != previewHash.ToLowerInvariant()` |
| ADV-51 | CS9258 | Identifier named `field` (or `value`) inside a property accessor or expression-bodied property | must (`f`, `item`, or `@field`) | safe | license-management CSV record `IsBlank => Fields.TrueForAll(field => field.Length == 0)` |
| ADV-18 | CA1850 | `SHA256.Create().ComputeHash` (with a `StringBuilder` `x2` loop) | must | safe | plus `HashExtensions.ComputeSha256Hash`; plus `HashExtensions`; file-management `e32825d` still uses `Create()` |
| ADV-44 | CA1869 | `new JsonSerializerOptions { ... }` inside a method called per request | must | safe | plus procedure-log helper (`WriteIndented`, `UnsafeRelaxedJsonEscaping`); identity test `JsonSerializer.Serialize(response, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower })` |
| ADV-45 | CA1510, CA1511, CA1512, CA1513 | `if (x is null) throw new ArgumentNullException(nameof(x))` and the `ArgumentException`/`ArgumentOutOfRangeException`/`ObjectDisposedException` twins | must | safe | plus `PathExtensions.GetUrl`; license-management `PathExtensions.GetUrl` |
| ADV-36 | S6580, CA1305 | `Parse`/`ToString` without a format provider | should | skip-if-unsure | identity `a08dd1d` kept culture-sensitive `decimal.Parse` on purpose |
| — | CS8618 | Non-nullable property not initialized | must (`required` or initializer) | recommend | file-management `218fb21` (`required T Data`) |
| — | CS8600/CS8625 | `null` assigned to a non-nullable local | must (`T?`) | safe | dynamic-dashboard `5e87c65` (`MapServiceMetadata? mapService`) |
| NULL-* | S4325-like `!` | `x!.Y!.Z!` chains to silence warnings | must not | recommend | identity `79dc5af`, dynamic-dashboard (`config!.TextConfig!.FieldFormats!`) — guard once, then use the narrowed value |

## Errors, async and logging

| Golden | Key | Smell | New code | Existing code | Seen |
| --- | --- | --- | --- | --- | --- |
| ERR-06 | S112 | Reserved exception thrown (`NullReferenceException`, `Exception`) | must | recommend | identity `?? throw new NullReferenceException()` |
| ERR-07 | S3928, CA2208 | `paramName` is not a parameter of this method | must | recommend | identity `a08dd1d` (`ArgumentNullException("s")` → `ThrowIfNull(userId)`), `3531e90` (`RequireDependency`) |
| ADV-34 | S108, S2486 | Empty `catch { }` or ignored exception | must | recommend | dynamic-dashboard, file-management `218fb21` |
| ASYNC-03 | S4462, S6966 | `.GetAwaiter().GetResult()`, `.Result`, `.Wait()` in async-capable code | must | recommend | dynamic-dashboard `ac3ff79` (`ReadToEndAsync().GetAwaiter().GetResult()` kept) |
| — | CS1998 | `async` method with no `await` | must (drop `async`, return `Task.FromResult` or make it sync) | safe | identity `5718b0f` (`Welcome()`) |
| OBS-01 | S106 | `Console.Write*` for diagnostics | must | recommend | file-management `218fb21` |
| OBS-* | S2629, CA2254 | Interpolated or concatenated log template | must | safe | catalog: `_logger.LogInformation("Loaded {Count}", n)` |
| OBS-* | S2139 | Log and rethrow the same exception | should | recommend | catalog |
| — | IDE0063 | Nested `using (...) { }` blocks | should (`using var`) | safe | dynamic-dashboard `ac3ff79`; file-management (`using var fs`) |

## Tests

| Golden | Key | Smell | New code | Existing code | Seen |
| --- | --- | --- | --- | --- | --- |
| ADV-06 | xUnit2032 | `Assert.IsAssignableFrom<T>` | must | recommend | identity tests |
| ADV-07 | CA1816 | `Dispose()` without `GC.SuppressFinalize` | should | recommend | identity tests |
| — | S2699 | Test without an assertion | must | recommend | catalog |
| — | S3415 | `Assert.Equal(actual, expected)` argument order | must | safe | catalog |

## Before/after

Only rows not already in [sonarqube-fix-examples.md](../sonarqube-fix-examples.md).

### ADV-24 dead store

```csharp
// before (identity AesConfigurationHelper): key read in the public method, read again below
public static string Encrypt(IAesService aes, IConfiguration configuration, string? plainText, string keyName)
{
    var key = configuration[keyName];
    ...
}
// after: the public method resolves once and delegates; the private overload owns validation
public static string Encrypt(IAesService aes, IConfiguration configuration, string? plainText, string keyName)
    => Encrypt(aes, plainText, configuration[keyName]);
private static string Encrypt(IAesService aes, string? plainText, string? key) { /* same validation order */ }
```

### ADV-28 identical method bodies

```csharp
// before (file-management FileController): three actions, the same 8-line body
public async Task<FileResult> PreviewImage(string file_id) { GuardFileId(file_id); var result = ...; ... }
// after: one private body, the actions keep their routes and attributes
public async Task<FileResult> PreviewImage(string file_id) => await ExecutePreview(file_id);
private async Task<FileResult> ExecutePreview(string file_id) { GuardFileId(file_id); ... }
```

### ADV-29 boolean literal — nullable caveat

```csharp
.Where(w => w.Checked == true)       // Checked is bool  → .Where(w => w.Checked)
items?.Any(p) == true                // bool? from ?.     → items?.Any(p) ?? false   (or `is true`)
otherValue.Checked != true           // Checked is bool?  → keep, or `is not true`; never `!otherValue.Checked`
```

### ADV-30 LINQ terminal predicate

```csharp
// before
var fieldFormat = config.TextConfig.FieldFormats.Where(w => w.Checked).FirstOrDefault();
// after (on List<T>, S6602 prefers Find; keep FirstOrDefault on IEnumerable)
var fieldFormat = config.TextConfig.FieldFormats.FirstOrDefault(w => w.Checked);
```

### ADV-34 swallowed exception

```csharp
// before
try { list.Add(Create(row)); } catch { }
// anti-fix (file-management 218fb21): Console.WriteLine + continue
// after: narrow the type, log through ILogger with context, keep the loop going only if that is the intent
catch (InvalidCastException ex)
{
    _logger.LogWarning(ex, "Skipped row {RowIndex}: cannot map to {Type}", index, typeof(T).Name);
}
```

Keep an intentionally ignored exception explicit: narrow type plus a comment saying why it is safe.

### QUALITY-02 parameter object

```csharp
// before: 9 parameters
private Task<TokenResponseDto> GenerateAccessTokenResponse(string userId, string clientId, string deviceId, string username, string fcmToken, List<string> roles, List<int> roleIds, object? data, ...)
// after (identity 79dc5af): a private record groups the inputs that travel together
private sealed record GenerateTokenParams(string UserId, string ClientId, string DeviceId, string Username, string FcmToken, List<string> Roles, List<int> RoleIds);
private Task<TokenResponseDto> GenerateAccessTokenResponse(GenerateTokenParams tokenParams, object? data = null)
```

A repository/SP parameter list becomes a request type in Domain (license-management `ImportPreviewRequest`); keep the SP parameter names and order.

### ASYNC-03 sync over async

```csharp
// before (dynamic-dashboard StringExtensions)
var bodyContent = reader.ReadToEndAsync().GetAwaiter().GetResult();
// after: make the caller async and await; when the caller cannot be async, report it instead of hiding it
var bodyContent = await reader.ReadToEndAsync(cancellationToken);
```

## More before/after

### ADV-05 unused local

```csharp
// before
var isDevMode = env == Environments.Development || env == "Inhouse";   // never read
var data2 = result?.GetOutputParameter<DataTable>("data2")?.ToDictionary(); // never read
// after: delete both; keep a needed side effect as `_ = Call();`
```

### ADV-20 unused import

```csharp
// before
using System.Text;            // nothing from System.Text is used
using AgriMap.Web.Service.Shared.Helpers;
// after: delete the unused using; keep global usings untouched (NS-01)
using AgriMap.Web.Service.Shared.Helpers;
```

Check: the symbol is not used in a template (`.html`), decorator, `declare`, type-only position or conditional compilation (`#if`). Removing a side-effect import (`import 'zone.js'`, polyfills) is not ADV-20.

### ADV-21 TODO/FIXME

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

A TODO that records an assumption must not just be deleted: that hides the risk. Encode the assumption in code and report it.

Summary line: "Action codes 1/2/3 are not in the swagger; confirm with the agmws-license-management owner." When the backend contract documents them, use the generated enum instead.

Never add TODO/FIXME/HACK markers, including ones copied from a snippet, template or generator. Unfinished work goes in the delivery summary. Existing TODOs written by people are reported (recommend), not deleted, unless the work they describe is done in this task.

### ADV-22 unused package

```xml
<!-- before: .csproj -->
<PackageReference Include="Newtonsoft.Json" Version="13.0.3" /> <!-- no Newtonsoft namespace used -->
<!-- after: remove the PackageReference -->
```

Check before removing: search all source, templates, config (`angular.json` scripts/styles, `builder`), build scripts, transitive peer requirements and reflection/DI registration; then restore, build and test. Never add a package the change does not use. A used package with a known vulnerability (the npm `xlsx` 0.18.x line has published advisories) is a security finding: report it with the advisory; upgrading or replacing it is a dependency change that follows the decision boundary.

### ADV-01 overload adjacency

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

### ADV-03 redundant cast

```csharp
// before
return result.DataTable.ToDictionary() as List<Dictionary<string, object?>> ?? new List<Dictionary<string, object?>>();
// after: ToDictionary() already returns that type
return result.DataTable.ToDictionary() ?? [];
```

### ADV-02 static member

```csharp
// before
private void OnException(ObjectResult result, ResultExecutingContext context) { /* no field or this */ }
// after (and update callers that used an instance, e.g. fixture.Create() → ServiceFixture.Create())
private static void OnException(ObjectResult result, ResultExecutingContext context) { /* ... */ }
```

### ADV-04 caller-info argument

```csharp
// before
ArgumentNullException.ThrowIfNull(name, "key");
// after
ArgumentNullException.ThrowIfNull(name);
```

### ADV-09 generated regex

```csharp
// before
if (!Regex.IsMatch(request.Macaddress, @"\A(?:[0-9A-Fa-f]{12}|...)\z", RegexOptions.CultureInvariant)) { ... }
// after: class becomes partial; the timeout also closes S6444
[GeneratedRegex(@"\A(?:[0-9A-Fa-f]{12}|...)\z", RegexOptions.CultureInvariant, matchTimeoutMilliseconds: 1000)]
private static partial Regex MacAddressRegex();
if (!MacAddressRegex().IsMatch(request.Macaddress)) { ... }
```

### ADV-10 typed headers

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

### ADV-12 hardcoded URI

```csharp
// before
var easyServiceLoginUrl = "https://webapp.ldd.go.th/singlesignon/client/login.php";
// after: only when every environment's value is proven
var easyServiceLoginUrl = _configuration["WebServiceSettings:EasyService:LoginUrl"];
```

### ADV-13 concrete private types

```csharp
// before
private IActionResult RedirectToLogin(Controller controller, Dictionary<string, StringValues> query) => controller.Redirect(url);
// after: private, every return is a RedirectResult
private RedirectResult RedirectToLogin(Controller controller, Dictionary<string, StringValues> query) => controller.Redirect(url);
```

### ADV-07 SuppressFinalize

```csharp
public void Dispose()
{
    LogManager.Configuration = _originalConfiguration;
    GC.SuppressFinalize(this);
}
```

### ERR-06 / ERR-07

```csharp
// before
var scheme = (context.HttpContext ?? throw new NullReferenceException()).Request.Scheme;
if (TryMatchValue(param.Name ?? throw new ArgumentNullException("key"), ...)) { ... }
// after: not a parameter of this method, so not an Argument*Exception with a fake name
var scheme = (context.HttpContext ?? throw new InvalidOperationException("HttpContext is not available.")).Request.Scheme;
if (TryMatchValue(param.Name ?? throw new InvalidOperationException("Constructor parameter has no name."), ...)) { ... }
```

## agmws-plus scan (5.0.17)

### ADV-10 cache headers in filters

```csharp
// before (BrowserCacheAttribute, no-cache filter, ResponseActionResultFilter)
var headers = context.HttpContext.Response.Headers;
headers["Cache-Control"] = $"public,max-age={_days * 24 * 60 * 60}";
headers["Expires"] = DateTime.UtcNow.AddDays(_days).ToString("R");
headers["Pragma"] = "no-cache";
// after: same StringValues, same text
headers.CacheControl = $"public,max-age={_days * 24 * 60 * 60}";
headers.Expires = DateTime.UtcNow.AddDays(_days).ToString("R");
headers.Pragma = "no-cache";
```

Write the whole header group in one place; when the same no-store set appears in several filters, one helper sets it (ADV-28).

### ADV-02 filter and middleware helpers

```csharp
// before: private helpers that read only their parameters
private void OnAppException(ObjectResult result, ResultExecutingContext context) { /* uses context.HttpContext only */ }
private int ResolveStatusCode(HttpContext context, Exception ex) { /* static maps + parameters */ }
private string GetDefaultErrorCode(int statusCode) => StatusErrorCodeMap.TryGetValue(statusCode, out var code) ? code : string.Empty;
// after
private static void OnAppException(ObjectResult result, ResultExecutingContext context) { /* ... */ }
private static int ResolveStatusCode(HttpContext context, Exception ex) { /* ... */ }
private static string GetDefaultErrorCode(int statusCode) => StatusErrorCodeMap.TryGetValue(statusCode, out var code) ? code : string.Empty;
```

Check: not an interface member (`OnActionExecuting`, `InvokeAsync`), not `virtual`/`override`, no `_field` or `this` use. The maps they read must already be `static readonly`.

### ADV-13 concrete exception type

```csharp
// before
private static Exception CreateConstructorException<T>(DataTable table) => new InvalidOperationException(...);
// after: every return is InvalidOperationException; `throw CreateConstructorException<T>(table);` stays the same
private static InvalidOperationException CreateConstructorException<T>(DataTable table) => new InvalidOperationException(...);
```

### ADV-18 hash with hex string

```csharp
// before
using (var sha256 = SHA256.Create())
{
    var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(input));
    var sb = new StringBuilder();
    foreach (var b in hashBytes) { sb.Append(b.ToString("x2")); }
    return sb.ToString();
}
// after: same lowercase hex
return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input))).ToLowerInvariant();
```

### ADV-44 cached JsonSerializerOptions

```csharp
// before: a new options object (and its metadata cache) on every call
var payload = JsonSerializer.Serialize(parameters, new JsonSerializerOptions
{
    WriteIndented = true,
    Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
});
// after
private static readonly JsonSerializerOptions ProcedureLogJsonOptions = new()
{
    WriteIndented = true,
    Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
};
var payload = JsonSerializer.Serialize(parameters, ProcedureLogJsonOptions);
```

Check: nothing mutates the options after first use (they become read-only). `UnsafeRelaxedJsonEscaping` is for log text only; never use it for HTML or a response body. Logging full procedure parameters is SEC-07: keep it Development-only (`ShouldWriteProcedureLog`) and mask sensitive keys.

### ADV-45 throw helpers

```csharp
// before
if (context is null)
    throw new ArgumentNullException(nameof(context));
// after: same exception type and ParamName
ArgumentNullException.ThrowIfNull(context);
// twins
ArgumentException.ThrowIfNullOrEmpty(name);            // CA1511
ArgumentOutOfRangeException.ThrowIfNegative(count);    // CA1512
ObjectDisposedException.ThrowIf(_disposed, this);      // CA1513
```

Check: the message text changes to the framework default; keep the explicit `throw` only when a test or client asserts a custom message. `?? throw new InvalidOperationException(...)` for a non-parameter value is correct and stays (ERR-07).

### ADV-10/17 token readers (ProgramExtensions)

```csharp
// before
var auth = ctx.Request.Headers["Authorization"].FirstOrDefault();
public static string? GetCustomHeaderToken(HttpContext ctx) =>
    ctx.Request.Headers.ContainsKey("token") ? ctx.Request.Headers["token"].ToString().Replace("Bearer ", "").Trim() : null;
// after
var auth = ctx.Request.Headers.Authorization.FirstOrDefault();
public static string? GetCustomHeaderToken(HttpContext ctx) =>
    ctx.Request.Headers.TryGetValue("token", out var token) ? token.ToString().Replace("Bearer ", "").Trim() : null;
```

### ADV-17 dictionary from JSON

```csharp
// before
if (data is not null && data.ContainsKey(datasetName)) { return JsonSerializer.Serialize(data[datasetName]?.ToString() ?? "[]"); }
// after: one lookup, same output
if (data is not null && data.TryGetValue(datasetName, out var dataset)) { return JsonSerializer.Serialize(dataset?.ToString() ?? "[]"); }
```

### ADV-46 indexable collection

```csharp
// before: HttpMethods is IReadOnlyList<string>
var method = endpoint.Metadata.OfType<HttpMethodMetadata>().FirstOrDefault()?.HttpMethods.FirstOrDefault() ?? "ANY";
// after
var methods = endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods;
var method = methods is { Count: > 0 } ? methods[0] : "ANY";
```

Only for a type with an indexer and `Count`/`Length`; keep LINQ on `IEnumerable<T>` and `IQueryable<T>`. `GetMetadata<T>()` returns the last matching entry, `OfType<T>().FirstOrDefault()` the first: keep `OfType` when several entries can exist.

### ADV-08 expected lists in tests

```csharp
// before: a new array per run (CA1861)
var expected = new[] { "GET api/allocations/{mac_address}", "PUT api/allocations/{mac_address}" }.Order().ToArray();
Assert.Equal(new[] { "QueryAppLookupAsync", "QueryRightCodeAsync" }, getActions);
// after
private static readonly string[] ExpectedLegacyRoutes = ["GET api/allocations/{mac_address}", "PUT api/allocations/{mac_address}"];
private static readonly string[] ExpectedGetActions = ["QueryAppLookupAsync", "QueryRightCodeAsync"];
Assert.Equal(ExpectedLegacyRoutes.Order(), actual);
Assert.Equal(ExpectedGetActions, getActions);
```

Also for `foreach (var type in new[] { typeof(...) })`: hoist to `private static readonly Type[]`.

## Test code and license-management scan (5.0.17)

SonarQube scans test projects with the production rules. Every row above applies to `Tests/**`; the cases below were all reported from tests or from code written last month.

### ADV-08 arrays in assertions and test data

```csharp
// before
Assert.Equal(new[] { "modetor" }, response.Roles);
Assert.Equal(new[] { "superadmin", "admin", "modetor" }, response.Data.Roles.Select(r => r.RoleCode));
var response = new[] { 1, 2 }.BuildPagedResponse(pageNumber: 1, pageSize: 20, totalRecords: 45, totalPages: 0);
// after
private static readonly string[] ModeratorOnly = ["modetor"];
private static readonly string[] AllRoleCodes = ["superadmin", "admin", "modetor"];
private static readonly int[] TwoRows = [1, 2];
Assert.Equal(ModeratorOnly, response.Roles);
Assert.Equal(AllRoleCodes, response.Data.Roles.Select(r => r.RoleCode));
var response = TwoRows.BuildPagedResponse(pageNumber: 1, pageSize: 20, totalRecords: 45, totalPages: 0);
```

Keep the values exactly (the role code `modetor` is test data; do not "correct" it). A method that mutates the array still needs its own copy (`[.. TwoRows]`).

### ADV-44 options in tests

```csharp
private static readonly JsonSerializerOptions SnakeCase = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
var json = JsonSerializer.Serialize(response, SnakeCase);
```

### ADV-13 test helper return type

```csharp
// before
private static IFormFile Upload(string fileName = "licenses.csv", string content = "...", long? declaredLength = null) { ...; return new FormFile(...); }
// after: private, always a FormFile; callers that take IFormFile still accept it
private static FormFile Upload(string fileName = "licenses.csv", string content = "...", long? declaredLength = null) { ...; return new FormFile(...); }
```

### ADV-50 case comparison — do not invert the check

```csharp
// before: "must be lowercase hex"
if (previewHash is null || previewHash.Length != PreviewHashHexLength || previewHash != previewHash.ToLowerInvariant())
    throw InvalidParameter(message);
// wrong fix (the analyzer's suggestion): string.Equals(previewHash, previewHash.ToLowerInvariant(), OrdinalIgnoreCase)
//   is always true, so uppercase input would pass
// right fix: state the rule directly
if (previewHash is null || previewHash.Length != PreviewHashHexLength || !previewHash.All(c => char.IsAsciiDigit(c) || c is >= 'a' and <= 'f'))
    throw InvalidParameter(message);
```

CA1862 is right when the code means "equal ignoring case": `a.ToLower() == b.ToLower()` → `string.Equals(a, b, StringComparison.OrdinalIgnoreCase)`. When the code means "is already lowercase", the case-insensitive fix breaks it: express the rule (as above) and add a test with uppercase input.

### ADV-51 `field` as an identifier

```csharp
// before (CS9258: field is a keyword in property accessors from C# 14)
internal bool IsBlank => Fields.TrueForAll(field => field.Length == 0);
// after
internal bool IsBlank => Fields.TrueForAll(f => f.Length == 0);
```

### ADV-14 loops still open

```csharp
// ImportFileParserResolver
return ZipSignatures.Any(signature => StartsWith(bytes, signature)) ? ImportFileFormat.Xlsx : ImportFileFormat.Csv;
// SensitiveParameters: the loop writes into the dictionary it reads, so keep the snapshot
foreach (var key in masked.Keys.Where(IsSensitive).ToList()) { masked[key] = Replacement; }
```
