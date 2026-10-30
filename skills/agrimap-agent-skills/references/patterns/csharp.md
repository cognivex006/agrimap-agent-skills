# C# coding baseline

Apply to every C# file in `be-main` and `be-library`. Curated golden and owner rules outrank incidental legacy formatting; preserve proven public compatibility.

## Contents

- [Namespaces, files, and naming](#namespaces-files-and-naming)
- [HTTP boundary and DTOs](#http-boundary-and-dtos)
- [Request values](#request-values)
- [Async, errors, data, and logs](#async-errors-data-and-logs)
- [Comments and tests](#comments-and-tests)
- [Owner-approved templates](#owner-approved-templates)
- [Complexity and code smells](#complexity-and-code-smells)
- [Target test and tooling baseline](#target-test-and-tooling-baseline)
- [Decision order](#decision-order)

## Namespaces, files, and naming

- Use these roots: `agmws` = `AgriMap.Web.Service`; `agmbo` = `AgriMap.Worker`.
- Append only a fixed namespace below. Subfolders may organize files but never extend the namespace.

| Tier | Fixed namespace below `{Root}` |
| --- | --- |
| Application | `Application`, `Application.Interfaces`, `Application.UseCases` |
| Domain | `Domain.Constants`, `Domain.Entities`, `Domain.ValueObjects` |
| Infrastructure | `Infrastructure`, `Infrastructure.ExternalService`, `Infrastructure.Persistence.Interfaces`, `Infrastructure.Persistence.Models`, `Infrastructure.Persistence.Repositories` |
| Presentation | `Presentation.Config`, `Presentation.Controllers`, `Presentation.DTOs.Requests`, `Presentation.DTOs.Responses`, `Presentation.Filters`, `Presentation.Middlewares`, `Presentation.Mockup`, `Presentation.Models` |
| Shared | `Shared.Extensions`, `Shared.Helpers` |
| `agmbo` scheduling | `Infrastructure.Jobs` (`Infrastructure/Jobs/JobScheduler.cs`) |

This table is a namespace allowlist, not permission to create every tier. `agmbo` keeps its scheduler entry and does not gain a Presentation tier unless the project already proves one is required.

- Use `Application` and `Infrastructure` root namespaces for their DI registration extensions.
- Use `Presentation.Mockup` for JSON assets and `Presentation.Models` for models/model binders; do not invent deeper namespaces.
- **NS-01 — File order:** required `using` directives → blank line → `namespace Name;` → blank line → type. Without imports, start at the namespace. No block namespace or imports after it. Reuse global usings; no unused imports or namespace-rule bypass aliases. For C# file/import/namespace edits or reviews and ADV-01 overload order, read [C# file layout](csharp-file-layout.md). One public type per file.
- Use PascalCase for types/members, `I` for interfaces, `_camelCase` for private readonly dependencies, and `Async` for new async I/O methods. Preserve existing public names when renaming would break compatibility.
- Name transport types `*RequestDto` / `*ResponseDto`, orchestration `*UseCase`, inward data ports `I*Repository`, and implementations `*Repository`.
- Keep Presentation, Application, Domain, Port, and Infrastructure responsibilities separate as defined in [backend.md](backend.md).

`Infrastructure.Persistence.Models` is reserved for MongoDB documents or ORM entities. AtlasX Core Query results normally map to `Domain.Entities`/`Domain.ValueObjects` for business data or `Presentation.DTOs.Responses` for the outward contract; do not create a persistence model only to mirror an AtlasX result.

```csharp
namespace AgriMap.Web.Service.Application.UseCases;

public class UserUseCase : IUserUseCase
{
    private readonly IUserRepository _userRepository;

    public UserUseCase(IUserRepository userRepository)
    {
        ArgumentNullException.ThrowIfNull(userRepository);
        _userRepository = userRepository;
    }
}
```

## HTTP boundary and DTOs

Keep controllers thin: bind/validate the contract, call one use-case operation, and return the established response wrapper. Put orchestration and business decisions in Application/Domain.

```csharp
[Authorize]
[ApiController]
[Route("api/user-manage")]
public class UserManageController : ControllerBase
{
    private readonly IUserUseCase _userUseCase;

    public UserManageController(IUserUseCase userUseCase)
    {
        ArgumentNullException.ThrowIfNull(userUseCase);
        _userUseCase = userUseCase;
    }

    [ActionLogging]
    [HttpGet("users/search")]
    [ProducesResponseType(typeof(PaginatedResultResponseDto<UserResponseDto>), StatusCodes.Status200OK)]
    public async Task<PaginatedResultResponseDto<UserResponseDto>> SearchUserAsync(
        [FromQuery] UserSearchRequestDto request,
        CancellationToken cancellationToken)
    {
        return await _userUseCase.SearchUserAsync(request, cancellationToken);
    }
}
```

Declare JSON names explicitly when the HTTP contract is snake_case. Use nullable properties only when absence is valid; validate required fields at the boundary.

```csharp
public class UserCreateRequestDto
{
    [Required]
    [StringLength(20)]
    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("client_id")]
    public string? ClientId { get; set; }
}
```

## Request values

Use `AgriMap.Platform.Extensions`, centralized constants, normalized nullable strings, and first non-blank resolution:

```text
Cookie (highest) -> Header -> QueryString (lowest) -> Form/body when supported
```

For device ID use `AgmTraceId` cookie -> `agm-device-id` header -> `device_id` query/form. Use `AgmLoginContextId` for the login-context cookie.

```csharp
var deviceId = HttpRequestValueExtensions.FirstNotBlank(
    Request.ReadCookie(
        ClientRequestResolverExtensions.Cookies.AgmTraceId),
    Request.ReadHeader(
        ClientRequestResolverExtensions.Headers.AgmDeviceId),
    Request.ReadQuery(
        ClientRequestResolverExtensions.Parameters.DeviceId));

if (deviceId is null)
{
    deviceId = await Request.ReadFormAsync(
        ClientRequestResolverExtensions.Parameters.DeviceId,
        cancellationToken);
}
```

Do not hardcode request keys, duplicate trim/blank logic, eagerly read a body, or add DI wrappers around static extensions. Load the [request-value golden](golden/backend-libraries/013-1-extensions-request-value-normalize.md) for the complete API.

## Async, errors, data, and logs

- Propagate `CancellationToken` through new async I/O paths; do not block on tasks.
- Throw the established `AppException`/procedure exception with the exact contract code; keep internal detail out of user-facing messages.
- Build stored-procedure parameters in Infrastructure, log the procedure call structurally, check `result.Success`, then map data explicitly.
- Never log secrets, tokens, cookies, authorization values, or personal data merely because they appear in a parameter dictionary.

```csharp
var result = await _dataAccessConfiguration.CallProcedureAsync(
    _dbDataAccessService.DatabaseConfigure.DefaultDataSource,
    "um_user_q",
    parameters);

if (!result.Success)
{
    throw result.Message.ToProcedureException(
        result.GetOutputParameter<string>("error_detail"));
}

return result.DataTable
    .ToList<UserResponseDto>()
    .FirstOrDefault();
```

## Comments and tests

Comment only non-obvious intent, compatibility constraints, gates, or step boundaries. Use XML documentation for public library contracts when the surrounding library does. Avoid comments that restate the statement.

Tests for a resolver must cover each source, blank fallback, conflicting-source priority, multi-value behavior, and body-not-read-until-needed. Use the target test baseline below when a service has no established test project.

## Owner-approved templates

These rules are maintained owner guidance for new code and behavior-safe refactors. They outrank conflicting raw legacy examples. Do not use them to break an existing public or deployed contract without explicit scope.

### Nullable and guard clauses

**NULL-01 — Guard every constructor dependency.** Preserve the legacy coalescing form only while extending untouched legacy structure. For new code and refactors, use `ThrowIfNull` before assignment:

```csharp
public UserManageController(IUserUseCase userUseCase)
{
    ArgumentNullException.ThrowIfNull(userUseCase);
    _userUseCase = userUseCase;
}
```

**NULL-02 — Never suppress a nullable warning with `!`.** Resolve the actual null case with `?? string.Empty`, `?? throw new AppException(...)`, or a nullable value type such as `Dictionary<string, object?>`.

```csharp
// Forbidden: request.Keyword and request.Status may really be null.
var parameters = new Dictionary<string, object>
{
    { "keyword", request.Keyword! },
    { "status", request.Status! }
};

// Allowed when null is part of the stored-procedure contract.
var parameters = new Dictionary<string, object?>
{
    { "keyword", request.Keyword },
    { "status", request.Status }
};
```

**NULL-03 — Use pattern checks, not equality, for null.** `is AppException` is a type pattern, not a null-check substitute.

```csharp
if (request is null)
{
    throw new ArgumentNullException(nameof(request));
}

if (result is not null)
{
    // Use result.
}

if (ex is AppException)
{
    // Handle the known exception type.
}
```

**NULL-04 — Use `string.IsNullOrWhiteSpace` by default.** Retain `string.IsNullOrEmpty` only when continuing a proven legacy behavior where whitespace is intentionally meaningful; new code and refactors use `IsNullOrWhiteSpace`.

### Request-value precedence

**REQ-01 — A route parameter always wins over body/query identity for that resource.** Assign it once at the first line of the action; never use a sentinel that lets the body win.

```csharp
[HttpGet("users/by-organization/{org_id}")]
public async Task<DataMessageResponseDto<List<UserOrganizationResponseDto>>> GetUserOrganizationAsync(
    int org_id,
    [FromQuery] UserOrganizationRequestDto request,
    CancellationToken cancellationToken)
{
    request.OrganizeId = org_id;
    return await _userUseCase.GetUserOrganizationAsync(request, cancellationToken);
}
```

```csharp
// Forbidden legacy pattern: a conflicting body ID silently wins.
if (request.UserId == 0)
{
    request.UserId = id;
}
```

**REQ-02 — Authenticated user identity never comes from the request body or a hardcoded fallback.** Resolve it through `IAuthService` and handle absence explicitly.

```csharp
var sessionUserId = _authService.UserId()
    ?? throw new AppException(401, "unauthorized", "Authenticated user is required");

parameters.Add("session_user_id", sessionUserId);
```

Never use `string userId = "1"`, read identity directly from controller claims, or copy a body-provided user ID into the session-user stored-procedure parameter.

**REQ-03 — Centralize defaults once.** Put them in the DTO initializer or at the start of the use case, not at every use site.

```csharp
var rows = request.Rows <= 0 ? 10 : request.Rows;
var page = request.Page <= 0 ? 1 : request.Page;
```

Cookie/header/query/form precedence for non-route request values remains owned by [Request values](#request-values).

### Claims and authenticated identity

**AUTH-01 — Read identity through `IAuthService` only.** Do not read `User.Claims` directly or fall back to user `"1"`. Apply NULL-02 to the returned value; do not add `!`.

### Controller, binding, and response status

**CTL-01 — Return the response DTO directly.** Use `[ProducesResponseType]`; do not use `IActionResult`, controller `try/catch`, or construct `StatusCode(...)` error responses. Let `AppException` reach `GlobalExceptionMiddleware`.

```csharp
[ActionLogging]
[HttpGet("users/search")]
[ProducesResponseType(typeof(PaginatedResultResponseDto<UserResponseDto>), StatusCodes.Status200OK)]
public async Task<PaginatedResultResponseDto<UserResponseDto>> SearchUserAsync(
    [FromQuery] UserSearchRequestDto request,
    CancellationToken cancellationToken)
{
    return await _userUseCase.SearchUserAsync(request, cancellationToken);
}
```

New controller actions carry `CancellationToken`, including route-bound actions:

```csharp
public async Task<DataMessageResponseDto<JobProgressResponseDto>> GetJobProgressAsync(
    [FromRoute(Name = "job_id")] Guid jobId,
    CancellationToken cancellationToken)
```

**CTL-03 — Use the standard class attributes and wire names.** Controller routes are kebab-case; route/query names are snake_case and bind explicitly when the C# name differs.

```csharp
[Authorize]
[ApiController]
[Route("api/user-manage")]
public class UserManageController : ControllerBase
```

### Async and cancellation

**ASYNC-01 — Propagate `CancellationToken` through controller, use case, and repository.** Add and forward it automatically for new asynchronous paths and complete a refactor across every affected caller/interface; do not leave a partial signature migration.

**ASYNC-02 — Every `Task`-returning method uses the `Async` suffix.** Apply it at every new/refactored layer. Preserve an existing public name only when compatibility is outside the approved scope.

**ASYNC-03 — Never block on async work or manufacture async.**

```csharp
// Forbidden sync-over-async.
var stream = requestContent.ReadAsStreamAsync().GetAwaiter().GetResult();
body = stream.ReadToEnd();

// Forbidden fake async; return the tuple directly from a synchronous method.
return await Task.FromResult((data, meta));
```

Use asynchronous APIs with `await` and the propagated token. If no asynchronous work exists, remove `async`/`Task` and return the value directly when contract compatibility allows.

### Exceptions and error-code mapping

**ERR-01 — Use one error path.** Throw `new AppException(statusCode, "error_code", message)` and let `GlobalExceptionMiddleware` create the response.

```csharp
File = request.File
    ?? throw new AppException(400, "file_required", "File is required for this content type");
```

The middleware response contract is:

```json
{ "status_code": 400, "error": "file_required", "message": "..." }
```

Resolve the message from `lut_app_message:{error_code}` first and fall back to the exception message.

**ERR-02 — Use short snake_case error codes.** Examples: `invalid_parameter`, `unauthorized`, `forbidden`, `not_found`, `internal_server_error`, `file_required`, `password_not_empty`, `aes_key_not_configured`.

**ERR-03 — Server bugs are not HTTP 400.** Never map `NullReferenceException` or `IndexOutOfRangeException` to `BadRequest`.

**ERR-04 — Never swallow an exception.** A compatibility catch must at least log a warning with the exception and actionable context; do not write `catch { }`.

**ERR-05 — Do not fork `GlobalExceptionMiddleware` per service.** Change the shared owner only under explicit cross-service scope.

### Structured logging

**LOG-01 — Use structured message templates and pass exceptions first.**

```csharp
_logger.LogInformation("Starting: {Action}", actionName);
_logger.LogError(ex, "Error occurred while executing {Action}", actionName);
```

**LOG-02 — Do not concatenate or interpolate log messages.** Replace `_logger.LogError("Unhandled Exception: " + ex)` with `_logger.LogError(ex, "Unhandled exception");`.

### DI lifetime and options

**DI-01 — Register use cases and repositories as scoped.** Do not introduce transient lifetimes for them.

```csharp
public static IServiceCollection AddApplicationServices(this IServiceCollection services)
{
    services.AddScoped<IUserUseCase, UserUseCase>();
    services.AddScoped<IPermissionUseCase, PermissionUseCase>();
    return services;
}
```

A deliberately stateful in-memory store may be singleton, such as `IAuthorizationCodeRepository` backed by `AuthorizationCodeInMemoryRepository`, but the registration must explain why singleton lifetime is required.

### Repository and stored procedures

**REPO-01 — Follow the platform repository shape.** Use `Infrastructure/Persistence/Interfaces/I*Repository.cs`, `Infrastructure/Persistence/Repositories/*Repository.cs`, and `Infrastructure/Persistence/Models/` only for MongoDB or ORM models. Study raw legacy files `009-4-1-repository-interface.cs` and `010-4-2-repository-implementation.cs` for the established structural flow after applying conflict resolution.

- Stored-procedure parameter keys are snake_case and match procedure parameters.
- Pagination output uses the existing `"data2"` convention.
- Procedure names use the module prefix, such as `um_`, and `_q`, `_i`, `_u`, or `_d` for query/insert/update/delete.
- AtlasX result models follow the placement rules above; do not create persistence models for them by default.

**REPO-02 — Keep multi-table atomic writes in one stored procedure.** Do not call multiple write procedures from a use case and assume atomicity when the application has no transaction boundary.

### JSON wire format

**JSON-01 — Keep the global snake_case policy.** Do not override it per service.

```csharp
.AddJsonOptions(options =>
{
    var json = options.JsonSerializerOptions;
    json.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    json.DictionaryKeyPolicy = JsonNamingPolicy.SnakeCaseLower;
    json.PropertyNameCaseInsensitive = true;
});
```

**JSON-02 — Bind request DTO wire names explicitly.**

```csharp
public class UserSearchRequestDto : QueryPagedRequestDto
{
    [BindProperty(Name = "keyword")]
    [JsonPropertyName("keyword")]
    public string? Keyword { get; set; }

    [BindProperty(Name = "role_id")]
    [JsonPropertyName("role_id")]
    public int? RoleId { get; set; }
}
```

## Complexity and code smells

**QUALITY-01 — Keep methods simple.** Team limit: seven `if`/`else if` decisions per method, including nested ones; `else` alone does not count. Use cohesive helpers and guard clauses, never nested ternaries to evade this limit. Also check the configured SonarQube Cognitive Complexity gate (S3776): its score differs from branch count. Seven is the team's branch limit, not a SonarQube default.

**QUALITY-02 — At most seven parameters.** Methods/constructors allow seven parameters (S107). Group related inputs into typed request/options objects or split responsibilities. Report necessary public-contract changes; never silently break callers, hide unrelated arguments in dictionaries or suppress the rule.

**QUALITY-03 — No nested ternaries (S3358).** Extract nested ternaries, including anonymous-object properties, into statements/helpers. Standalone ternaries are allowed. Preserve lazy evaluation, ordering, exact strings and response shape.

**QUALITY-04/05:** [SonarQube notices; advisory smells](../sonarqube-remediation.md).

Noncompliant cases:

```csharp
return j.IsRunning ? "Running" : j.HasErrors ? "Failed" : "Succeeded";

RequireMessage(message, request.AuthorizeResult == "fail" ? "diable_success"
    : status == "RESERVE" ? "reserve_success" : "reuse_right_code");

return IsPlusRight(context)
    ? new { status_code = statusCode, code = errorCode == "internal_server_error" ? "internal_error" : errorCode, message }
    : (object)new { status_code = statusCode, error = errorCode, message };
```

Compliant replacements, respectively:

```csharp
if (j.IsRunning)
{
    return "Running";
}
return j.HasErrors ? "Failed" : "Succeeded";
```

```csharp
string messageCode;
if (request.AuthorizeResult == "fail")
{
    messageCode = "diable_success";
}
else if (status == "RESERVE")
{
    messageCode = "reserve_success";
}
else
{
    messageCode = "reuse_right_code";
}
RequireMessage(message, messageCode);
```

```csharp
if (IsPlusRight(context))
{
    var code = errorCode == "internal_server_error" ? "internal_error" : errorCode;
    return new { status_code = statusCode, code, message };
}
return (object)new { status_code = statusCode, error = errorCode, message };
```

Review touched code for duplicate branches, dead code, deep nesting and swallowed exceptions. Fix smells within scope, preserving behavior and existing constant/error rules. Examples retain legacy literals, including spelling; they do not authorize new hardcoding. Nested ternaries are a smell regardless of complexity score. These rules do not configure analyzers or establish a passing scan.

## Target test and tooling baseline

These sections are owner-approved targets, not claims that current repositories already contain them.

**TEST-01 — New backend test projects.** Place `AgriMap.Web.Service.Tests.csproj` under `Tests/`, use xUnit with NSubstitute, name tests `MethodName_Scenario_ExpectedResult`, and use one `IClassFixture<ServiceFixture>` per service for shared configuration/DI.

**TEST-02 — First coverage protects route precedence.**

```csharp
[Theory]
[InlineData(5, 0, 5)]
[InlineData(5, 9, 5)]
public async Task UpdateUser_RouteAndBodyIdDiffer_RouteWins(
    int routeId,
    int bodyId,
    int expected)
```

**TOOL-01 — Shared services-root tooling target.** Add one `.editorconfig` for `is null`/naming/formatting, one `Directory.Build.props` for shared analyzers and banned symbols (`Console.WriteLine`, `DateTime.Now`, `DateTimeExtensions.GetNow`), and a Jenkins `dotnet format --verify-no-changes` gate. Do not claim this tooling exists until the target workspace proves it.

**TEST-03 — Configure the main project when unit tests exist.** For unit tests with a matching `*.Tests.csproj`/`*.Test.csproj`, reconcile these entries in the production `.csproj`, never the `.sln` or test project. `InternalsVisibleTo Include` matches the effective test `AssemblyName`, defaulting to the filename without `.csproj`; signed assemblies need the test assembly's public key. Preserve configuration without duplicates. Exclude nested `Tests/` sources from production compilation. Apply to existing/new test projects; this rule alone does not require creating tests.

Example: `AgriMap.Web.Service.csproj` with `Tests/AgriMap.Web.Service.Tests.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
  <!-- Existing project configuration -->
  <ItemGroup>
    <InternalsVisibleTo Include="AgriMap.Web.Service.Tests" />
    <Compile Remove="Tests\**\*.cs" />
  </ItemGroup>
</Project>
```

**TEST-04 — Check Docker publishing when tests change.** On adding/editing `*.Tests.csproj` or `*.Test.csproj`, inspect affected Dockerfiles. Explicitly target the production `.csproj` in `dotnet publish`, relative to the stage's `WORKDIR` and copied files. Preserve flags/stages and ensure restore covers that project with `--no-restore`. Record absent Dockerfiles; do not invent one.

```dockerfile
# Before: implicit project selection
RUN dotnet publish -c Release -o out --no-restore
# After: explicit production project (example path)
RUN dotnet publish "./AgriMap.Web.Service.csproj" -c Release -o out --no-restore
```

## Decision order

1. New code follows every owner-approved rule above, including `[TARGET]` rules when creating the relevant scaffold.
2. Existing code must not gain a forbidden pattern. When a touched violation can be corrected without changing behavior or an external contract, fix it in scope, except QUALITY-05 (only its safe tier).
3. When real files conflict with these rules, these maintained rules govern new structure and safe refactors; raw legacy files may be examples of defects. Preserve proven deployed behavior and stop for approval before a material contract or behavior change.
