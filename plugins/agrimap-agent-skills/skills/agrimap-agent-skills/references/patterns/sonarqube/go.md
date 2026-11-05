# SonarQube — Go

Go is not a Golden lane yet: AgriMap has no Go code, scan or folder structure. This is the starting set for the day a Go service is approved, so every row is `catalog`. When the lane starts, add Seen evidence, Existing-code tiers and a `security/go.md`. IDs are shared with the other languages ([sonarqube-matrix.md](../sonarqube-matrix.md)).

| Golden | Key | Smell | New code |
| --- | --- | --- | --- |
| QUALITY-01 | S3776 | Cognitive Complexity above 15 | must |
| QUALITY-02 | S107 | More than 7 parameters | must (options struct) |
| ADV-21 | S1135 | TODO/FIXME | must |
| ADV-23 | S125 | Commented-out code | must |
| ADV-24 | S1854 | Dead store | must |
| ADV-25 | S1871 | Identical branches | must |
| ADV-28 | S4144 | Identical functions | must |
| ADV-33 | S1186 | Empty function | must |
| ADV-34 | S108 | Empty block, including `if err != nil {}` | must |
| ADV-38 | S1192 | Duplicated string literal | should |
| ADV-39 | S1066 | Mergeable nested `if` | must |
| — | S134 | Nesting deeper than 4 levels | must |
| — | S1151, S1479 | `switch` case too long, too many cases | should |
| — | S100, S117 | Function or variable names not MixedCaps | must |
| — | team | Error discarded with `_ =` or returned without context (`fmt.Errorf("...: %w", err)`) | must |
| — | team | `context.Context` not the first parameter or not propagated | must |
| SEC-01 | S2077 | SQL built with string formatting | must (placeholders) |
| SEC-08 | S2245, S4790 | `math/rand` for secrets; MD5/SHA-1 | must (`crypto/rand`, SHA-256) |
| SEC-11 | S4830, S4423 | `InsecureSkipVerify: true`; old TLS `MinVersion` | must |
