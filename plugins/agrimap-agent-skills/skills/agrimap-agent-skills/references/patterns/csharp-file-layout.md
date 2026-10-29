# C# file layout — NS-01 and ADV-01

Applies to hand-authored, namespace-bearing backend C# files in services, workers and libraries. Read this with the [C# baseline](csharp.md#namespaces-files-and-naming). This owner rule outranks formatting in raw legacy golden examples.

Review these as a pair whenever a request asks about using, namespace, file order, member order or overload placement, whatever lint reports. A Golden Lint run without a finding is not evidence that a file passes NS-01 or ADV-01; read the files.

Other baseline snippets may omit imports as fragments; assemble complete files using these layouts.

## Case 1 — no file-local using directives

Declare the file-scoped namespace, one blank line, then the type. Do not invent a `using` block when the file needs none or global/implicit usings already supply its imports.

```csharp
namespace AgriMap.Web.Service.Presentation.DTOs.Responses;

public class UserResponseDto
{
    public string Name { get; set; } = string.Empty;
}
```

## Case 2 — file-local using directives are needed

Put every required `using` before the namespace. Separate the using block, namespace and type with one blank line. Example where this import is not already global:

```csharp
using System.Text.Json.Serialization;

namespace AgriMap.Web.Service.Presentation.DTOs.Responses;

public class UserResponseDto
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}
```

## Review and preservation

- Require `namespace Name;`, not `namespace Name { ... }`. No `using` after the namespace, including namespace-local using directives permitted by C# syntax.
- Keep the actual namespace within the baseline allowlist. A file under `DTOs/Requests/OAuth/` still uses `AgriMap.Web.Service.Presentation.DTOs.Requests`, never a new `.OAuth` suffix. In libraries preserve the published namespace/API.
- Keep existing required license/header comments and preprocessor directives; the order above describes code sections. Preserve directive scope and compilation behavior when moving imports.
- `using` here means import directives, including static/alias imports, not `using` statements/declarations that manage resources inside a method.
- Do not force a namespace into top-level `Program.cs` or a global-usings-only file. Leave generated code to its generator. Converting an existing block namespace must preserve type identity, scope and behavior; report a compatibility/language-version blocker rather than changing public namespaces or project language settings.
- Check both cases during review: no unused/dummy imports; all required file-local imports before the namespace; semicolon form; one blank line between sections; one public type per file. Follow project import sorting separately.

Noncompliant NS-01 shapes to report, each with `file:line`. Both compile, so a build does not catch them.

```csharp
// Namespace placed above its imports
namespace AgriMap.Web.Service.Presentation.DTOs.Responses;
using System.Text.Json.Serialization;
```

```csharp
// Block namespace with a namespace-local import
namespace AgriMap.Web.Service.Application.UseCases
{
    using AgriMap.Web.Service.Application.Interfaces;
}
```

## Overload order — ADV-01 (S4136)

Methods with the same name in one class or interface stay adjacent, simplest (fewest parameters) first. Another member between two overloads is a finding.

```csharp
// Noncompliant: Search overloads are split by GetById
public Task<UserDto> SearchAsync(string keyword) { ... }
public Task<UserDto> GetByIdAsync(int id) { ... }
public Task<UserDto> SearchAsync(string keyword, int page) { ... }

// Compliant
public Task<UserDto> SearchAsync(string keyword) { ... }
public Task<UserDto> SearchAsync(string keyword, int page) { ... }
public Task<UserDto> GetByIdAsync(int id) { ... }
```

- Compare members of one type declaration; constructors, explicit interface implementations and partial parts in other files are reported separately only when evidence proves the order.
- ADV-01 is advisory ([QUALITY-05](../sonarqube-remediation.md#advisory-code-smells-quality-05)): always report it when asked or when reviewing, with `file:line` of each split overload. Reorder only when the requester asks for this rule or finding; reordering is behavior-preserving but keep `#region`, partial-file and diff-noise trade-offs visible.
- New code keeps overloads adjacent.

For an AgriMap backend request, enter through `agm-be`; its C# condition loads `patterns/csharp.md`, which points here when file layout is involved. Execution/review paths using the same baseline follow this rule too. State which files were opened; do not claim cross-model execution or a build merely from reading examples.
