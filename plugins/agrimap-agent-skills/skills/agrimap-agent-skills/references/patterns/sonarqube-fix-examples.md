# SonarQube fix examples

Before/after examples for the SonarQube rules in [csharp.md](csharp.md) (QUALITY-01..07) and the advisory smells in [sonarqube-remediation.md](../sonarqube-remediation.md) (ADV-*). Rules by language: [sonarqube-matrix.md](sonarqube-matrix.md). Read this before writing or refactoring a method that branches, loops or validates input, and before fixing a scan finding. The examples show the shape of the fix; keep the real method's order, messages, side effects and contracts.

## Contents

- [QUALITY-01 — Cognitive Complexity](#quality-01--cognitive-complexity-s3776-sonar-default-15)
- [QUALITY-02 — Parameters](#quality-02--at-most-seven-parameters-s107)
- [QUALITY-06 — Redundant jumps](#quality-06--no-redundant-jumps-s3626)
- [QUALITY-07 — ADV-02/05/06/11 in new code](#quality-07--new-code-is-free-of-adv-02050611)
- [ERR-06 / ERR-07 — Exceptions](#err-06--err-07--exceptions-s112-s3928)
- [Advisory smells](#advisory-smells-recommend-first-quality-05)

## QUALITY-01 — Cognitive Complexity (S3776, Sonar default 15)

Score the method yourself before you call it done. Branch count alone is not the score.

| Construct | Adds |
| --- | --- |
| `if`, `?:`, `switch` (statement or expression), `for`, `foreach`, `while`, `do`, `catch` | 1 + current nesting level |
| `else if`, `else`, `goto` | 1 (no nesting bonus) |
| each run of `&&` or `\|\|` that changes operator (`a && b && c` = 1, `a && b \|\| c` = 2) | 1 |
| lambda body | no increment, but nesting + 1 inside it |

Nesting rises by one inside the body of each `if`/`else`/loop/`switch`/`catch`/`?:`/lambda. A local function is scored on its own.

Before (score 18: it passes the seven-branch limit and still fails S3776):

```csharp
public async Task<PlusRightResponseDto> ExecuteAsync(PlusRightRequestDto request)
{
    if (request is null || string.IsNullOrWhiteSpace(request.RightCode))   // 1 + 1 (||)
    {
        throw new AppException(400, "invalid_request");
    }
    var right = await _repository.GetRightAsync(request.RightCode);
    if (request.Action == "keep")                                          // 1
    {
        if (right is null)                                                 // 2 (nesting 1)
        {
            throw new AppException(404, "right_not_found");
        }
        if (right.Status == "USED" || right.Status == "EXPIRED" && !request.Force) // 2 + 2 (|| then &&)
        {
            throw new AppException(409, "right_unavailable");
        }
        foreach (var item in right.Items)                                  // 2 (nesting 1)
        {
            if (item.IsLocked)                                             // 3 (nesting 2)
            {
                continue;
            }
            item.Keep();
        }
    }
    else if (request.Action == "release")                                  // 1
    {
        if (right is not null)                                             // 2 (nesting 1)
        {
            right.Release();
        }
    }
    var code = right?.Status switch { "RESERVE" => "reserve_success", _ => "reuse_right_code" }; // 1
    return new PlusRightResponseDto(code);
}
```

After (every method scores 3 or less): guard clauses, a named condition and one helper per cohesive step.

```csharp
public async Task<PlusRightResponseDto> ExecuteAsync(PlusRightRequestDto request)
{
    ValidateRequest(request);
    var right = await _repository.GetRightAsync(request.RightCode);
    if (request.Action == "keep")
    {
        Keep(right, request.Force);
    }
    else if (request.Action == "release")
    {
        right?.Release();
    }
    return new PlusRightResponseDto(MessageCode(right?.Status));
}

private static void ValidateRequest(PlusRightRequestDto? request)
{
    if (request is null || string.IsNullOrWhiteSpace(request.RightCode))
    {
        throw new AppException(400, "invalid_request");
    }
}

private static void Keep(Right? right, bool force)
{
    if (right is null)
    {
        throw new AppException(404, "right_not_found");
    }
    if (IsUnavailable(right, force))
    {
        throw new AppException(409, "right_unavailable");
    }
    foreach (var item in right.Items.Where(i => !i.IsLocked))
    {
        item.Keep();
    }
}

// Keeps the original precedence: USED || (EXPIRED && !force).
private static bool IsUnavailable(Right right, bool force) => right.Status == "USED" || right.Status == "EXPIRED" && !force;

private static string MessageCode(string? status) => status switch
{
    "RESERVE" => "reserve_success",
    _ => "reuse_right_code"
};
```

Ways to lower the score, cheapest first: return/throw early instead of wrapping the rest in `if`; move a nested block into a named `private static` helper; name a mixed `&&`/`||` condition; filter a loop with `Where` instead of `if … continue`; map values with a flat `switch` expression instead of an `if` chain. Never hide branches in nested ternaries (QUALITY-03) or dictionaries of lambdas to game the score.

## QUALITY-02 — At most seven parameters (S107)

```csharp
// Before
Task<int> CreateAsync(string code, string name, int typeId, int areaId, DateTime start, DateTime end, decimal amount, string createdBy);

// After: one typed request; callers keep the same data.
Task<int> CreateAsync(CreatePlotRequestDto request, string createdBy);
```

## QUALITY-06 — No redundant jumps (S3626)

```csharp
// Before
foreach (var row in rows)
{
    if (row.IsValid) { Save(row); }
    continue;
}

// After
foreach (var row in rows)
{
    if (row.IsValid) { Save(row); }
}
```

## QUALITY-07 — New code is free of ADV-02/05/06/11

```csharp
// Before
var result = _cache.Remove(key);                       // ADV-05 S1481: never read
if (path.StartsWith("/")) { }                          // ADV-11 CA1866
private string Normalize(string value) => value.Trim(); // ADV-02 CA1822: no instance data
Assert.IsAssignableFrom<OkObjectResult>(response);     // ADV-06 xUnit2032

// After
_ = _cache.Remove(key);
if (path.StartsWith('/')) { }
private static string Normalize(string value) => value.Trim();
Assert.IsType<OkObjectResult>(response, exactMatch: false);
```

## ERR-06 / ERR-07 — Exceptions (S112, S3928)

```csharp
// Before
throw new Exception("not found");
throw new ArgumentNullException("req");

// After
throw new AppException(404, "plot_not_found");
ArgumentNullException.ThrowIfNull(request);
```

## Advisory smells (recommend first; QUALITY-05)

```csharp
// ADV-14 S3267: loop body is only a filter
foreach (var p in plots) { if (p.IsActive) { Sync(p); } }
foreach (var p in plots.Where(p => p.IsActive)) { Sync(p); }

// ADV-08 CA1861: constant array argument
Assert.Equal(new[] { "A", "B" }, actual);
private static readonly string[] ExpectedCodes = ["A", "B"];
Assert.Equal(ExpectedCodes, actual);

// ADV-10 ASP0015: header indexer
var token = Request.Headers["Authorization"].ToString();
var token = Request.Headers.Authorization.ToString();

// ADV-07 CA1816
public void Dispose() { _stream.Dispose(); }
public void Dispose() { _stream.Dispose(); GC.SuppressFinalize(this); }
```

```ts
// ADV-15 S6594: match without g
const m = value.match(/^(\d+)-(\d+)$/);
const m = /^(\d+)-(\d+)$/.exec(value);

// ADV-16 S6353: verbose class (JS without u/v flags)
const code = /^[A-Za-z0-9_]+$/;
const code = /^\w+$/;
```

After any fix, rerun lint and the project's SonarQube analysis when available, and report the actual result or S3776 as unverified (sonarqube-remediation.md).
