# Golden checklist — `be-library`

Collection `golden/backend-libraries/` · status `current` · evidenceMode `curated-reference`.
Tiers and the "open, do not recall" rule: [README.md](README.md).

Detection: a class library with no web host entry, a packaged public surface, the
`README.md` + Playground convention, and no Controllers.

**The active package's published API and source stay authoritative.** These references are
maintained guidance; when a reference is older than the target package, the package wins. Match the
reference to the active package version before applying it.

## MUST — reuse the platform before building

`AgriMap.Platform` already owns these capabilities. Inspect the matching entry before writing a new
one; duplicating a platform capability without evidence fails the foundation gate in
[backend-engineer.md](../../backend-engineer.md#phase-1-foundation).

| Capability | Entry |
| --- | --- |
| `AppException` and abstractions | `001-1-abstractions-app-exception.md` |
| anonymous session | `002-1-anonymous-session.md` |
| `AppData` | `003-1-app-data.md` |
| caching | `004-1-caching.md` |
| configuration | `005-1-configuration.md` |
| content proxy | `006-1-content-proxy.md` |
| fluent HTTP client | `007-1-fluent-http-client.md` |
| logging | `008-1-logging.md` |
| mail client | `009-1-mail-client.md` |
| messaging queue | `010-1-messaging-queue.md` |
| security auth | `011-1-security-auth.md`; service handoff `011-2-security-auth-flow.md` |
| crypto: AES / BCrypt / HMAC-SHA256 | `012-1` / `012-2` / `012-3-security-crypto-*.md` |
| HTTP request-value normalization | `013-1-extensions-request-value-normalize.md` |

`011-2-security-auth-flow.md` carries project integration decisions that must be confirmed in the
target service — do not apply it as-is.

## MUST — request-value contract (`013-1-...`)

When the library reads or resolves request values:

- Precedence is Cookie (highest) → Header → QueryString (lowest); form/body only after the
  synchronous sources. First non-blank wins.
- Blank normalizes to `null`, values are trimmed, multi-value first-versus-joined behaviour is preserved.
- Key names are centralized in `ClientRequestResolverExtensions`. These are static extensions —
  **no DI registration**, and no wrapper service added merely to satisfy structure.
- Canonical device ID: Cookie `AgmTraceId` → Header `agm-device-id` → QueryString `device_id`.
  Login context cookie is `AgmLoginContextId`. This order outranks narrower historical examples.
- Refactor one caller family at a time after proving semantic equivalence. Never mass-replace syntax.

## MUST — the public surface is the contract

- Preserve the published API. An intentional change is additive first, then deprecation, then
  removal in a later major — and it updates compatibility notes in the same task.
- C# structure follows [patterns/csharp.md](../csharp.md): one public type per file, file-scoped
  namespace (NS-01 [file layout](../csharp-file-layout.md): required usings before namespace, blank lines between sections), `I` interface prefix, `_camelCase` private readonly dependencies, `Async` suffix on new
  async I/O, and no alias to bypass a fixed namespace.

## MUST — every library feature ships complete

One feature task updates all four ([patterns/backend.md](../backend.md#be-libraries)):

1. public API and compatibility notes;
2. `README.md` setup and usage;
3. the Playground example;
4. library tests/build **and** the Playground verification path.

A library feature that skips the Playground or README is incomplete, not "done with follow-up".

## SHOULD

Security baseline SEC-01..20 ([security-baseline.md](../security-baseline.md)): new and rewritten code never introduces them; existing matches are reported with the response contract and fixed on request.

Configuration shape, README section order, and logging field conventions as shown in the matching
entry, where the active package does not already prove a different published surface.

Advisory smells (QUALITY-05): recommend; edit on request, or safe tier ADV-05/10/11 in edited files. Review always reports ADV-01 split
overloads with `file:line` ([overload order](../csharp-file-layout.md#overload-order--adv-01-s4136)).

## FREE

Internal implementation of a library behaviour behind a stable public surface: algorithm,
validation body, private helpers, local decomposition. Same-name overloads still stay adjacent (ADV-01).

## Before the write

1. Platform reuse checked against the capability table above.
2. Every `MUST` row verified against the opened entry, matched to the active package version, including NS-01 file order.
3. `Patterns:` line lists `agm:golden/backend-libraries` plus the exact entries opened.
