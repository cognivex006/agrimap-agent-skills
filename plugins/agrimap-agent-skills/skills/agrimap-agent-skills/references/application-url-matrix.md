# AgriMap Application URL Matrix

This is the authoritative FE/BE decision reference for domain concatenation, redirects, and callbacks. Service and job URLs (gateway, Pod-to-Pod, health) are in [service-url-matrix.md](service-url-matrix.md). Select an exact `application`, `mode`, `environment`, and `url_kind`. `—` means unsupported or unused; stop explicitly instead of falling back. Never synthesize a URL by generic string concatenation when this matrix contains an exact value.

## Application URL

| Application | Mode | Development | Inhouse | K8s.Dev | Production |
| --- | --- | --- | --- | --- | --- |
| **agrimap-platform** | Library | `http://localhost:4200` | — | — | — |
| **agrimap-platform** | Application | `http://localhost:4201/agrimap-platform-wa` | `https://appserv2.cdg.co.th/agrimap-platform-wa` | `https://agrimap-platform.cdg.co.th` | `https://agrimap-platform.ldd.go.th` |
| **agrimap-online** | Default | `http://localhost:4202/agrimap-suite-wa` | `https://appserv2.cdg.co.th/agrimap-suite-wa` | `https://agrimap-online.cdg.co.th` | `https://agrimap-online.ldd.go.th` |
| **agrimap-online** | Normal | `http://localhost:4202/agrimap-suite-wa/ii-online` | `https://appserv2.cdg.co.th/agrimap-suite-wa/ii-online` | `https://agrimap-online.cdg.co.th` | `https://agrimap-online.ldd.go.th` |
| **agrimap-ex** | Default | `http://localhost:4202/agrimap-suite-wa` | `https://appserv2.cdg.co.th/agrimap-suite-wa` | `https://agrimap-ex.cdg.co.th` | `https://agrimap-ex.ldd.go.th` |
| **agrimap-ex** | Normal | `http://localhost:4202/agrimap-suite-wa/executive` | `https://appserv2.cdg.co.th/agrimap-suite-wa/executive` | `https://agrimap-ex.cdg.co.th` | `https://agrimap-ex.ldd.go.th` |
| **agrimap-pro** | Application | `http://localhost:4203/agrimap-pro-wa` | `https://appserv2.cdg.co.th/agrimap-pro-wa` | `https://agrimap-pro.cdg.co.th` | `https://agrimap-pro.ldd.go.th` |
| **agrimap-license-management** | Application | `http://localhost:4201/agrimap-license-management-wa` | `https://appserv2.cdg.co.th/agrimap-license-management-wa` | — | `https://agrimap-platform.ldd.go.th/agrimap-license-management-wa` |

## Callback URL

| Application | Mode | Development | Inhouse | K8s.Dev | Production |
| --- | --- | --- | --- | --- | --- |
| **agrimap-platform** | Library | `http://localhost:4200/callback` | — | — | — |
| **agrimap-platform** | Application | `http://localhost:4201/agrimap-platform-wa/callback` | `https://appserv2.cdg.co.th/agrimap-platform-wa/callback` | `https://agrimap-platform.cdg.co.th/callback` | `https://agrimap-platform.ldd.go.th/callback` |
| **agrimap-online** | Default | `http://localhost:4202/agrimap-suite-wa/callback` | `https://appserv2.cdg.co.th/agrimap-suite-wa/callback` | `https://agrimap-online.cdg.co.th/callback` | `https://agrimap-online.ldd.go.th/callback` |
| **agrimap-online** | Normal | `http://localhost:4202/agrimap-suite-wa/callback` | `https://appserv2.cdg.co.th/agrimap-suite-wa/callback` | `https://agrimap-online.cdg.co.th/callback` | `https://agrimap-online.ldd.go.th/callback` |
| **agrimap-ex** | Default | `http://localhost:4202/agrimap-suite-wa/callback` | `https://appserv2.cdg.co.th/agrimap-suite-wa/callback` | `https://agrimap-ex.cdg.co.th/callback` | `https://agrimap-ex.ldd.go.th/callback` |
| **agrimap-ex** | Normal | `http://localhost:4202/agrimap-suite-wa/callback` | `https://appserv2.cdg.co.th/agrimap-suite-wa/callback` | `https://agrimap-ex.cdg.co.th/callback` | `https://agrimap-ex.ldd.go.th/callback` |
| **agrimap-pro** | Application | `http://localhost:4203/agrimap-pro-wa/callback` | `https://appserv2.cdg.co.th/agrimap-pro-wa/callback` | `https://agrimap-pro.cdg.co.th/callback` | `https://agrimap-pro.ldd.go.th/callback` |
| **agrimap-license-management** | Application | `http://localhost:4201/agrimap-license-management-wa/callback` | `https://appserv2.cdg.co.th/agrimap-license-management-wa/callback` | — | `https://agrimap-platform.ldd.go.th/agrimap-license-management-wa/callback` |

## Decision rules

- `agrimap-online` and `agrimap-ex` share one Development/Inhouse application and separate screens by path.
- `Default` uses the `agrimap-suite-wa` root.
- `Normal` uses `/ii-online` for online and `/executive` for ex only in Development/Inhouse.
- K8s.Dev and Production use separate domains, so `Normal` adds no application path.
- `Default` and `Normal` share the callback URL inside the same application.
- `agrimap-license-management` (repository `agmwa-license-management-ng`, base href `/agrimap-license-management-wa/`) keeps its path in every environment: Production lives under the platform domain, not its own domain. Development shares port 4201 with platform (`npm run start:agrimap:<env>`). K8s.Dev is unverified: report it, never guess. Its API is `agmws-license-management` and its job `agmbo-license-status-netcore` (service-url-matrix.md).
- Unsupported combinations return an explicit unsupported result; never substitute another environment or application.
- Load this reference conditionally for FE/BE analysis, design, diagnosis, review, simulation, planning, QA, prompt authoring, and execution when URL/domain/redirect/callback logic is in scope.
