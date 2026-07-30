# Plane — Build & Deploy Process

## Monorepo Toolchain

| Tool      | Version | Role                                 |
| --------- | ------- | ------------------------------------ |
| pnpm      | 9.x     | Package manager + workspace          |
| Turborepo | 2.9.14  | Build orchestration & caching        |
| Vite      | 6.x     | Frontend bundler (web, space, admin) |
| tsdown    | —       | TypeScript bundler (live, packages)  |
| Docker    | —       | Container images for all services    |
| Caddy     | 2.11.3  | Reverse proxy (custom xcaddy build)  |

---

## Workspace Layout

`pnpm-workspace.yaml` declares two workspace sets:

```
packages:
  - "apps/*"   (web, admin, space, live)
  - "packages/*"
```

The `proxy` and `api` apps are **excluded** from the pnpm workspace (they use Caddy and Python respectively).

All JavaScript dependency versions are **pinned in a central catalog** inside `pnpm-workspace.yaml` and referenced with `catalog:` protocol in individual `package.json` files.

---

## Turborepo Task Graph

`turbo.json` defines these tasks:

| Task    | Depends on                         | Cached | Output                              |
| ------- | ---------------------------------- | ------ | ----------------------------------- |
| `build` | `^build` (upstream packages first) | yes    | `dist/`, `build/`, `.react-router/` |
| `dev`   | `^build`                           | no     | — (persistent)                      |
| `check` | —                                  | yes    | — (lint/type check)                 |
| `test`  | —                                  | yes    | coverage reports                    |

Global env vars that bust the Turbo cache (changes trigger rebuild):

```
APP_VERSION, NODE_ENV, LOG_LEVEL
VITE_API_BASE_URL, VITE_WEB_BASE_URL, VITE_SPACE_BASE_URL
VITE_ADMIN_BASE_URL, VITE_LIVE_BASE_URL, VITE_SPACE_BASE_PATH
VITE_ADMIN_BASE_PATH, VITE_LIVE_BASE_PATH
SENTRY_AUTH_TOKEN, NEXT_PUBLIC_SENTRY_*
```

---

## Docker Images

### Pattern: Node.js apps (web, space, admin, live)

All four use a **3-stage Docker build** with Turborepo pruning:

```dockerfile
# Stage 1 — prune: isolate only the files needed for this app
FROM node:22-alpine AS pruner
RUN turbo prune --scope=<app> --docker

# Stage 2 — installer + builder: install deps and build
FROM node:22-alpine AS builder
COPY --from=pruner /out/json .    # package.json files
RUN pnpm install --frozen-lockfile
COPY --from=pruner /out/full .    # source files
RUN turbo build --filter=<app>

# Stage 3 — runner: minimal runtime image
FROM node:22-alpine AS runner
COPY --from=builder <dist or build folder> .
# Remove heavy build tools (esbuild binaries, etc.)
```

This pattern keeps the final image small by excluding dev dependencies and build tools.

#### Per-app details

| App     | Dockerfile         | Build output      | Runtime                  |
| ------- | ------------------ | ----------------- | ------------------------ |
| `web`   | `Dockerfile.web`   | `dist/` (static)  | Nginx                    |
| `space` | `Dockerfile.space` | `build/`          | react-router-serve (SSR) |
| `admin` | `Dockerfile.admin` | `build/` (static) | Nginx                    |
| `live`  | `Dockerfile.live`  | `dist/`           | `node apps/live`         |

**web and admin** are static SPAs — built with Vite, served by Nginx with SPA fallback routing (`404 → /index.html`).

**space** is SSR — `react-router-serve` runs a Node.js HTTP server at port 3002.

**live** compiles TypeScript with `tsdown` into a single Node.js bundle, then runs it directly.

---

### Python API (`apps/api/Dockerfile.api`)

Single-stage build based on `python:3.12-alpine`:

```dockerfile
FROM python:3.12-alpine
WORKDIR /code
COPY requirements/production.txt .
RUN pip install -r production.txt
COPY . .
```

The same image is reused for **four container roles**, differentiated by the entrypoint command:

| Container     | Command                                                                      |
| ------------- | ---------------------------------------------------------------------------- |
| `api`         | `./bin/docker-entrypoint-api.sh` — runs Gunicorn/Uvicorn                     |
| `worker`      | `./bin/docker-entrypoint-worker.sh` — runs Celery worker                     |
| `beat-worker` | `./bin/docker-entrypoint-beat.sh` — runs Celery beat                         |
| `migrator`    | `./bin/docker-entrypoint-migrator.sh` — runs `manage.py migrate`, then exits |

---

### Proxy (`apps/proxy/Dockerfile.ce`)

2-stage build using `xcaddy` to compile a custom Caddy binary:

```dockerfile
# Stage 1 — build custom Caddy with extra modules
FROM caddy:2.11.3-builder AS builder
RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare \
    --with github.com/caddy-dns/digitalocean \
    ...

# Stage 2 — runtime
FROM caddy:2.11.3-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile.ce /etc/caddy/Caddyfile
```

Extra Caddy modules compiled in: Cloudflare DNS, DigitalOcean DNS, go-jose (JWT), OpenTelemetry, gRPC.

---

## Docker Compose Services

### Production (`docker-compose.yml`)

```
proxy          :80, :443   → Caddy (entry point)
web            :3000        → Main SPA (depends on api)
admin          :3001        → Admin panel (depends on api, web)
space          :3002        → Public boards SSR (depends on api, web)
api            :8000        → Django API (depends on plane-db, plane-redis)
worker         —            → Celery worker (same image as api)
beat-worker    —            → Celery beat scheduler (same image as api)
migrator       —            → DB migrations, restart: no
live           :3000        → HocusPocus collaboration server
plane-db       —            → PostgreSQL 15.7 (max_connections=1000)
plane-redis    —            → Valkey 7.2 (Redis-compatible)
plane-mq       —            → RabbitMQ 3.13 (Celery broker)
plane-minio    :9000, :9090 → MinIO object storage
```

**Startup order** (via `depends_on`):

```
plane-db, plane-redis
  → migrator (one-shot)
  → api
    → worker, beat-worker
    → web
      → admin, space
        → proxy (exposes ports)
```

### Local Development (`docker-compose-local.yml`)

- No `web`, `admin`, `space` containers — run these locally with `pnpm dev`
- Uses `Dockerfile.dev` variants which mount source directories as volumes for hot reload
- Exposes infrastructure ports directly:
  - `5432` — PostgreSQL
  - `6379` — Redis
  - `9000/9090` — MinIO
  - `8000` — Django API
- Custom bridge network: `dev_env`

#### Lonestone: MinIO uploads via local proxy overlay

Upstream `docker-compose-local.yml` has **no reverse proxy**. With `USE_MINIO=1`, the API signs upload URLs as `http://localhost:8000/{BUCKET_NAME}` (same host as the API), expecting a proxy to forward that path to MinIO — the same model as production Caddy (`/{BUCKET_NAME}` → `plane-minio:9000`).

Without a proxy, `POST http://localhost:8000/uploads` hits Django and returns **404**.

Lonestone keeps upstream compose untouched and adds an overlay:

| File                                    | Purpose                                             |
| --------------------------------------- | --------------------------------------------------- | ----- | -------------------------------------- |
| `docker-compose.lonestone.yml`          | Puts Caddy on host `:8000`; API stays internal-only |
| `deployments/lonestone/Caddyfile.local` | `/api                                               | /auth | /static`→ API,`/{BUCKET_NAME}` → MinIO |

```bash
# Start local stack with Lonestone MinIO proxy
docker compose -f docker-compose-local.yml -f docker-compose.lonestone.yml up -d
```

Required `apps/api/.env` values when the API runs **in Docker**:

```env
USE_MINIO=1
AWS_S3_ENDPOINT_URL="http://plane-minio:9000"
WEB_URL="http://localhost:8000"
```

Notes:

- Use `http://plane-minio:9000` (Docker DNS), not `http://localhost:9000` — inside the API container, `localhost` is not MinIO.
- Root `.env` already uses the Docker hostname for MinIO; `apps/api/.env` is what `docker-compose-local.yml` loads for api/worker/beat — keep them aligned.
- Do not edit `docker-compose-local.yml` or `apps/proxy/Caddyfile.ce` for this; the overlay avoids upstream merge conflicts.

---

## Proxy Routing (Caddyfile.ce)

All public traffic enters through Caddy on port 80/443. Routes are evaluated in order:

| Path pattern      | Target             | Notes                   |
| ----------------- | ------------------ | ----------------------- |
| `/spaces/*`       | `space:3000`       | Public boards           |
| `/live/*`         | `live:3000`        | WebSocket collaboration |
| `/api/*`          | `api:8000`         | REST API                |
| `/auth/*`         | `api:8000`         | Auth endpoints          |
| `/static/*`       | `api:8000`         | Django static files     |
| `/{BUCKET_NAME}*` | `plane-minio:9000` | Object storage          |
| `/*` (catch-all)  | `web:3000`         | Main SPA                |

**Global Caddy settings:**

- Request body size limit: `FILE_SIZE_LIMIT` env var (default 5 MB)
- Client IP forwarding: `X-Forwarded-For`, `X-Real-IP`
- Trusted proxies: `TRUSTED_PROXIES` env var
- HTTPS: Automatic Let's Encrypt with configurable ACME CA
- Max header size: 25 MB

The **admin panel** (`/god-mode/*`) is served by the `web` container, which handles it internally via client-side routing.

---

## All-in-One (AIO) Setup

`deployments/aio/` provides a single-container setup for demos or very small deployments. The `Caddyfile.aio.ce` serves static files directly from the filesystem instead of proxying to separate containers:

```
/spaces/*   → localhost:3002
/live/*     → localhost:3005
/api/*      → localhost:3004
/god-mode/* → /app/admin (static files)
/*          → /app/web (static files with SPA fallback)
```

---

## Environment Variables

### API container (`.env`)

| Variable                              | Required | Default   | Description                                         |
| ------------------------------------- | -------- | --------- | --------------------------------------------------- |
| `DATABASE_URL`                        | yes\*    | —         | Postgres connection string (or use individual vars) |
| `POSTGRES_DB/HOST/USER/PASSWORD/PORT` | yes\*    | —         | Individual Postgres config                          |
| `REDIS_URL`                           | yes      | —         | Redis connection string                             |
| `AMQP_URL` or `RABBITMQ_*`            | yes      | —         | Celery broker                                       |
| `AWS_ACCESS_KEY_ID`                   | yes      | —         | S3/MinIO access key                                 |
| `AWS_SECRET_ACCESS_KEY`               | yes      | —         | S3/MinIO secret key                                 |
| `AWS_STORAGE_BUCKET_NAME`             | yes      | `uploads` | S3 bucket name                                      |
| `AWS_S3_ENDPOINT_URL`                 | CE       | —         | MinIO endpoint (for CE self-hosted)                 |
| `SECRET_KEY`                          | yes      | —         | Django secret key                                   |
| `WEB_URL`                             | yes      | —         | Frontend origin (for CORS/redirects)                |
| `CORS_ALLOWED_ORIGINS`                | no       | allow all | Comma-separated allowed origins                     |
| `FILE_SIZE_LIMIT`                     | no       | `5242880` | Max upload size in bytes                            |
| `ENABLE_READ_REPLICA`                 | no       | `0`       | Enable PostgreSQL read replica                      |

### Frontend apps (`.env` with `VITE_` prefix)

| Variable               | Description                                   |
| ---------------------- | --------------------------------------------- |
| `VITE_API_BASE_URL`    | Django API URL (e.g. `http://localhost:8000`) |
| `VITE_WEB_BASE_URL`    | Main app URL                                  |
| `VITE_SPACE_BASE_URL`  | Space app URL                                 |
| `VITE_SPACE_BASE_PATH` | Space app base path (default `/spaces`)       |
| `VITE_ADMIN_BASE_URL`  | Admin app URL                                 |
| `VITE_ADMIN_BASE_PATH` | Admin base path (default `/god-mode`)         |
| `VITE_LIVE_BASE_URL`   | Live server URL                               |
| `VITE_LIVE_BASE_PATH`  | Live server base path (default `/live`)       |

### Live server (`.env`)

| Variable                         | Description                              |
| -------------------------------- | ---------------------------------------- |
| `API_BASE_URL`                   | Django API URL for user/document lookups |
| `LIVE_SERVER_SECRET_KEY`         | Secret for JWT signing                   |
| `REDIS_URL` or `REDIS_HOST/PORT` | Redis for pub/sub coordination           |
| `CORS_ALLOWED_ORIGINS`           | Allowed WebSocket origins                |

### Proxy (environment in docker-compose)

| Variable            | Description                       |
| ------------------- | --------------------------------- |
| `FILE_SIZE_LIMIT`   | Max request body (bytes)          |
| `BUCKET_NAME`       | MinIO bucket name for routing     |
| `SITE_ADDRESS`      | Domain (for HTTPS cert)           |
| `CERT_EMAIL`        | ACME/Let's Encrypt email          |
| `TRUSTED_PROXIES`   | Trusted upstream IPs              |
| `LISTEN_HTTP_PORT`  | Host port for HTTP (default 80)   |
| `LISTEN_HTTPS_PORT` | Host port for HTTPS (default 443) |

---

## Volumes

| Volume          | Used by     | Contains                                       |
| --------------- | ----------- | ---------------------------------------------- |
| `pgdata`        | plane-db    | PostgreSQL data files                          |
| `redisdata`     | plane-redis | Redis persistence (RDB/AOF)                    |
| `uploads`       | plane-minio | Uploaded files (avatars, attachments, exports) |
| `rabbitmq_data` | plane-mq    | RabbitMQ queue state                           |

---

## Local Development Workflow

```bash
# 1. Start infrastructure (+ Lonestone MinIO proxy overlay)
docker compose -f docker-compose-local.yml -f docker-compose.lonestone.yml up -d

# 2. Install JS dependencies
pnpm install

# 3. Run all frontend apps in dev mode (hot reload)
pnpm dev

# 4. Run a specific app
pnpm --filter web dev
pnpm --filter space dev

# 5. Build everything
pnpm build

# 6. Type-check + lint
pnpm check
```

For Python/API development, the local compose mounts the `apps/api` directory, so changes are picked up automatically by Gunicorn's auto-reload.

See [Lonestone: MinIO uploads via local proxy overlay](#lonestone-minio-uploads-via-local-proxy-overlay) if file uploads 404 on `/uploads`.
