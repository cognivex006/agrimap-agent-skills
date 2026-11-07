# Security — Docker and CI

`Dockerfile*`, `.dockerignore`, `docker-compose.yml` and Jenkinsfiles of every service and front end (Sonar `docker` rules plus team rules). Class definitions: [security-baseline.md](../security-baseline.md).

## Contents

- [Rows](#rows)
- [Golden Dockerfiles](#golden-dockerfiles)

## Rows

| Class | Key | Do not write | Write it this way | Seen |
| --- | --- | --- | --- | --- |
| SEC-07 | team | `echo "$TOKEN"`, `sh "curl -H 'Authorization: ${TOKEN}'"` (Groovy interpolation) or `set -x` around credentials in a Jenkinsfile or `RUN` | `withCredentials` with single-quoted `sh '...'` so the shell, not Groovy, expands it; no `set -x` near secrets | baseline |
| SEC-24 | S6470 | `COPY . .` without a `.dockerignore` covering secrets and local state | `.dockerignore` with the SEC-24 minimum (`**/.env`, `**/.git`, `**/bin`, `**/obj`, `**/node_modules`, `**/*.ps1`, `**/secrets*.yaml`, ...); prefer named paths | file-management `e32825d`; front ends' `.dockerignore` lack `**/.env` |
| SEC-26 | S6471 | Runtime stage without `USER`, or `USER root` as the last switch | `useradd -m appuser`, `chown` written paths, `USER appuser` last; FE uses `nginxinc/nginx-unprivileged` | dynamic-dashboard `b7f1b87`, identity `1eee1c3`, file-management `e32825d` |
| SEC-27 | S6472 | `ARG NPM_TOKEN` / `ENV TOKEN=` (visible in image history) | `RUN --mount=type=secret,id=npmrc,target=/app/.npmrc npm ci` | pro-ng `Dockerfile_Production` (`ARG NPM_TOKEN`, `.npmrc.docker` copied then removed in a later layer) |
| SEC-27 | S6505 | `npm i` / `npm install` in the build | `npm ci --ignore-scripts` (allow-list packages whose scripts must run) | pro-ng (`npm i --legacy-peer-deps`) |
| SEC-27 | team | `COPY certs /etc/nginx/certs` of private keys into the image | Mount keys at runtime from the platform's secret store; public CA certificates may be copied | pro-ng (review what `certs/` holds) |
| — | S6596 | `FROM image:latest` or no tag | Pinned tag (and digest for production) | Jenkins agent `dotnet-sonar:latest8` (CI image) |
| — | S6500 | `apt-get install` without `--no-install-recommends`; caches kept | `--no-install-recommends` and `rm -rf /var/lib/apt/lists/*` in the same `RUN` | catalog |
| — | S7031 | Several consecutive `RUN` lines that belong together | One `RUN` with `&&` | catalog |
| — | team | `ENTRYPOINT [... "--urls", "http://0.0.0.0:5000"]` hard-coded | `ENV ASPNETCORE_URLS=http://0.0.0.0:5000` overridable per environment | the three services moved it to `ENV` |
| SEC-28 | S6418 | Credentials in `docker-compose.yml`, Jenkinsfile `environment {}` or `sed` into `nuget.config` printed in logs | Jenkins `withCredentials`; never `echo` the value; templates filled at build time and deleted in the same step | identity `3abfd35` (nuget template, `withCredentials`, correct) |
| — | team | CI container with `-u root --privileged` | Least privilege; `--privileged` only with a written reason | identity Jenkinsfile Sonar stage |

## Golden Dockerfiles

```dockerfile
# .NET service runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=publish /app/publish .
RUN useradd -m appuser && mkdir -p /FilesLocalStorage && chown -R appuser:appuser /app /FilesLocalStorage
USER appuser
ENV ASPNETCORE_URLS=http://0.0.0.0:5000
EXPOSE 5000
ENTRYPOINT ["dotnet", "AgriMap.Web.Service.dll"]
```

```dockerfile
# Angular build with a private registry token, no token in layers
# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npmrc,target=/app/.npmrc npm ci --ignore-scripts --legacy-peer-deps
COPY angular.json tsconfig*.json ./
COPY src ./src
COPY public ./public
RUN npx ng build --configuration=production

FROM nginxinc/nginx-unprivileged:1.26-alpine
COPY nginx/production/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/<app>/browser /usr/share/nginx/html
EXPOSE 8080
```

Changing the build is a deployment change: keep the Jenkinsfile arguments in step (`--secret id=npmrc,src=...` replaces `--build-arg NPM_TOKEN`), and say in the summary which environments were built.
