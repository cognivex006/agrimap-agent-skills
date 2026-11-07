# Security — nginx

`nginx/<env>/nginx.conf` of the `agmwa-*` front ends (served by `nginxinc/nginx-unprivileged`). Sonar has no nginx analyzer: these are SEC-19/SEC-30 rules checked by review and by Golden Lint later. Header ownership: confirm whether the gateway already sets a header before adding it here (SEC-19). Class definitions: [security-baseline.md](../security-baseline.md).

## Contents

- [Rows](#rows)
- [Golden server block](#golden-server-block)

## Rows

| Class | Do not write | Write it this way | Seen in current configs |
| --- | --- | --- | --- |
| SEC-31 | `real_ip_header X-Forwarded-For;` without `set_real_ip_from`, or `set_real_ip_from 0.0.0.0/0` | `set_real_ip_from` only the load balancer CIDRs, `real_ip_recursive on`; never trust the header from other sources | baseline |
| SEC-30 | `add_header` in `server` and again in a `location`: the `location` drops every `server` header | Put the full header set in one `include` file and include it in `server` and in every `location` that adds a header | pro-ng/platform-ng/suite-ng repeat the set by hand in each `location` (correct, but drifts) |
| SEC-19/30 | Security headers without `always` (missing on 4xx/5xx) | `add_header ... always;` on every security header | HSTS and `X-Content-Type-Options` lack `always` |
| SEC-19 | HSTS without `includeSubDomains` or set on plain HTTP | `Strict-Transport-Security "max-age=31536000; includeSubDomains" always` at the TLS owner only | HSTS without `includeSubDomains` |
| SEC-19 | Only `frame-ancestors` in CSP | Full CSP agreed with the app (`default-src 'self'`; script/style/img/connect for ArcGIS and APIs); start with `Content-Security-Policy-Report-Only` | CSP is `frame-ancestors 'self'` only |
| SEC-19 | No `Referrer-Policy`, `Permissions-Policy` | `Referrer-Policy "strict-origin-when-cross-origin"`, `Permissions-Policy "geolocation=(self), camera=(), microphone=()"` (geolocation kept for maps) | missing |
| SEC-19 | Deprecated `X-XSS-Protection: 1`; `Pragma public` | Drop them; `Cache-Control` alone | `Pragma public` in static locations |
| SEC-30 | Version banner | `server_tokens off;` | missing |
| SEC-30 | `autoindex on`; dotfiles served | `autoindex off` (default); `location ~ /\. { deny all; }` | not denied |
| SEC-30/SEC-04 | `location /a { alias /b/; }` (trailing slashes differ: `/a../` escapes) | Matching slashes `location /a/ { alias /b/; }`, or `^~` prefix; regex `alias` with a capture restricted to safe characters | pro-ng regex `alias .../$1` (prefix-anchored, review) |
| SEC-19 | `index.html` cached long | `Cache-Control "no-cache"` for `index.html`; long cache only for hashed assets | static rules cache `*.js`/`*.css` for 30 days (fine for hashed names) |
| SEC-13 | `add_header Access-Control-Allow-Origin *` in a front-end server | No CORS headers on the static site; the API owns CORS | none (good) |
| SEC-06 | Default error pages exposing version | `server_tokens off`; custom `error_page` for 5xx | default |
| — | `client_max_body_size` unlimited on a proxy location | Limit to the backend's upload limit | n/a (static only) |

## Golden server block

```nginx
# nginx/<env>/security-headers.conf (included everywhere a location adds headers)
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(self), camera=(), microphone=()" always;
add_header Content-Security-Policy "frame-ancestors 'self';" always;   # widen only with the agreed full policy
# HSTS here only if this server terminates TLS; otherwise the gateway owns it
# add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

```nginx
server {
    listen 8080;
    server_tokens off;
    root /usr/share/nginx/html;
    include /etc/nginx/conf.d/security-headers.conf;

    location ~ /\. { deny all; }

    location = /index.html {
        include /etc/nginx/conf.d/security-headers.conf;
        add_header Cache-Control "no-cache" always;
    }

    location ~* \.(?:js|css|woff2?|ttf|svg|png|jpe?g|gif|ico)$ {
        include /etc/nginx/conf.d/security-headers.conf;
        add_header Cache-Control "public, max-age=2592000, immutable" always;
        access_log off;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Keep the app's base-href locations (`/agrimap-pro-wa/`, `/agrimap-platform-wa/assets/`) and environment differences; copy the Dockerfile `COPY` for the new include file. A header change is a deployment change: list it in the summary and verify with `curl -I` on each environment.
