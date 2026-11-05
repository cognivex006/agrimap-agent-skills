# Security — <Surface>

Scope: which files and AgriMap projects. Base file this one extends, if any. Class definitions, response contract and tiers: [security-baseline.md](../security-baseline.md). Index: [security-matrix.md](../security-matrix.md).

Filling a row:

- Class is an existing `SEC-*`; a new class is defined in `security-baseline.md` first, then mapped here.
- Key exactly as the scan prints it; `team` for a Golden rule without a key; `-like` when the concept matches a Sonar rule in another language.
- Do not write / Write it this way in this surface's idiom; Seen = repo and commit, or `catalog`.

| Class | Key | Do not write | Write it this way | Seen |
| --- | --- | --- | --- | --- |
| SEC-28 | S6418 | Secrets in committed files | Environment or secret store; rotate exposed values | catalog |
