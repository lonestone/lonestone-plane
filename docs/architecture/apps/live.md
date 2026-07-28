# App: live — Real-Time Collaboration Server

**Path**: `apps/live/`  
**Runtime**: Node.js 22  
**Framework**: Express.js + HocusPocus 2.15.2 (Y.js-based CRDT server)  
**Protocol**: WebSocket (via `express-ws`)  
**Port**: 3000 (internal)  
**Base path**: `/live` (configurable via `LIVE_BASE_PATH`)  
**Caddy route**: `/live/*` → `live:3000`

---

## Purpose

The `live` server enables **collaborative document editing** on Pages. Multiple users can edit the same page simultaneously, with changes merged in real-time using the [Y.js CRDT](https://yjs.dev/) data structure. The TipTap editor in the frontend connects to this server via WebSocket.

---

## Directory Layout

```
apps/live/
├── src/
│   ├── server.ts                  # Express app setup
│   ├── hocuspocus.ts              # HocusPocus server manager (singleton)
│   ├── redis.ts                   # Redis client (singleton)
│   ├── extensions/
│   │   ├── database.ts            # Fetch/store documents from/to API
│   │   ├── redis.ts               # Multi-server pub/sub coordination
│   │   ├── title-sync.ts          # Real-time page title sync
│   │   └── force-close.ts         # Admin force-disconnect users
│   ├── lib/
│   │   └── auth.ts                # Connection authentication
│   └── controllers/
│       ├── collaboration.controller.ts  # WebSocket /collaboration endpoint
│       ├── document.controller.ts       # POST /convert-document
│       ├── pdf-export.controller.ts     # PDF generation
│       └── health.controller.ts         # GET /health
├── package.json
├── tsconfig.json
├── tsdown.config.ts               # TypeScript bundler config
├── Dockerfile.live
└── Dockerfile.dev
```

---

## Architecture

### HocusPocus

[HocusPocus](https://tiptap.dev/hocuspocus) is the server-side Y.js synchronisation layer. It:
- Manages Y.js document state for each open page
- Broadcasts changes between all connected clients
- Calls extensions at each lifecycle event (connect, load, change, save, disconnect)

The HocusPocus server is a **singleton** instantiated in `hocuspocus.ts`. It is configured with a **10-second debounce** before writing changes back to the database (to avoid flooding the API on every keystroke).

**Server name**: Hostname or UUID — used to identify this instance when multiple live servers run behind a load balancer.

### Extension Pipeline

Extensions execute in order for each lifecycle event:

```
1. Logger          — Audit log of connections/disconnections
2. Database        — Load from API on open; save to API on change
3. Redis           — Multi-server synchronisation via pub/sub
4. TitleSync       — Propagate title changes in real-time
5. ForceClose      — Handle admin disconnect commands
```

### Database Extension (`extensions/database.ts`)

On document **load**:
1. Calls `GET /api/v1/pages/{id}/` to fetch `description_binary` (Y.js binary)
2. If no binary exists, fetches `description_html` and converts it to Y.js format (legacy migration path)
3. If the API returns 413 (content too large), broadcasts an error to all clients and closes the connection

On document **change** (debounced 10s):
1. Exports the Y.js document as binary, HTML, and JSON
2. Calls `PATCH /api/v1/pages/{id}/` with all three formats

### Redis Extension (`extensions/redis.ts`)

Extends HocusPocus's built-in Redis extension. Adds:
- **Admin channel** (`hocuspocus:admin`): Receives server-level commands
- **Admin commands**: `FORCE_CLOSE`, `HEALTH_CHECK`, `RESTART_DOCUMENT`
- All messages are broadcast to **all live server instances** simultaneously (wildcard pub/sub)

### Authentication (`lib/auth.ts`)

Called on every new WebSocket connection:
1. Reads the session cookie from the WebSocket handshake
2. POSTs to Django API to validate the session and retrieve user details
3. Enriches the HocusPocus connection context with: `userId`, `workspaceSlug`, `projectId`, `documentType`
4. Rejects the connection if validation fails

The `LIVE_SERVER_SECRET_KEY` is used to sign JWT tokens for internal API-to-API communication.

### Force Close (`extensions/force-close.ts`)

Subscribes to Redis for document-specific channels (`hocuspocus:{docId}`). When a `force_close` command arrives:
1. Sends a `force_close` WebSocket message to all clients viewing that document
2. Includes a `reason` code so the client can display an appropriate message
3. Disconnects the clients gracefully

---

## HTTP Controllers

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/collaboration/` | WebSocket | Main collaboration endpoint; delegates to HocusPocus |
| `/convert-document` | POST | Converts HTML to Y.js binary or JSON (for migrations) |
| `/export-pdf` | POST | Generates a PDF from a page |
| `/health` | GET | Returns server health status |

---

## Redis

`redis.ts` provides a **singleton ioredis client** with:
- Connection via `REDIS_URL` or `REDIS_HOST:REDIS_PORT`
- Exponential backoff reconnection
- Offline queue enabled (messages buffered while reconnecting)
- Event handlers for: connect, ready, error, close, reconnecting

---

## Multi-Server Coordination

When multiple live server instances run behind a load balancer, they coordinate via Redis:

```
Live Server A (user 1)          Live Server B (user 2)
     │                                  │
     │ ── Y.js update ──────────────►  │
     │      (Redis pub/sub channel)     │
     │                                  │
     │ ◄── admin force_close ───────── │
     │    (hocuspocus:admin channel)    │
```

This ensures any server can handle any document and changes propagate to all viewers regardless of which server they're connected to.

---

## Document Types

The `documentType` context field (passed as a WebSocket query param) identifies what kind of entity is being edited. Currently used for Pages (`description_binary` field). The same infrastructure could be extended to issue descriptions.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_BASE_URL` | yes | — | Django API URL for user validation and document fetch/save |
| `LIVE_SERVER_SECRET_KEY` | yes | — | JWT signing secret for API authentication |
| `REDIS_URL` | yes* | — | Redis connection string |
| `REDIS_HOST` | yes* | — | Redis hostname (alternative to URL) |
| `REDIS_PORT` | no | `6379` | Redis port |
| `PORT` | no | `3000` | HTTP/WebSocket server port |
| `LIVE_BASE_PATH` | no | `/live` | URL base path |
| `CORS_ALLOWED_ORIGINS` | no | — | Comma-separated allowed origins |
| `COMPRESSION_LEVEL` | no | `6` | gzip compression level |
| `COMPRESSION_THRESHOLD` | no | `5000` | Minimum response size to compress (bytes) |
| `APP_VERSION` | no | — | Reported in health endpoint |

*One of `REDIS_URL` or `REDIS_HOST` is required.

---

## Build

```bash
# Development (hot reload with tsdown --watch)
pnpm --filter live dev

# Production build
pnpm --filter live build
# Output: apps/live/dist/

# Run tests
pnpm --filter live test
```

**Build tool**: `tsdown` (fast TypeScript bundler, similar to esbuild). Produces a single Node.js entry point at `dist/`.

`Dockerfile.live`:
1. `turbo prune --scope=live --docker`
2. `pnpm install --frozen-lockfile`
3. `turbo build --filter=live` (runs tsdown)
4. Runtime: `node apps/live` — starts the Express + HocusPocus server
5. Build tools (`esbuild` binaries) are removed from the final image to reduce size
