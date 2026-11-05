# SonarQube matrix (index by language)

Entry point for every SonarQube code smell, bug and hotspot the Golden rules cover. One file per language under [sonarqube/](sonarqube/); this index holds the shared vocabulary, the concept map across languages and the fixes the team got wrong. Security classes have their own index: [security-matrix.md](security-matrix.md). Policy (notice before editing, recommend-first, safe tier, suppression) stays in [sonarqube-remediation.md](../sonarqube-remediation.md); worked C# fixes stay in [sonarqube-fix-examples.md](sonarqube-fix-examples.md).

## Contents

- [Language files](#language-files)
- [How to read a language file](#how-to-read-a-language-file)
- [Concept map across languages](#concept-map-across-languages)
- [Anti-fixes seen in AgriMap commits](#anti-fixes-seen-in-agrimap-commits)
- [Adding a language or a rule](#adding-a-language-or-a-rule)

## Language files

Read only the file for the language you are writing. A rule appears once per language, written in that language's idiom: never copy another language's fix.

| Language | File | Sonar repository key | AgriMap code | Evidence |
| --- | --- | --- | --- | --- |
| C# | [sonarqube/csharp.md](sonarqube/csharp.md) | `csharpsquid`, Roslyn `CA`/`IDE`/`SYSLIB`/`ASP` | `agmws-*`, `agmbo-*`, `AgriMap.*` | identity, dynamic-dashboard, file-management, license-management, plus |
| TypeScript | [sonarqube/typescript.md](sonarqube/typescript.md) | `typescript` | all `.ts` | platform-ng, pro-ng, suite-ng, license-management |
| JavaScript | [sonarqube/javascript.md](sonarqube/javascript.md) | `javascript` | `.js`/`.mjs` tools and Node scripts | release-notify.mjs |
| Angular | [sonarqube/angular.md](sonarqube/angular.md) | `typescript` + `Web` (templates) | `agmwa-*`, `@agrimap/*` | platform-ng, pro-ng, suite-ng |
| HTML | [sonarqube/html.md](sonarqube/html.md) | `Web` | Angular templates, `index.html`, `.cshtml` | platform-ng, suite-ng |
| CSS/SCSS | [sonarqube/css.md](sonarqube/css.md) | `css` | `.css`, `.scss` | catalog only |
| Go | [sonarqube/go.md](sonarqube/go.md) | `go` | not a Golden lane yet | catalog only |
| Next.js/React | [sonarqube/nextjs.md](sonarqube/nextjs.md) | `typescript`/`javascript` (React rules) | not a Golden lane yet | catalog only |

TypeScript and JavaScript share one Sonar analyzer: `typescript.md` holds every rule both raise, `javascript.md` only what differs for untyped Node scripts. Angular adds framework rules on top of `typescript.md`; Next.js adds React rules on top of it.

## How to read a language file

- **Golden** — the stable rule ID (QUALITY-*, ADV-*, ERR-*, SEC-*). IDs are shared across languages: ADV-24 is "dead store" in every file. Never reuse or renumber an ID: Golden Lint binds to them. ADV IDs are defined once in [sonarqube-remediation.md](../sonarqube-remediation.md).
- **Key** — the Sonar or analyzer key exactly as the scan prints it. `team` means no analyzer key: a Golden rule. `verify` means the concept is certain but confirm the key in the scan before quoting it.
- **New code** — `must`: code you write or rewrite never raises it. `should`: avoid it unless the design needs the shape; say why.
- **Existing code** — `safe`: also fix it in a file the authorized task already edits (mechanical, contract-free). `recommend`: report with evidence, fix only on request ([QUALITY-05](../sonarqube-remediation.md#advisory-code-smells-quality-05)). `skip-if-unsure`: report and leave it unless every check holds.
- **Seen** — the repo or commit where the team met it. `catalog` rows are common Sonar findings the team has not hit yet; they follow the same tiers.

## Concept map across languages

One concept, one Golden ID, the key in each language. `—` means the language has no such rule or construct.

| Golden | Concept | C# | TypeScript/JS | HTML | CSS | Go |
| --- | --- | --- | --- | --- | --- | --- |
| QUALITY-01 | Cognitive Complexity ≤ 15 | S3776 | S3776 | — | — | S3776 |
| QUALITY-02 | At most 7 parameters | S107 | S107 | — | — | S107 |
| QUALITY-03 | No nested ternary | S3358 | S3358 | — | — | — |
| QUALITY-06 | No redundant jump | S3626 | S3626 | — | — | — |
| ADV-03 | Redundant cast / assertion | S1905 | S4325 | — | — | — |
| ADV-05 | Unused local | S1481 | S1481 | — | — | compiler |
| ADV-20 | Unused import | S1128, IDE0005 | S1128 | — | — | compiler |
| ADV-21 | TODO/FIXME | S1135 | S1135 | S1135 | — | S1135 |
| ADV-23 | Commented-out code | S125 | S125 | verify | — | S125 |
| ADV-24 | Dead store | S1854 | S1854 | — | — | S1854 |
| ADV-25 | Identical branches | S1871 | S1871 | — | — | S1871 |
| ADV-26 | Unbraced multi-line body | S2681 | S2681 | — | — | — |
| ADV-28 | Identical method bodies | S4144 | S4144 | — | — | S4144 |
| ADV-29 | Boolean literal comparison | S1125 | S1125 | — | — | — |
| ADV-32 | Field assigned once is not readonly | S2933 | S2933 | — | — | — |
| ADV-33 | Empty function | S1186 | S1186 | — | — | S1186 |
| ADV-34 | Swallowed exception | S108, S2486 | S2486 | — | — | S108 |
| ADV-38 | Duplicated string literal | S1192 | S1192 | — | — | S1192 |
| ADV-39 | Mergeable nested `if` | S1066 | S1066 | — | — | S1066 |
| ADV-43 | Empty block / duplicate property | — | — | — | S4658, S4656 | — |
| SEC-23 | Regex backtracking | S5852 | S5852 | — | — | — |

Language-only rules (ADV-02 `static`, ADV-27 default parameters, ADV-31 `Number.*`, ADV-37 accessibility, ...) are listed only in their language file.

## Anti-fixes seen in AgriMap commits

These "fixes" closed or moved a finding but left a defect or a new smell. Do not repeat them; each language file shows the correct shape.

| Seen | What was done | Why it is wrong | Correct fix |
| --- | --- | --- | --- |
| platform-ng `4ab68dc6`, suite-ng `a23277e`, pro-ng `58b1479` | `/\/+$/` (S5852) replaced by a hand-written `while (x.endsWith('/'))` loop in six files | Same logic copied six times (ADV-28, S4144) | One shared `trimTrailingSlashes()` helper in `core/utils` with a test, then call it everywhere |
| platform-ng `4eb3aefc` → `44514634` | `maxThresholdRatio = 10` declared for the zip-bomb check, never used, then deleted as an unused local | The compression-ratio guard of S5042 was never implemented | Implement count, total size and ratio checks (SEC-25) before deleting the variable |
| platform-ng `e9173f70`, `4ab68dc6` | `loadAsync(file) // NOSONAR` | Suppression without rule ID or reason; one copy checked only `../` | `// NOSONAR(S5042): entries checked for count, size, ratio and traversal by assertSafeArchive()` after the guard runs (QUALITY-08) |
| suite-ng `b68a9d9` | `void windowStatus` → `const _windowStatus = this.stat().windowStatus` | Still a dead store (ADV-24); the underscore only hides it | Read the signal where the dependency is needed, or delete the line |
| file-management `218fb21` | `catch { }` → `catch (Exception) { Console.WriteLine(...); continue; }` | Console bypasses NLog (OBS-01) and loses the exception | `_logger.LogWarning(ex, "...")` with context, or narrow the catch to the expected type |
| pro-ng `6eb3319` | `confirmDelete(title = 'ยืนยันการลบ', content)` → `title: string` | Callers that relied on the default now must pass a title; the default text is lost | Move the optional parameter last or take an options object (ADV-27) |
| suite-ng `caf7cfd` | `location.weather?.tempIcon` → `location.weather!.tempIcon`; `[innerHTML]="x \| safeHtml"` | `!` turns a null into a runtime error; a bypass pipe disables sanitization (SEC-21) | Narrow with `@if (location.weather; as w)`; bind `[innerHTML]` without a bypass pipe |
| dynamic-dashboard `9d52fd2` | `x?.Any(...) == true` → `?? false` | Correct here, but `!= true` → `!x` on `bool?` changes null handling | ADV-29 check: only simplify a non-nullable `bool` |
| identity `5de83da` | Deleted `.vscode/launch.json` holding connection strings, keys and passwords | The values stay in Git history | Rotate every exposed secret; deletion alone does not close S6418 (SEC-28) |
| file-management `d0ad551` | Default `http://+:5000` and the HTTPS filter removed from `ResolveUrls` | Behavior change hidden in a smell fix | Notify before editing; a URL/binding change is a contract change ([sonarqube-remediation.md](../sonarqube-remediation.md)) |

## Adding a language or a rule

1. Copy [sonarqube/_template.md](sonarqube/_template.md) to `sonarqube/<language>.md`, add a row to [Language files](#language-files) and one column to the concept map only when the language has a real analyzer.
2. A new concept takes the next free ID (`ADV-46`, ...) and is defined once in the ADV table of [sonarqube-remediation.md](../sonarqube-remediation.md); every language file that raises it reuses that ID.
3. Each row needs Key, New code, Existing code and Seen. Add a before/after only when the fix is not obvious; keep the real code's behavior and contracts.
4. A rule a linter can detect must keep its ID stable; record renames in CHANGELOG.
