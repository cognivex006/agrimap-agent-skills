# Application security baseline (SEC-01..22)

Applies to `be-main`, `be-library`, `fe-main`, `fe-library` and `sql-procedure` code you write or edit. The same 22 classes are what AgriMap Golden Lint (0.1.15+) reports on existing projects; this file is the authoring side, so new code never introduces them. Class IDs, OWASP 2021 categories and CWE numbers match the lint catalog.

## How to apply

- **New and rewritten code (required).** Code you write, and any line your authorized change rewrites, follows the "Write it this way" column. When the requester's design genuinely needs a listed shape (a public endpoint, a cross-site cookie), keep it explicit and name the class and reason in the summary.
- **Existing code you only read.** Report a match as a recommendation with class ID, `file:line`, evidence and the response contract below. A lint finding is a review candidate, not proof; confirm by reading the code. Fix it only when the requester asks, or when the authorized task already rewrites that exact statement.
- **Response contract (every fix).** A legitimate, authorized request keeps the same HTTP status, body, wire names and data. Never fix a class by rejecting valid input, stripping characters, masking a field for every caller or breaking a current client. Add a regression test for a valid request when the service has tests. A fix that changes a public contract (SEC-05, SEC-13, SEC-16, SEC-17, SEC-22) follows the normal decision boundary and migrates consumers in stages.
- **Tier.** CTL-03 and the [data, errors and logs rules](csharp.md#async-errors-data-and-logs) in `csharp.md` are MUST; the other classes are a SHOULD baseline for review severity. That tier never permits writing them in new code.

## Backend (C#) and SQL

| Class | Do not write | Write it this way |
| --- | --- | --- |
| SEC-01 SQL injection (A03, CWE-89) | SQL text concatenated or interpolated from values; dynamic SQL in a procedure built from parameters | Stored procedures through Infrastructure with command parameters; constant SQL text; identifiers only from an allow-list or `QUOTENAME`, values through `sp_executesql` parameters |
| SEC-02 command/code injection (A03, CWE-78/94/470) | `Process.Start`, script engines or `Type.GetType` fed by request or config values | Map input to a fixed allow-list; pass process arguments as `ArgumentList`, never one composed string |
| SEC-03 LDAP injection (A03, CWE-90) | Filter strings concatenated from values | Encode each value with an RFC 4515 filter encoder; keep the filter structure constant |
| SEC-04 path traversal (A01, CWE-22/73) | `Path.Combine(root, name)` with a caller-shaped name and no containment | Resolve the full path and require it to stay under the approved root, or map an ID to a stored path; `Path.GetFileName` alone is not enough |
| SEC-05 missing authorization (A01, CWE-862/306/489) | Controllers without class-level `[Authorize]`; test, mock or bypass endpoints in deployable code | CTL-03 class attributes; `[AllowAnonymous]` only on endpoints public by design; keep mock endpoints out of production builds |
| SEC-06 error detail exposure (A04, CWE-209/497) | `ex.Message`, `ex.ToString()`, stack traces or SQL errors in a response; developer exception page outside Development | Log with a correlation id; return the established `AppException` code and stable message (ERR-*) |
| SEC-07 sensitive logging (A09, CWE-532) | Passwords, tokens, cookies, authorization headers, national IDs or full parameter dictionaries in logs; `EnableSensitiveDataLogging` outside Development | Log an identifier, masked form or presence flag; keep event, level and correlation fields |
| SEC-08 weak cryptography (A02, CWE-327/326/328/338) | MD5, SHA-1, DES/3DES, RC4, ECB, RSA below 2048, `System.Random` for secrets | SHA-256+, AES-GCM, RSA 2048+ or ECDSA P-256, `RandomNumberGenerator`; platform crypto helpers from the backend libraries. Keep existing stored hashes verifiable (verify old, issue new) |
| SEC-09 token validation (A07, CWE-347/287/345) | `ValidateIssuer/Audience/Lifetime/IssuerSigningKey = false`, unsigned tokens, decode-only reads deciding access | Validate issuer, audience, lifetime and signing key from configured lists of every issuer in use |
| SEC-10 token issuance (A07, CWE-613/294) | Tokens without `exp` or a unique `jti`; HS256 keys under 256 bits | Add `exp` and a UUID `jti`; HS256 with a 256-bit+ key or RS256/ES256; keep existing claims and lifetime |
| SEC-11 TLS bypass (A02, CWE-295/326) | `ServerCertificateCustomValidationCallback` returning true, `DangerousAcceptAnyServerCertificateValidator`, pinned old `SslProtocols` | Default validation; trust internal CAs through the platform trust store; let the OS choose TLS 1.2+ |
| SEC-12 unsafe deserialization (A08, CWE-502) | `BinaryFormatter`, `NetDataContractSerializer`, `LosFormatter`, `TypeNameHandling` other than `None` | `System.Text.Json` (or the project's serializer) bound to declared contract types |
| SEC-13 permissive CORS (A05, CWE-942/346) | `AllowAnyOrigin`, `SetIsOriginAllowed(_ => true)`, any origin with credentials | Origins listed per environment in configuration ([service-url-matrix.md](../service-url-matrix.md)); include every origin that calls the API today |
| SEC-14 method override (A05, CWE-650) | `UseHttpMethodOverride`, honoring `X-HTTP-Method-Override` or `_method` | Route each operation by its real HTTP verb |
| SEC-15 open redirect (A01, CWE-601) | `Redirect(returnUrl)` with a request value | `LocalRedirect` or `Url.IsLocalUrl`, or an allow-listed host from configuration |
| SEC-16 sensitive query value (A04, CWE-598) | Passwords, tokens, OTPs or personal IDs as `[FromQuery]` | Body or header; for an existing contract add the new form first and retire the query form after consumers move |
| SEC-17 sensitive response field (A01, CWE-200/359) | Password, hash, salt or secret fields in a response DTO; personal fields in list projections that do not need them | Response DTOs without secrets; personal fields only for callers authorized for that record, only in projections that need them; never mask them for every caller |
| SEC-18 unbounded input (A04, CWE-770/1284) | `page_size`, `limit`, `take`, `offset` without bounds, or row counts as `string`/`double` | Integer types with `[Range]` (or the project's validation), upper bound from the largest legitimate use; out-of-range returns the existing validation error, never silent clamping |
| SEC-19 security headers (A05, CWE-319/693/525) | A host pipeline that assumes nobody sets HSTS, `nosniff` and `Cache-Control` | Confirm one owner (application, shared middleware or gateway) and set them there; `no-store` only for authenticated or personal responses |
| SEC-20 insecure cookie (A05, CWE-614/1004/1275) | Session or auth cookies without `Secure`, `HttpOnly` or with `SameSite=None` and no reason | `Secure`, `HttpOnly`, `SameSite=Lax` or `Strict`; `None` only with `Secure` for a named cross-site flow; keep names, paths and lifetimes |

## Frontend (Angular)

| Class | Do not write | Write it this way |
| --- | --- | --- |
| SEC-15 open redirect | `window.location.href = <query or API value>` | In-app navigation through the Angular router; external hosts only from an allow-list in environment config |
| SEC-16 sensitive query value | Tokens, passwords or personal IDs in route/query params or generated API query fields | Request body or header through the generated API ([gencode-api.md](gencode-api.md)) |
| SEC-21 DOM XSS (A03, CWE-79/95) | `bypassSecurityTrust*` on variable content, `nativeElement.innerHTML`, `document.write`, `eval`/`new Function` | Interpolation for text; `[innerHTML]` with Angular sanitization; `bypassSecurityTrust*` only for constant or server-sanitized content |
| SEC-22 token in Web Storage (A07, CWE-922) | Access/refresh tokens or credentials in `localStorage`/`sessionStorage` in new code; passwords anywhere | Follow the project's established auth flow (HttpOnly Secure cookie or in-memory token with short-lived refresh); changing an existing flow is a cross-lane staged migration, never a local edit |

## Out of scope here

Dependency vulnerabilities (A06), deployment/infrastructure configuration and data-flow proofs are not covered by these classes; do not claim them from this checklist. Secrets and service URLs in code follow [service-url-matrix.md](../service-url-matrix.md).
