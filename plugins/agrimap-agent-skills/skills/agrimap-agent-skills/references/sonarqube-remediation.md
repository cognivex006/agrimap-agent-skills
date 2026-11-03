# SonarQube remediation — mandatory requester notice

For SonarQube-driven code changes in any lane, notify the requester before editing, even when the edit preserves behavior. This is a communication rule, not a new approval gate.

## Before editing

- Identify the finding, affected files/methods and rule ID when known. Distinguish an actual scan finding from a suspected violation found by review; never invent scan evidence.
- Explain why the change is needed, the proposed before/after approach and expected behavior/contract impact. Name uncertainty and the verification that will resolve it.
- If this changes code previously reported complete, accepted or delivered, explicitly say that you are revisiting completed work for a SonarQube issue. Explain why it is being reopened, including a missed finding in your earlier work when applicable. Do not silently reclassify it as unfinished work or a new feature.

Example notice for previously completed work:

> กำลังกลับมาแก้งานที่แจ้งว่าเสร็จแล้วใน `<file>:<method>` เนื่องจาก `<finding/rule>` โดยจะเปลี่ยน `<before>` เป็น `<after>` คาดว่าจะรักษาพฤติกรรมและ contract เดิม และจะตรวจด้วย `<checks>`

Use the current authorization and [autonomy rules](autonomy.md). Continue authorized, behavior-preserving changes after notifying; do not ask for the same permission again. A new scope, logic or public-contract change follows the existing decision boundary. A scan finding alone grants no edit authority; read-only review/QA reports the proposed fix without editing.

## After editing

Summarize the actual change, its relationship to the previously completed work, behavior/contract impact, and verification performed. State whether SonarQube was rerun and the actual result; a local refactor or build does not establish that the SonarQube issue is resolved. Disclose remaining findings or missing scan evidence.

## Advisory code smells (QUALITY-05)

Before/after code for these rows and QUALITY-01..07: [patterns/sonarqube-fix-examples.md](patterns/sonarqube-fix-examples.md).

The team and company agreed that the smells below are advisory: fixing them is optional. They never block delivery and never lower QUALITY-01..03, bugs, vulnerabilities or security hotspots.

- **Recommend first.** Report each one as a recommendation (review comment, QA/lint report item or summary line) with rule ID, `file:line`, evidence, proposed fix and risk. Do not edit for them during unrelated work, and do not add TODO or source comments unless asked.
- **Edit only on request with enough evidence.** Fix when the requester explicitly asks for that finding or rule and the evidence proves the fix preserves behavior and contracts (scan result or verified code reading, plus the caveats below). Notify before and after editing as above. If evidence is missing, keep the recommendation and name what is missing.
- **Safe tier in touched files (5.0.8).** In a file the current authorized task already edits, fix ADV-05, ADV-10, ADV-11, ADV-15, ADV-16, ADV-17, ADV-18 and ADV-19 directly when the check column holds; they are mechanical and contract-free. Mention them in the summary. Everything else stays recommend-first.
- **Skip when unsure.** ADV-12 (URIs) and ADV-13 (concrete types) only when the check column is fully proven; otherwise report and skip. A skipped smell is never a delivery blocker.
- **New code.** Code you write avoids these smells when doing so costs no behavior or contract change; ADV-02/05/06/08/11/14/17/18 are mandatory for new C# code (csharp.md QUALITY-07), ADV-15/16/19 for new JS/TS.
- Rules not listed here follow their scan severity and the normal decision boundary.

| ID | Rule | Smell | Recommended fix | Check before fixing |
| --- | --- | --- | --- | --- |
| ADV-01 | S4136 | Overloads with the same name are not adjacent | Move all overloads together, simplest (fewest parameters) first, in classes and interfaces | Pure reordering: keep `#region`, partial-file and diff-noise trade-offs in mind |
| ADV-02 | CA1822, S2325 | Member uses no instance data | Mark it `static` | Not for interface implementations, overrides, `virtual`/public API or members found through reflection (for example tests using `BindingFlags.Instance`); update instance call sites such as `fixture.Create()` to `ServiceFixture.Create()` |
| ADV-03 | S1905 | Redundant cast | Remove the cast; `x as T ?? new T()` on a value already typed `T` becomes `x ?? new T()` | Confirm the expression's declared type and nullability; casts that select an overload or unify ternary branch types, such as `(object)new { ... }`, are not redundant |
| ADV-04 | S3236 | Caller-info argument passed explicitly | `ArgumentNullException.ThrowIfNull(name)`; `CallerArgumentExpression` supplies the name | Removing a different literal changes `ParamName`/message; check tests or clients that assert it |
| ADV-05 | S1481 | Unused local variable | Remove it; keep a call with side effects as `_ = Call();` | Confirm no use through conditional compilation or later edits in scope |
| ADV-06 | xUnit2032 | `Assert.IsAssignableFrom<T>(x)` | `Assert.IsType<T>(x, exactMatch: false)` | Needs an xUnit version with the `exactMatch` overload; keep using the returned value |
| ADV-07 | CA1816 | `Dispose()` does not call `GC.SuppressFinalize` | Add `GC.SuppressFinalize(this);` at the end of `Dispose()`, or seal a class with no finalizer | With the full dispose pattern, call it in `Dispose()`, not `Dispose(bool)` |
| ADV-08 | CA1861 | Constant array passed as an argument (also in tests, such as `Assert.Equal(new[] { ... }, actual)`) | Hoist it to a `private static readonly` field (`string[]`, `Type[]`, ...) and pass the field | Only when the callee does not mutate or keep the array; keep element order and type; a test-local expected value may stay inline if hoisting hurts readability |
| ADV-09 | SYSLIB1045 | `Regex.IsMatch`/`new Regex(...)` with a constant pattern | `[GeneratedRegex(pattern, options, matchTimeoutMilliseconds)] private static partial Regex XxxRegex();` in a `partial` class, then `XxxRegex().IsMatch(input)` | Needs .NET 7+; keep the exact pattern and `RegexOptions`; the containing type (and nested parents) must become `partial`. A missing timeout is security hotspot S6444 ("Pass a timeout"), which is not advisory: review it under its own severity. The timeout argument closes both; a timeout makes a slow match throw `RegexMatchTimeoutException`, so confirm the caller's error path |
| ADV-10 | ASP0015 | `Request.Headers["Authorization"]`, `["X-Requested-With"]`, `["Cache-Control"]`, `["Expires"]`, `["Cookie"]` | Use the typed `IHeaderDictionary` property: `Headers.Authorization`, `Headers.XRequestedWith`, `Headers.CacheControl`, `Headers.Expires`, `Headers.Cookie` | Same `StringValues` type and semantics; keep `.ToString()` and comparisons. Only for `IHeaderDictionary` (ASP.NET Core), not `HttpRequestMessage.Headers` |
| ADV-11 | CA1866, CA1865 | `StartsWith("/")`, `EndsWith("?")`, `IndexOf("x")` with a one-char string | Char overload: `StartsWith('/')` | Ordinal char overload; if the string call passed a culture/`StringComparison` that matters (for example `OrdinalIgnoreCase` on a letter), keep it |
| ADV-12 | S1075 | Hardcoded absolute URI or path delimiter (`"https://..."`, `"/" + path`) | Move absolute URIs to configuration (`appsettings` + options) or an existing settings source; for path joins use an existing helper or a named constant | Refactor carefully: needs every environment's value (Inhouse/Production/K8s) and the owning config key. If the value, environment differences or a config source are not proven, skip and report. A leading `/` in URL normalization is a URL rule, not a file path: never replace it with `Path.Combine` |
| ADV-13 | CA1859 | Private method returns/takes an interface (`IActionResult`, `IReadOnlyDictionary`) where one concrete type flows | Change the private signature to the concrete type (`RedirectResult`, `Dictionary<,>`) | Private/internal only; never public API, controller actions, interface implementations or overrides. Skip when a read-only parameter type documents intent the team wants to keep |
| ADV-14 | S3267 | `foreach` whose body is only an `if` filter | `foreach (var v in items.Where(v => v is not null))` | Keep evaluation order and side effects; skip when it hurts readability or nests lambdas |
| ADV-15 | S6594 (JS/TS) | `str.match(/re/)` without the `g` flag | `/re/.exec(str)`; keep `str.match(/re/g)` and `matchAll` | Same result shape (`RegExpExecArray \| null`); a regex with `g`/`y` keeps `lastIndex` state across `exec` calls, so only convert non-global literals |
| ADV-16 | S6353 (JS/TS, C#) | Verbose character class `[A-Za-z0-9_]`, `[0-9]` | `\w`, `\d` | Only exact equivalents: in JS without `u`/`v` and in C# with `RegexOptions.ECMAScript`; .NET `\w`/`\d` also match Unicode letters/digits, so keep the class in C# unless Unicode input is acceptable |
| ADV-17 | CA1854 | `ContainsKey(k)` guarding `dict[k]` (also `Request.Headers`) | `dict.TryGetValue(k, out var v) ? v.ToString()... : null` | One lookup with the same result; `IHeaderDictionary` returns `StringValues`, so keep `.ToString()`; skip when the indexer write path differs (for example `dict[k] = ...`) |
| ADV-18 | CA1850 | `using var sha = SHA256.Create(); sha.ComputeHash(bytes)` | `SHA256.HashData(bytes)` (also `SHA1`/`SHA384`/`SHA512`/`MD5`); hex via `Convert.ToHexStringLower(hash)` (.NET 9) or `Convert.ToHexString(hash).ToLowerInvariant()` | Needs .NET 5+; same bytes; keep lowercase hex if callers compare strings; streams and incremental hashing keep the instance API |
| ADV-19 | S3735 (JS/TS) | `void promise`, `void this.facade.load(...)` | Call it as a statement, or `await`/`.catch()` a promise and `subscribe` an observable as the facade pattern does | Check what the call returns: a floating promise needs explicit error handling, so do not just delete `void` from an un-awaited async call |

## Fix examples (C#)

ADV-14 (S3267): move the filter into `Where`; return the first match with `Any`/`FirstOrDefault`; when the loop writes into the collection it reads, keep the `ToList()` snapshot.

```csharp
// before: foreach (var signature in ZipSignatures) { if (StartsWith(bytes, signature)) { return ImportFileFormat.Xlsx; } }
return ZipSignatures.Any(signature => StartsWith(bytes, signature)) ? ImportFileFormat.Xlsx : ImportFileFormat.Csv;

// before: foreach (var key in masked.Keys.ToList()) { if (IsSensitive(key)) { masked[key] = Replacement; } }
foreach (var key in masked.Keys.Where(IsSensitive).ToList())
{
    masked[key] = Replacement;
}
private static bool IsSensitive(string key) =>
    SensitiveKeyFragments.Any(fragment => key.Contains(fragment, StringComparison.OrdinalIgnoreCase));
```

ADV-17 (CA1854), ADV-18 (CA1850) and ADV-08 (CA1861):

```csharp
public static string? GetCustomHeaderToken(HttpContext ctx) =>
    ctx.Request.Headers.TryGetValue("token", out var token) ? token.ToString().Replace("Bearer ", "").Trim() : null;

public static string ComputeSha256Hash(this string input) =>
    Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input))).ToLowerInvariant();

private static readonly string[] ExpectedGetActions = ["QueryAppLookupAsync", "QueryRightCodeAsync"];
Assert.Equal(ExpectedGetActions, getActions);
```

SEC-20 (S2092 hotspot, security-baseline.md): `Secure` must be the literal `true` on every `CookieOptions`, append and delete. A helper such as `Policy.RequireSecureCookies(config)` keeps the hotspot open. Local HTTP uses the dev certificate (`dotnet dev-certs https --trust`) or an app-level `CookiePolicyOptions { Secure = CookieSecurePolicy.Always }`; `SameSite` may stay configurable.

```csharp
Response.Cookies.Append(name, rawToken, new CookieOptions
{
    Secure = true,
    HttpOnly = true,
    SameSite = LicenseAuthCookiePolicy.CookieSameSite(_configuration),
    Path = "/",
    Expires = new DateTimeOffset(DateTime.SpecifyKind(expiresAtUtc, DateTimeKind.Utc)),
});
Response.Cookies.Delete(name, new CookieOptions { Secure = true, HttpOnly = true, SameSite = LicenseAuthCookiePolicy.CookieSameSite(_configuration), Path = "/" });
```
