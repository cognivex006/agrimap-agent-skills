# SonarQube remediation — mandatory requester notice

For SonarQube-driven code changes in any lane, notify the requester before editing, even when the edit preserves behavior. This is a communication rule, not a new approval gate.

## Contents

[Before editing](#before-editing) · [After editing](#after-editing) · [Suppressions](#suppressions-quality-08) · [Advisory code smells](#advisory-code-smells-quality-05) · [Fix examples (C#)](#fix-examples-c)

Rules by language: [patterns/sonarqube-matrix.md](patterns/sonarqube-matrix.md) (C#, TypeScript, JavaScript, Angular, HTML, CSS, Go, Next.js); security hotspots by language and surface (nginx, Docker, SQL ...): [patterns/security-matrix.md](patterns/security-matrix.md). Read only the file for the language you are in.

## Before editing

- Identify the finding, affected files/methods and rule ID when known. Distinguish an actual scan finding from a suspected violation found by review; never invent scan evidence.
- Explain why the change is needed, the proposed before/after approach and expected behavior/contract impact. Name uncertainty and the verification that will resolve it.
- If this changes code previously reported complete, accepted or delivered, explicitly say that you are revisiting completed work for a SonarQube issue. Explain why it is being reopened, including a missed finding in your earlier work when applicable. Do not silently reclassify it as unfinished work or a new feature.

Example notice for previously completed work:

> กำลังกลับมาแก้งานที่แจ้งว่าเสร็จแล้วใน `<file>:<method>` เนื่องจาก `<finding/rule>` โดยจะเปลี่ยน `<before>` เป็น `<after>` คาดว่าจะรักษาพฤติกรรมและ contract เดิม และจะตรวจด้วย `<checks>`

Use the current authorization and [autonomy rules](autonomy.md). Continue authorized, behavior-preserving changes after notifying; do not ask for the same permission again. A new scope, logic or public-contract change follows the existing decision boundary. A scan finding alone grants no edit authority; read-only review/QA reports the proposed fix without editing.

## After editing

Summarize the actual change, its relationship to the previously completed work, behavior/contract impact, and verification performed. State whether SonarQube was rerun and the actual result; a local refactor or build does not establish that the SonarQube issue is resolved. Disclose remaining findings or missing scan evidence.

## Suppressions (QUALITY-08)

`// NOSONAR`, `#pragma warning disable`, `[SuppressMessage]`, `eslint-disable` and `.editorconfig` severity changes hide a finding; they never fix it.

- Do not add one to make a scan pass. Fix the code, or report the finding.
- Allowed only when the shape is required and a guard makes it safe, after that guard exists, on the one line it covers, with the rule and reason: `// NOSONAR(S5042): entries checked by loadSafeArchive()`. A bare `// NOSONAR` is a finding.
- Security hotspots are closed in SonarQube (Reviewed → Safe) by a person with that permission, with the evidence; a code comment is not the review.
- Existing bare suppressions are reported (recommend), not removed blindly: removing one can reopen a gate.

## Advisory code smells (QUALITY-05)

Before/after code for these rows and QUALITY-01..07: [patterns/sonarqube-fix-examples.md](patterns/sonarqube-fix-examples.md). Per-language keys, tiers, team evidence and examples: [patterns/sonarqube-matrix.md](patterns/sonarqube-matrix.md).

The team and company agreed that the smells below are advisory: fixing them is optional. They never block delivery and never lower QUALITY-01..03, bugs, vulnerabilities or security hotspots.

- **Recommend first.** Report each one as a recommendation (review comment, QA/lint report item or summary line) with rule ID, `file:line`, evidence, proposed fix and risk. Do not edit for them during unrelated work, and do not add TODO or source comments unless asked.
- **Edit only on request with enough evidence.** Fix when the requester explicitly asks for that finding or rule and the evidence proves the fix preserves behavior and contracts (scan result or verified code reading, plus the caveats below). Notify before and after editing as above. If evidence is missing, keep the recommendation and name what is missing.
- **Safe tier in touched files (5.0.8, extended 5.0.17).** In a file the current authorized task already edits, fix ADV-05, ADV-10, ADV-11, ADV-15, ADV-16, ADV-17, ADV-18, ADV-19, ADV-20, ADV-21, ADV-23, ADV-24, ADV-29, ADV-30, ADV-31, ADV-32, ADV-35, ADV-37, ADV-39, ADV-41, ADV-42, ADV-43, ADV-44, ADV-45, ADV-46, ADV-48, ADV-49, ADV-51 and ADV-52 directly when the check column holds, and rows without an ID that a language file marks `safe`; they are mechanical and contract-free. Mention them in the summary. Everything else stays recommend-first.
- **Skip when unsure.** ADV-12 (URIs) and ADV-13 (concrete types) only when the check column is fully proven; otherwise report and skip. A skipped smell is never a delivery blocker.
- **New code.** Code you write avoids these smells when doing so costs no behavior or contract change; ADV-02/05/06/08/11/14/17/18/20/21 are mandatory for new C# code (csharp.md QUALITY-07), ADV-05/15/16/19/20/21 for new JS/TS, and new code never adds a package it does not use (ADV-22). From 5.0.17 every row a language file marks `must` is mandatory for new code in that language, including ADV-23..52. Test projects and specs follow the same rows.
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
| ADV-20 | S1128, IDE0005 (C#, JS/TS) | Unused `using` or `import` | Delete it; keep global usings and side-effect imports such as polyfills | Not used in a template, decorator, type-only position or `#if` branch |
| ADV-21 | S1135 (C#, JS/TS) | TODO/FIXME left in code, including snippet or generator scaffolds | Finish the work or report it in the summary; never add the marker | A person's existing TODO stays recommend-first unless this task completes its work |
| ADV-22 | dependency hygiene (npm, NuGet) | Package declared in `package.json` or `.csproj` but never used | Remove the entry with the package manager and update the lock file | Search source, templates, `angular.json`, build scripts, DI/reflection and peer requirements, then restore, build and test; a used package with a known advisory is a security finding instead |
| ADV-23 | S125 (all) | Commented-out code | Delete it; Git keeps history | A comment that explains intent stays; keep `<!-- -->` license headers |
| ADV-24 | S1854 (all) | Dead store: value overwritten or never read | Delete the assignment; keep a needed call as `_ = Call();` (C#) or a bare call (TS) | Renaming to `_x` is not a fix; check the right-hand side has no side effect you need |
| ADV-25 | S1871 (all) | Two branches with the same body | Merge the conditions with `\|\|`, or hoist the common code | Keep evaluation order and short-circuiting; branches that differ only in comments are still identical |
| ADV-26 | S2681 (all) | Multi-line body after an unbraced `if`/loop | Add braces | This is a bug: confirm which lines were meant to be conditional and add a test |
| ADV-27 | S1788 (TS) | Default parameter before a required one | Move optional parameters last or use an options object | Public/shared API: add the new signature and migrate callers; never just drop the default |
| ADV-28 | S4144 (all) | Two functions/methods with the same body | Extract one shared private method or utility with a test | Search for an existing helper first; keep routes, attributes and public names |
| ADV-29 | S1125 (all) | `x == true`, `x != false` | `x`, `!x` | Only on non-nullable `bool`; for `bool?` use `?? false` or `is true` |
| ADV-30 | S2971, S6602, S6603, S6605 (C#) | `Where(p).First*()`, `Any`/`All` on `List<T>` | `FirstOrDefault(p)`; `Find`/`Exists`/`TrueForAll` on `List<T>` | Same result; keep deferred execution where an `IQueryable` translates to SQL |
| ADV-31 | S7773 (TS/JS) | Global `isNaN`, `parseInt`, `parseFloat` | `Number.isNaN`, `Number.parseInt(x, 10)` | Global `isNaN('abc')` is true, `Number.isNaN('abc')` is false: convert first when the input can be a string |
| ADV-32 | S2933 (all) | Field assigned only at declaration/constructor is not `readonly` | Add `readonly` | Not when a test, framework or `ngOnInit` reassigns it |
| ADV-33 | S1186 (all) | Empty function or handler | Delete it with its binding, or comment why it is empty (interface no-op) | Removing an event handler also removes the template binding and `implements` entry |
| ADV-34 | S108, S2486 (all) | Empty `catch` or ignored exception | Narrow the type and log through `ILogger` (OBS-01) or the app logging service | Never `Console.WriteLine`; an intentional ignore names why in a comment |
| ADV-35 | S6551 (TS/JS) | Object stringified with a template literal or `+ ''` | `String(x)` for primitives; a formatter for objects | Same text for strings and numbers; `[object Object]` was a bug |
| ADV-36 | S6580, CA1305 (C#) | `Parse`/`ToString` without a format provider | `CultureInfo.InvariantCulture` for wire/storage values | Behavior change for culture-formatted input: skip when unsure and report |
| ADV-37 | S1090, S1077, S5254, S5256 (HTML) | `iframe` without `title`, `img` without `alt`, `html` without `lang`, table without headers | Add the attribute or element | Text from existing labels or the requester; no layout change |
| ADV-38 | S1192 (all) | Same string literal three or more times | A `const`, configuration key or message code | Message text comes from the message table (ERR rules); do not merge literals that mean different things |
| ADV-39 | S1066 (all) | `if` nested in an `if` with no `else` | `if (a && b)` | Keep side-effect order |
| ADV-40 | S4204, S6571 (TS) | `any`, `as any`, `T \| any` | The generated API type, a narrow local type or `unknown` plus a guard | Do not change a public library type without its consumers |
| ADV-41 | team (TS) | Import from `node_modules/...` or a package's internal chunk | The package's public entry (`@angular/common/http`) | Same symbol; build to confirm |
| ADV-42 | S7781, S7755, S7764 (TS/JS) | `replace(/lit/g)`, `a[a.length - 1]`, `window` as the global | `replaceAll`, `at(-1)`, `globalThis` | Target ES2022 or later; `window.location` in browser code stays |
| ADV-43 | S4647..S4667, S5362 (CSS) | Empty blocks, duplicate properties or selectors, invalid values | Delete or merge in cascade order | Keep the value that is in effect today |
| ADV-44 | CA1869 (C#) | `new JsonSerializerOptions` per call | One `private static readonly` options instance | The instance must not be changed after first use; keep every option value |
| ADV-45 | CA1510..CA1513 (C#) | Manual `if (x is null) throw new ArgumentNullException(nameof(x))` | `ArgumentNullException.ThrowIfNull(x)` and the `ThrowIfNullOrEmpty`/`ThrowIfNegative`/`ObjectDisposedException.ThrowIf` twins | Same type and `ParamName`; the message becomes the framework default, so keep the explicit throw when a custom message is asserted |
| ADV-46 | CA1826 (C#) | `FirstOrDefault()`/`First()`/`Count()` on an indexable collection | Index or `Count`/`Length` directly | Only for arrays, `List<T>`, `IReadOnlyList<T>`; never on `IEnumerable`/`IQueryable` |
| ADV-47 | S1874 (TS/JS), CS0618 (C#) | Deprecated or `[Obsolete]` API | The replacement the deprecation names | Supported browsers or runtimes may still need the old API: confirm before removing |
| ADV-48 | S3863 (TS/JS) | The same module imported in more than one statement | Merge into one import | Keep side-effect imports and lint-required `import type` lines |
| ADV-49 | S1301 (C#, TS/JS) | `switch` with fewer than three cases | `if`/`else` or a ternary; a lookup table for a growing list | Same fall-through and default behavior |
| ADV-50 | CA1862 (C#) | Case comparison through `ToLower*`/`ToUpper*` | `string.Equals(a, b, StringComparison.OrdinalIgnoreCase)` when the code means "equal ignoring case" | When the code means "is already lower/upper case", the suggested fix inverts it: write the rule directly and test uppercase input |
| ADV-51 | CS9258 (C#) | Lambda parameter or local named `field`/`value` inside a property | Rename (`f`, `item`) | Rename only that scope |
| ADV-52 | S4323 (TS) | The same inline union type repeated or in a public signature | A named `type` alias in the feature model, or the generated API type | Pure type change: no runtime effect; export it only where it is shared |

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
