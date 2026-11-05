# SonarQube — <Language>

Scope: which files and AgriMap projects. Sonar repository key: `<key>`. Base file this one extends, if any (for example [typescript.md](typescript.md)). Column meanings: [sonarqube-matrix.md](../sonarqube-matrix.md). Security: `security/<language>.md`.

Filling a row:

- Reuse the Golden ID when the concept already has one (concept map in the index); otherwise take the next free `ADV-*` and define it once in `sonarqube-remediation.md`.
- Key exactly as the scan prints it; `team` for a Golden rule without a key; `verify` when the number is not confirmed.
- New code `must`/`should`; existing code `safe`/`recommend`/`skip-if-unsure`; Seen = repo and commit, or `catalog`.
- Before/after only for a non-obvious fix, in this language's idiom.

| Golden | Key | Smell | New code | Existing code | Seen |
| --- | --- | --- | --- | --- | --- |
| QUALITY-01 | S3776 | Cognitive Complexity above 15 | must | recommend | catalog |
