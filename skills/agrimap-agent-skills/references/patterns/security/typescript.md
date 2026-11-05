# Security — TypeScript

Sonar keys and TypeScript idioms for SEC classes in any `.ts` code (browser or shared). Angular-only rules: [angular.md](angular.md). Node scripts: [javascript.md](javascript.md). Class definitions: [security-baseline.md](../security-baseline.md). Index: [security-matrix.md](../security-matrix.md).

## Contents

- [Rows](#rows)
- [Before/after](#beforeafter)

## Rows

| Class | Key | Do not write | Write it this way | Seen |
| --- | --- | --- | --- | --- |
| SEC-23 | S5852 | `/\/+$/`, `/=+$/`, `/^_+/`, `/<[^>]*>/g` on user-sized input; `\s*` under `m` | A linear helper (`trimTrailingSlashes`), `DOMParser` for tag stripping, bounded classes | platform-ng `4ab68dc6`, `fc1dad85`; pro-ng `58b1479`; suite-ng `a23277e` |
| SEC-25 | S5042 | `JSZip.loadAsync(file)` and using every entry | `assertSafeArchive(zip)`: entry count, total uncompressed size, ratio, no `..`/absolute names, then `// NOSONAR(S5042)` with the guard named | platform-ng `fc1dad85`, `4eb3aefc`, `e9173f70`, `4ab68dc6` |
| SEC-08 | S2245 | `Math.random()` for ids, keys, nonces, PKCE values | `crypto.randomUUID()`, `crypto.getRandomValues()` | platform-ng `4ab68dc6` (role-detail key) |
| SEC-08 | S4790 | MD5/SHA-1 via a library | `crypto.subtle.digest('SHA-256', ...)` | platform-ng PKCE `generateCodeChallenge` (SHA-256, correct) |
| SEC-28 | S6418, S2068 | API keys, passwords, tokens in `environment*.ts`, constants or tests | Values from the deployment's runtime config; public identifiers only | identity `5de83da` (backend twin) |
| SEC-07 | team | `console.log` of responses, tokens or personal data | No console output in feature code; the app's logging service with masking | platform-ng `e7190db2` (`console.log('res', res)`) |
| SEC-02/21 | S1523 | `eval`, `new Function`, `setTimeout('code')` | Plain functions | baseline |
| — | S5332 | Hard-coded `http://` service URLs | Environment config with `https://` | baseline (service-url-matrix.md) |

## Before/after

### SEC-25 archive guard (one helper, tested)

```ts
// before (several facades): no limits, a different partial check in each copy
const zipContent = await zip.loadAsync(file) // NOSONAR
if (fileNames.some((n) => n.includes('../'))) throw new Error('Invalid file path in zip archive')
// after: one guard in core/utils, used by every caller
const MAX_ENTRIES = 100
const MAX_TOTAL_BYTES = 500 * 1024 * 1024
const MAX_RATIO = 10
export async function loadSafeArchive(data: Blob | ArrayBuffer): Promise<JSZip> {
  const zip = await new JSZip().loadAsync(data) // NOSONAR(S5042): entries checked below before any use
  const entries = Object.values(zip.files).filter((e) => !e.dir)
  if (entries.length > MAX_ENTRIES) throw new ArchiveRejectedError('too_many_entries')
  let total = 0
  for (const entry of entries) {
    if (isUnsafeEntryName(entry.name)) throw new ArchiveRejectedError('unsafe_entry_name')
    const bytes = await entry.async('uint8array')
    total += bytes.byteLength
    if (total > MAX_TOTAL_BYTES) throw new ArchiveRejectedError('archive_too_large')
  }
  if (data instanceof Blob && total > data.size * MAX_RATIO) throw new ArchiveRejectedError('compression_ratio')
  return zip
}
function isUnsafeEntryName(name: string): boolean {
  const n = name.replaceAll('\\', '/')
  return n.startsWith('/') || /^[a-zA-Z]:/.test(n) || n.split('/').includes('..')
}
```

Keep the limits from the requester or the backend's upload limit; map each rejection to the existing user message (for example `'ไฟล์ Zip มีโครงสร้างไม่ถูกต้อง (Zip Slip)'`). Reading every entry costs memory: for large archives, validate on the backend or stream entries and stop at the first limit.

### SEC-23 tag stripping

```ts
// before
const text = value.replace(/<[^>]*>/g, '')
// after (platform-ng 4ab68dc6): the browser parses, nothing executes
const text = new DOMParser().parseFromString(value, 'text/html').body.textContent ?? ''
```
