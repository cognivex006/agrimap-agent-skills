# AgriMap Service URL Matrix

Authoritative BE/FE reference for reaching AgriMap .NET services and jobs: the gateway base per environment, each service's gateway key, its Kubernetes Service and namespace, and the health and port rules. Select an exact `service`, `environment` and caller (`browser` or `pod`). `—` means no route: report it instead of guessing. Never build a host by generic string concatenation when this matrix has the value. Application (FE) URLs and callbacks stay in [application-url-matrix.md](application-url-matrix.md).

This file deliberately holds no database endpoints, IP addresses, credentials or connection strings. Read those only from the project's own configuration and secret store at run time; never copy them into skills, memory, prompts or reports.

Systems in delivery scope (owner 2026-11-18): agmwa-license-management-ng, agmws-license-management-netcore, agmbo-license-status-netcore, agmbo-cleansing-service-netcore, agmbo-cleansing-file-netcore, agmws-plus-netcore, agmws-query-engine-netcore. Verified 2026-09-29 against the gateway `ocelot.<environment>.json` routes, the FE environment files, the service Jenkinsfiles and the infra Kubernetes base.

## Environments

| `ASPNETCORE_ENVIRONMENT` | Browser → gateway base | Gateway → service | Hosting |
| --- | --- | --- | --- |
| `Development` | `https://appserv2.cdg.co.th/agmws-gateway` | `https://appserv2.cdg.co.th/<key>/api/` | Local FE/gateway run against the Inhouse services |
| `Inhouse` | `https://appserv2.cdg.co.th/agmws-gateway` | `https://appserv2.cdg.co.th/<key>/api/` | appserv2 |
| `K8s.dev` | `https://agrimap-api.cdg.co.th/gw` | `http://<svc>.<namespace>.svc.cluster.local/<key>/api/` | Kubernetes; images `lab-atlasx-registry.cdg.co.th/agrimap/inhouse/<name>` |
| `Staging` | unknown (no verified public gateway) | `http://<svc>.<namespace>.svc.cluster.local/<key>/api/` | Kubernetes; images `atlasx-registry.cdg.co.th/agrimap/staging/<name>` |
| `Production` | `https://agrimap-api.ldd.go.th/gw` | `http://<svc>.<namespace>.svc.cluster.local/<key>/api/` | Kubernetes; images `atlasx-registry.cdg.co.th/agrimap/production/<name>` |

`<key>` is the service's `ASPNETCORE_BASEPATH` without the leading slash; `<name>` is the repository name with underscores (`agmws_identity_netcore`). The gateway itself uses base path `/gw` on Kubernetes and `/agmws-gateway` on appserv2.

## Tiers

| Tier | Namespace | Members | Service port → container |
| --- | --- | --- | --- |
| Web | `agrimap-web` | `agmwa-*-ng` | 80 → 8080 (Nginx) |
| API gateway | `agrimap-api-gateway-bff` | `agmws-gateway-netcore` (Ocelot) | 80 → 5000 |
| API | `agrimap-api` | `agmws-*` services and proxies | 80 → 5000 (HTTPS 5001) |
| Job | `agrimap-job` | `agmbo-*` | 80 → 5000 |

Kubernetes Service name is `<app>-svc`, type `ClusterIP`; Pod-to-Pod DNS is `<app>-svc.<namespace>.svc.cluster.local`.

## Services

| Service (repository) | Gateway key | Kubernetes Service (namespace) | Notes |
| --- | --- | --- | --- |
| `agmws-gateway-netcore` | — (is the gateway) | `agmws-gateway-netcore-svc` (`agrimap-api-gateway-bff`) | Ocelot routes per environment file |
| `agmws-ckan-netcore` | `agmws-ckan` | `agmws-ckan-netcore-svc` (`agrimap-api`) | K8s.dev forwards to `/agmws-ckan/debug/`, other environments to `/agmws-ckan/api/` |
| `agmws-data-management-netcore` | `agmws-data-management` | `agmws-data-management-netcore-svc` (`agrimap-api`) | Extra route `api/content-manage/contents` |
| `agmws-dynamic-dashboard-netcore` | `agmws-dynamic-dashboard` | `agmws-dynamic-dashboard-netcore-svc` (`agrimap-api`) | |
| `agmws-dynamic-form-netcore` | `agmws-dynamic-form` | `agmws-dynamic-form-netcore-svc` (`agrimap-api`) | |
| `agmws-file-management-netcore` | `agmws-file-management` | `agmws-file-management-netcore-svc` (`agrimap-api`) | Extra routes `api/static/`, `api/file/upload`, `api/file/upload-internal`; shared ReadWriteMany volume |
| `agmws-identity-netcore` | `agmws-identity` | `agmws-identity-netcore-svc` (`agrimap-api`) | Extra routes `static/`, `swagger/`, `api/oauth/session/`, `oauth/form/`, `auth/external/`; K8s.dev/Production FE login entry is `<gateway base>/oauth/login` |
| `agmws-initialize-netcore` | `agmws-initialize` | `agmws-initialize-netcore-svc` (`agrimap-api`) | |
| `agmws-interfaces-netcore` | `agmws-interfaces` | `agmws-interfaces-netcore-svc` (`agrimap-api`) | |
| `agmws-layer-management-netcore` | `agmws-layer-management` | `agmws-layer-management-netcore-svc` (`agrimap-api`) | |
| `agmws-license-management-netcore` | `agmws-license-management` | `agmws-license-management-netcore-svc` (`agrimap-api`) | No Staging route |
| `agmws-notification-netcore` | `agmws-notification` | `agmws-notification-netcore-svc` (`agrimap-api`) | |
| `agmws-pdpa-netcore` | `agmws-pdpa` | `agmws-pdpa-netcore-svc` (`agrimap-api`) | |
| `agmws-plus-netcore` | `agmws-plus` | `agmws-plus-netcore-svc` (`agrimap-api`) | |
| `agmws-pro-netcore` | `agmws-pro` | `agmws-pro-netcore-svc` (`agrimap-api`) | |
| `agmws-query-engine-netcore` | `agmws-query-engine` | `agmws-query-engine-netcore-svc` (`agrimap-api`) | |
| `agmws-telerik-report-netcore` | `agmws-telerik-report` | `agmws-telerik-report-netcore-svc` (`agrimap-api`) | |
| `agmws-user-management-netcore` | `agmws-user-management` | `agmws-user-management-netcore-svc` (`agrimap-api`) | |

### Proxies (one codebase `agmws-proxy-netcore`, several deployments)

Each proxy exposes `<key>/arcgis-proxy` and `<key>/api/`.

| Deployment | Gateway key | Kubernetes Service (namespace) | Used by |
| --- | --- | --- | --- |
| `agmws-proxy` | `agmws-proxy` | `agmws-proxy-svc` (`agrimap-api`) | Pod-to-Pod |
| `agmws-platform-proxy` | `agmws-platform-proxy` | `agmws-platform-proxy-svc` (`agrimap-api`) | agrimap-platform (Inhouse FE calls `https://appserv2.cdg.co.th/agmws-platform-proxy/arcgis-proxy` directly) |
| `agmws-pro-proxy` | `agmws-pro-proxy` | `agmws-pro-proxy-svc` (`agrimap-api`) | agrimap-pro |
| `agmws-executive-proxy` | `agmws-executive-proxy` | `agmws-executive-proxy-svc` (`agrimap-api`) | agrimap-ex |
| `agmws-ii-online-proxy` | `agmws-ii-online-proxy` | `agmws-ii-online-proxy-svc` (`agrimap-api`) | agrimap-online |
| `agmws-plus-proxy` | — (no gateway route) | `agmws-plus-proxy-svc` (`agrimap-api`) | Kubernetes only |

### Jobs (no gateway route)

Jobs run outside the request path and call APIs Pod-to-Pod.

| Job (repository) | Kubernetes Service (namespace) | Notes |
| --- | --- | --- |
| `agmbo-geoprocessing-netcore` | `agmbo-geoprocessing-netcore-svc` (`agrimap-job`) | |
| `agmbo-publisher-netcore` | `agmbo-publisher-netcore-svc` (`agrimap-job`) | |
| `agmbo-license-status-netcore` | `agmbo-license-status-netcore-svc` (`agrimap-job`) | License status job for agmws-license-management; name follows the convention, verify its manifest |
| `agmbo-cleansing-service-netcore` | `agmbo-cleansing-service-netcore-svc` (`agrimap-job`) | Name follows the convention; no Kubernetes base manifest yet |
| `agmbo-cleansing-file-netcore` | `agmbo-cleansing-file-netcore-svc` (`agrimap-job`) | Name follows the convention; no Kubernetes base manifest yet |

## Decision rules

- Browser and external callers go through the gateway only: `<gateway base>/<key>/<path>`, which Ocelot forwards to `<key>/api/<path>`. Do not publish a service host to the browser; the Inhouse platform proxy entry above is an existing exception, not a pattern.
- Pod-to-Pod calls on K8s.dev/Staging/Production use `http://<svc>.<namespace>.svc.cluster.local/<key>/api/<path>`; on Inhouse they use `https://appserv2.cdg.co.th/<key>/api/<path>`. Read the base URL from environment configuration (`{NAME}_URL`, appsettings or ConfigMap), never hard-code it.
- Every service and job exposes `/health` at the container root, before `UsePathBase`, `AllowAnonymous`, returning HTTP 200. Probes: liveness 30 s / 10 s and readiness 10 s / 5 s on port 5000; web uses `/` on 8080. Jobs also run Kestrel on 5000 for the probe.
- `ASPNETCORE_ENVIRONMENT` selects `ocelot.<environment>.json` and appsettings; `ASPNETCORE_URLS` is `http://+:5000;https://+:5001`. Every Kubernetes resource carries `app.kubernetes.io/managed-by: agrimap-deployment`.
- A new service or job needs, in the same change set: gateway routes in every `ocelot.<environment>.json` (API only), Kubernetes base manifests with probes and label, FE environment entries when the browser calls it, and a row in this matrix.
- An environment without a route, or a caller not listed here, is unsupported: report it with this matrix as evidence instead of substituting another environment or service.

## Known gaps (2026-09-29)

- `agmws-license-management`: no route in `ocelot.Staging.json`; no Kubernetes base manifest in infra.
- `agmbo-cleansing-service-netcore`, `agmbo-cleansing-file-netcore`: Jenkins publishes Inhouse/Staging/Production images, but infra has no Kubernetes base manifest yet.
- `agmws-plus-proxy`: Kubernetes manifest exists, no gateway route.
- Staging: no verified public gateway URL; the FE staging environment files still point to local or Inhouse hosts.
- The infra deploy README's job table lists `agmws-*-svc.agrimap-api` for jobs; the manifests use `agmbo-*-netcore-svc.agrimap-job`. The golden `030-13-container-communication-rule.txt` is historical evidence of the call flow only; use this matrix for names and URLs.
