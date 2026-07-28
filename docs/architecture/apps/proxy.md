# App: proxy — Reverse Proxy

**Path**: `apps/proxy/`  
**Technology**: Caddy 2.11.3 (custom `xcaddy` build)  
**Role**: Single public entry point — TLS termination, routing, file upload limits  
**Exposed ports**: `80` (HTTP) and `443` (HTTPS)

---

## Purpose

The proxy is the **only service with public-facing ports**. All browser traffic enters here and is routed to the appropriate internal service based on the URL path. It also handles:

- HTTPS with automatic Let's Encrypt certificates
- Large request body rejection (configurable file upload limit)
- Client IP forwarding to backend services
- MinIO object storage access (proxied through the same domain)

---

## Files

```
apps/proxy/
├── Caddyfile.ce          # Community Edition routing config
├── Caddyfile.aio.ce      # All-in-One (single-container) routing config
└── Dockerfile.ce         # Custom Caddy build
```

---

## Routing Rules (Caddyfile.ce)

Routes are evaluated **in order, first match wins**:

| Path Pattern | Target | Notes |
|-------------|--------|-------|
| `/spaces/*` | `http://space:3002` | Public project boards (SSR) |
| `/live/*` | `http://live:3000` | WebSocket collaboration (upgraded to WS) |
| `/api/*` | `http://api:8000` | Django REST API |
| `/auth/*` | `http://api:8000` | Django authentication endpoints |
| `/static/*` | `http://api:8000` | Django static files |
| `/{BUCKET_NAME}*` | `http://plane-minio:9000` | MinIO object storage |
| `/*` (catch-all) | `http://web:3000` | Main SPA (served by Nginx) |

> **Note**: The admin panel (`/god-mode`) is served by the `web` container's Nginx, not as a separate proxy rule. The web container handles `/god-mode` → admin build files internally.

### WebSocket handling for `/live/*`

Caddy automatically upgrades HTTP connections to WebSocket when the backend responds with `101 Switching Protocols`. No special Caddy configuration is needed — the upstream `live` service handles the upgrade.

---

## Global Caddy Configuration

```caddyfile
{
    servers {
        max_header_size 25mb
        client_ip_headers X-Forwarded-For X-Real-IP
        trusted_proxies static {$TRUSTED_PROXIES:0.0.0.0/0}
    }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| Max header size | 25 MB | Prevents header-based DoS |
| Client IP headers | X-Forwarded-For, X-Real-IP | Passes real client IP to backends |
| Trusted proxies | `0.0.0.0/0` | Trust all by default; set to specific ranges in production |
| Request body limit | `FILE_SIZE_LIMIT` env var | Applied to all routes |

---

## HTTPS / TLS

Caddy handles TLS automatically:

- **Domain**: Set via `SITE_ADDRESS` environment variable
- **Certificate email**: Set via `CERT_EMAIL` environment variable
- **ACME CA**: Configurable (default: Let's Encrypt production)
- **DNS challenge**: Supported via built-in Cloudflare and DigitalOcean modules (useful when HTTP challenge is blocked)

For local/HTTP-only deployment, set `SITE_ADDRESS=http://yourdomain` to disable HTTPS.

---

## Custom Caddy Build (Dockerfile.ce)

The standard Caddy image doesn't include all needed modules, so a custom binary is compiled with `xcaddy`:

```dockerfile
FROM caddy:2.11.3-builder AS builder
RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare \
    --with github.com/caddy-dns/digitalocean \
    --with github.com/greenpau/caddy-security \
    --with github.com/dunglas/caddy-cbrotli \
    ...

FROM caddy:2.11.3-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile.ce /etc/caddy/Caddyfile
```

**Extra modules compiled in**:
- `caddy-dns/cloudflare` — DNS-01 challenge via Cloudflare
- `caddy-dns/digitalocean` — DNS-01 challenge via DigitalOcean
- `go-jose` — JWT handling
- OpenTelemetry — Distributed tracing
- gRPC — gRPC proxying support
- `caddy-cbrotli` — Brotli compression

---

## All-in-One Routing (Caddyfile.aio.ce)

Used for the single-container `deployments/aio/` setup. Instead of proxying to separate containers, it routes to localhost ports or serves static files directly:

| Path | Target |
|------|--------|
| `/spaces/*` | `localhost:3002` (space SSR process) |
| `/live/*` | `localhost:3005` (live server process) |
| `/api/*`, `/auth/*` | `localhost:3004` (Django via Gunicorn) |
| `/god-mode/*` | `/app/admin` (static files, SPA fallback) |
| `/*` | `/app/web` (static files, SPA fallback) |

Static file serving uses SPA fallback: any 404 returns `index.html` so React Router handles client-side navigation.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FILE_SIZE_LIMIT` | `5242880` (5 MB) | Maximum request body size in bytes |
| `BUCKET_NAME` | `uploads` | MinIO bucket name (used in routing rule) |
| `SITE_ADDRESS` | — | Public domain or `localhost` |
| `CERT_EMAIL` | — | Email for Let's Encrypt registration |
| `TRUSTED_PROXIES` | `0.0.0.0/0` | Trusted proxy CIDR ranges |
| `LISTEN_HTTP_PORT` | `80` | Host port for HTTP |
| `LISTEN_HTTPS_PORT` | `443` | Host port for HTTPS |

These are passed via `docker-compose.yml` environment block.

---

## Docker Compose Integration

```yaml
proxy:
  container_name: proxy
  build:
    context: ./apps/proxy
    dockerfile: Dockerfile.ce
  restart: always
  ports:
    - ${LISTEN_HTTP_PORT}:80
    - ${LISTEN_HTTPS_PORT}:443
  environment:
    FILE_SIZE_LIMIT: ${FILE_SIZE_LIMIT:-5242880}
    BUCKET_NAME: ${AWS_S3_BUCKET_NAME:-uploads}
  depends_on:
    - web
    - api
    - space
    - admin
```

The `proxy` service is the **last to start** and depends on all frontend services being ready.
