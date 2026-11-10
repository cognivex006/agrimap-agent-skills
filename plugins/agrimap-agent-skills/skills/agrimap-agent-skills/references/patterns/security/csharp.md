# Security — C#

Sonar keys and C# idioms for the SEC classes in `agmws-*`, `agmbo-*` and `AgriMap.*`. Class definitions, the response contract and tiers: [security-baseline.md](../security-baseline.md). Index: [security-matrix.md](../security-matrix.md). Code smells: [sonarqube/csharp.md](../sonarqube/csharp.md).

## Contents

- [Rows](#rows)
- [Before/after](#beforeafter)

## Rows

| Class | Key | Do not write | Write it this way | Seen |
| --- | --- | --- | --- | --- |
| SEC-01 | S2077, S3649 | `$"... WHERE id = {id}"` passed to a command | Stored procedure through Infrastructure with parameters | baseline |
| SEC-02 | S4036, S2076 | `Process.Start("cmd", "/c " + value)` | Fixed executable path, `ProcessStartInfo.ArgumentList` | baseline |
| SEC-03 | S2078 | `new DirectorySearcher($"(uid={value})")` | Escape each value with an RFC 4515 filter encoder; keep the filter template constant | baseline |
| SEC-04 | S2083, S6096 | `Path.Combine(root, request.Name)` without containment | `Path.GetFullPath` then `StartsWith(root + Path.DirectorySeparatorChar)`, or ID → stored path | file-management `GuardFileId` |
| SEC-05 | S4834, team | A controller or action that changes or returns tenant data without `[Authorize]`, or a global `[AllowAnonymous]` | `[Authorize(Policy = ...)]` on the controller; `[AllowAnonymous]` only on named public endpoints such as login and health | baseline |
| SEC-06 | S4507 | `UseDeveloperExceptionPage()` outside Development; `ex.Message` in the response | Environment check; `AppException` code and the `lut_app_message` text | file-management `218fb21` (filter maps `AppException` to code + configured message) |
| SEC-07 | S5145, S6667 | Logging tokens, passwords, cookies, full parameter dictionaries | Log the id, a masked value or a presence flag | baseline |
| SEC-08 | S4790, S2245, S5547 | `SHA1.Create()`, `MD5`, `new Random()` for ids or tokens | `SHA256.HashData` (ADV-18), `RandomNumberGenerator.GetBytes`/`GetHexString` | file-management `e32825d` (SHA-1 → SHA-256) |
| SEC-09 | S5659 | `ValidateIssuer/Audience/Lifetime = false`, `RequireSignedTokens = false` | Validate all four from configuration | baseline |
| SEC-10 | S6781 | HS256 key shorter than 256 bits, key in source | Key from configuration, 32+ bytes | baseline |
| SEC-11 | S4830, S4423 | `ServerCertificateCustomValidationCallback = (...) => true`, pinned `SslProtocols.Tls` | Default validation, internal CA in the trust store | baseline |
| SEC-12 | S5773, CA2300+ | `BinaryFormatter`, `TypeNameHandling.All` | `System.Text.Json` with declared types | baseline |
| SEC-13 | S5122 | `AllowAnyOrigin()`, `SetIsOriginAllowed(_ => true)` | Origins per environment from configuration | baseline |
| SEC-14 | — | `app.UseHttpMethodOverride()`, honoring `X-HTTP-Method-Override` or `_method` | Map each operation to its real HTTP verb; remove the override middleware | baseline |
| SEC-15 | S5146 | `Redirect(returnUrl)` | `LocalRedirect` / `Url.IsLocalUrl` / allow-listed host | identity OAuth redirects |
| SEC-18 | S5693, S6967 | Unbounded upload size or `page_size` | `[RequestSizeLimit]`, `[Range]` from the largest legitimate use | baseline |
| SEC-16 | team | `[FromQuery] string token`, passwords or national IDs in the query string | Header (`Authorization`) or request body; the URL carries only identifiers that are safe in logs | baseline |
| SEC-17 | team | Returning the entity (`PasswordHash`, `Salt`, `SecretKey`) or every personal field in a list | A response DTO with only the fields the caller needs; list projections without personal fields | baseline |
| SEC-19 | S5332, team | No HSTS outside Development; missing `X-Content-Type-Options`, `X-Frame-Options` or `Referrer-Policy` when the service serves browsers directly | `app.UseHsts()` outside Development and one header middleware; behind nginx, the headers come from nginx (SEC-30) and the service does not duplicate them | baseline |
| SEC-20 | S2092, S3330 | `Secure = config.Toggle`, missing `HttpOnly` | Literal `Secure = true`, `HttpOnly = true` on append and delete | license-management `AuthController` |
| SEC-23 | S5852, S6444 | `new Regex(pattern)` without a timeout; nested quantifiers | `[GeneratedRegex(..., matchTimeoutMilliseconds: 1000)]` (ADV-09) | plus MAC address |
| SEC-25 | S5042 | `ZipFile.ExtractToDirectory(upload, dir)`; `entry.FullName` used as a path | Count/size/ratio caps, `Path.GetFullPath` containment per entry | catalog (import services) |
| SEC-28 | S6418, S2068 | Connection strings, keys, passwords in `appsettings*.json`, `launch.json`, `Program.cs` | Environment variables, secret store; `AddUserSecrets<Program>()` only in Development | identity `5de83da` (values left in history → rotate); file-management `e32825d` (`AddUserSecrets` when `isDev`) |
| SEC-31 | team | Empty `KnownProxies`/`KnownNetworks` trusting all peers; scheme lost behind the gateway | Two forwarded-header policies: scheme always, client IP only from configured proxies | license-management `fa9e69a`, `4ef4ee7` |
| — | S5332 | `http://` URLs to other services in production configuration | `https://`; plain HTTP only inside the container behind the TLS gateway | file-management `d0ad551` (`http://+:5000` binding) |

## Before/after

### SEC-31 forwarded headers behind the TLS gateway

```csharp
// before: one options object; ASP.NET Core pre-seeds loopback in KnownProxies, so a non-loopback
// gateway is "unknown" and X-Forwarded-Proto is dropped → Request.IsHttps false → antiforgery 500
app.UseForwardedHeaders(new ForwardedHeadersOptions { ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto });
// after (license-management 4ef4ee7): scheme always honoured, client IP only from configured proxies
var scheme = new ForwardedHeadersOptions { ForwardedHeaders = ForwardedHeaders.XForwardedProto };
scheme.KnownProxies.Clear();
scheme.KnownNetworks.Clear();
app.UseForwardedHeaders(scheme);
if (clientIpOptions.KnownProxies.Count > 0 || clientIpOptions.KnownNetworks.Count > 0)
    app.UseForwardedHeaders(clientIpOptions); // XForwardedFor with the configured lists
```

Test from a non-loopback peer; loopback-only tests hid this defect.

### SEC-28 committed secret

Delete the value from the file, move it to the environment or secret store, and ask the owner to rotate it: a value in any commit is exposed. Never paste the old value into an issue, log or summary.

### SEC-08 hash

```csharp
// before
using var sha1 = SHA1.Create();
var hash = sha1.ComputeHash(Encoding.UTF8.GetBytes(input));
// after: also ADV-18; when the old hash is stored, verify old and issue new
var hash = SHA256.HashData(Encoding.UTF8.GetBytes(input));
```

Tested examples: [examples/csharp/SecExamples.cs](examples/csharp/SecExamples.cs) runs the BAD and GOOD shapes of SEC-03 and SEC-04 with `dotnet run` in `npm test` (skipped without an SDK).
