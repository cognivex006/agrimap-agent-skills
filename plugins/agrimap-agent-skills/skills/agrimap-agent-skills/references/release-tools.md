# Release tool detection, installation and compatibility

## Detect before installing

The Agent runs these checks, not the requester. Execute commands individually and inspect each exit code before a dependent action. On Windows use Get-Command or where.exe, not the PowerShell where alias.

1. Run git --version, dotnet --info, dotnet --list-sdks, dotnet --list-runtimes and dotnet tool list --global. Match exact package ID AgriMap.ProjectDevKit.NetCore.Release (case-insensitive), whose CLI version is independent of all service versions and the skill-package version.
2. Resolve agm-release with Get-Command. If missing, check the standard shim at %USERPROFILE%\.dotnet\tools\agm-release.exe (Unix: $HOME/.dotnet/tools/agm-release). Inspect executable/package ownership before using a colliding executable. A listed package with an accessible working shim means installed, even if PATH is stale. Use its absolute path; never reinstall just because PATH resolution failed.
3. Invoke usage without arguments. The observed CLI emits usage and exits nonzero for missing command; that is not installation failure. It does not support --help or arbitrary --version. Use dotnet tool list --global for CLI version. Confirm runtime readiness with a supported read-only audit against the explicit target and distinguish application precondition failures from runtime-launch failures.
4. If package is present but shim/runtime is broken, diagnose that specific failure first. Install a missing required runtime/SDK from the official vendor or a verified configured OS package manager, respecting platform permissions. Never change global feeds, credentials or TLS settings. Do not prompt for credentials in logs or expose secrets.

An audit error such as `Expected AGENTS.md and Jenkinsfile` is an application prerequisite failure, not proof of a broken CLI installation. Inspect each named path on the synchronized target branch; handle bundled files through release-and-bootstrap.md before retrying. Jenkinsfiles require project-specific evidence and are never synthesized by bootstrap.

## Canonical source and installation

Canonical clone URL: https://gitlab.gisc.cdg.co.th/e26-5002.agrimap/standards/tools/cli/netcore/agrimap.projectdevkit.netcore.release.git

If the package is truly absent, use existing authorized Git access to clone into an isolated tools/temp directory outside the product repository. Read the current README and project metadata before executing installation; stop on failed clone/auth rather than inventing public NuGet availability. The README inspected on 2026-09-09 at source commit 1c06e32e778bc67f47ad40c2012c37b5a925102a specifies .NET SDK 8 or newer and a net8.0 tool. Its Windows build/install sequence is below; paths are relative to the cloned CLI root, never the product root.

```powershell
dotnet restore .\AgriMap.ProjectDevKit.NetCore.Release.sln
dotnet test .\AgriMap.ProjectDevKit.NetCore.Release.sln -c Release --no-restore
dotnet pack .\src\AgriMap.ProjectDevKit.NetCore.Release\AgriMap.ProjectDevKit.NetCore.Release.csproj -c Release -o .\artifacts --no-restore
$agmArtifactsPath = (Resolve-Path .\artifacts).Path
dotnet tool install --global --add-source $agmArtifactsPath --version 1.0.0 --no-cache AgriMap.ProjectDevKit.NetCore.Release
dotnet tool list --global
where.exe agm-release
```

Run one line at a time and stop dependent commands on failure. 1.0.0 is the observed CLI package version, not a release/service version; confirm it from the current source and produced package before installation. On Unix use equivalent paths and command -v, then the absolute shim fallback. Do not use setx PATH. Recheck actual invocation after installation.

Installation of a missing tool does not authorize replacing a working tool with an unverified build. For a requested/necessary compatible update, the source README uses pull --ff-only, restore/test/pack, then uninstall the exact package and reinstall from artifacts. Build and validate the replacement before uninstalling; preserve recovery evidence. Never uninstall an unrelated package. If privilege or private access genuinely prevents installation, report the exact failed step and required access after exhausting available authorized methods.

## Compatibility gate before prepare

Do not equate successful installation with compatibility with release-steps.md. Inspect version-specific source/docs or run an isolated representative fixture when semantics are unknown. Never probe mutating prepare on the live product to discover what it writes. Capture fixture before/after paths and owner versions; this is disposable local verification, not publication.

Observed source at commit 1c06e32e778bc67f47ad40c2012c37b5a925102a:

- ReleaseGovernanceService.Prepare groups all selected environment definitions by candidate version and calls ReleaseDocuments.Plan for each group. ReleaseDocuments.Plan creates notes using that version. Thus inhouse/both can plan Inhouse-numbered notes; this source is incompatible with the new Production-only notes rule for H/full. This proves behavior of that revision, not binary provenance of every installed 1.0.0 package.
- ReleaseDocuments.Validate requires the literal metadata line `- Tag: ` followed by the backtick-wrapped planned v<version> and `(Production only)`. It does not by that line require an actual Git tag. Changing the metadata to not requested can fail schema validation even though prepare correctly performs no tag publication. Inspect complete diagnostics before generalizing.
- The notes command explicitly supports Production only. The existence of that restriction does not prove prepare inhouse/both has the same restriction.

For each selected mode establish: allowed owner writes; notes/index writes; tag metadata schema versus Git tag existence; and resume behavior. A version label alone is insufficient because same-version local builds may differ.

If the CLI writes Inhouse notes, do not run that mode on the target, switch a Production request to both, create dummy Inhouse notes, or delete historical notes to pass. Prefer an already approved compatible tool revision. If the target permits direct file authoring and equivalent checks (including the explicit owner-version fallback below), the Agent may perform H/P with the exact authorized owner/artifact boundaries and report CLI compatibility separately; never claim the incompatible CLI gate passed. If the target mandates that CLI gate, stop only the dependent steps with evidence and a concrete compatible-tool/remediation proposal. Editing/deploying the separate CLI repository needs its own authorization; a service release command does not grant it. Continue any independent authorized indexing/readiness work.

For a Tag metadata error, first inspect the exact line and schema. If schema expects the planned Production tag, fill that truthful planned identity and keep publication status not requested/pending in the checkpoint; do not create a tag. If a validator genuinely requires a real tag during prepare, reproduce that separately as a compatibility defect. Never waive the verify failure, invent a SHA, or rename Inhouse notes to Production without reconstructing correct Production content/provenance.

## Explicit owner version with a PATCH-only CLI

An explicit owner-requested version authorizes scoped direct preparation of the selected owner pair and its permitted release artifacts when the available CLI cannot select that version. This resolves bundled/repository PATCH-only and CLI-only defaults for this request; no separate governance edit or repeated version approval is needed. It does not override higher-priority host restrictions or authorize changes to the separate CLI repository.

Inspect actual supported options first. Never invent --version support, use --expected-version as a setter, run repeated prepare calls to reach a skipped Patch, temporarily falsify the baseline, or mutate the live product as a compatibility probe. If no compatible supported selection exists, perform H/P directly on synchronized develop, setting each authorized pair to its resolved target and reconstructing the permitted artifacts from real source/history. Preserve the pre-edit baseline and run-owned diff.

Run compatible read-only audit/verify gates, then explicitly verify version format, exact requested values, owner-pair equality, allowed diffs, unchanged unselected owners, Production-only notes/index/tag provenance, notes completeness, Git diff checks and resume evidence. If a validator rejects only the proven requested-version/default-PATCH mismatch, report that check as incompatible and replace that specific assertion with the exact baseline-to-requested-target check. Do not label the CLI gate passed or waive unrelated validation failures. Continue the selected flow after equivalent checks pass; all branch, collision and anomaly-check requirements remain in force.

## Evidence required for an automatic repair or blocker

Record command/root, exit code, relevant sanitized output, selected mode, tool/source identity, actual versus required mutations, completed checkpoints and remaining_steps. Repair routine PATH, missing runtime, authorized notes content and run-owned accidental diffs autonomously. A supported blocker is unavailable permission/access, conflicting target authority, divergent history, or a proven incompatible mandatory gate after safe recovery attempts. Human confirmation concerns a meaningful decision or Production publication, never asking them to manufacture technical evidence.
