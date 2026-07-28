# Plane — Global Architecture Overview

## What is Plane?

Plane is an open-source project management platform (Jira/Linear alternative). This repository is the **Community Edition (CE)** monorepo, managed with **pnpm workspaces + Turborepo**.

---

## Repository Structure

```
plane/
├── apps/
│   ├── api/          # Django REST API (Python 3.12)
│   ├── web/          # Main React frontend
│   ├── space/        # Public project boards (SSR)
│   ├── admin/        # Instance admin panel
│   ├── live/         # Real-time collaboration server (Node.js)
│   └── proxy/        # Caddy reverse proxy
├── packages/
│   ├── ui/           # Base UI component library
│   ├── propel/       # Advanced UI component library (charts, tables)
│   ├── editor/       # TipTap rich-text editor
│   ├── services/     # Axios API client (shared across all frontends)
│   ├── types/        # Shared TypeScript types
│   ├── hooks/        # Shared React hooks
│   ├── i18n/         # i18next translations
│   ├── constants/    # Shared constants & API endpoints
│   ├── utils/        # Utility functions
│   ├── shared-state/ # Shared MobX stores
│   ├── tailwind-config/
│   ├── typescript-config/
│   ├── logger/       # Winston logger (server-side)
│   ├── decorators/   # Express route decorators
│   └── codemods/     # Code transformation scripts
└── deployments/      # Kubernetes, Swarm, AIO configs
```

---

## Applications

### `apps/api` — Django REST API
The **central backend**. All business logic, data persistence, and authentication lives here. Exposes HTTP REST endpoints consumed by all frontend apps.

- **Language**: Python 3.12
- **Framework**: Django + Django REST Framework
- **Task queue**: Celery (broker: RabbitMQ)
- **Database**: PostgreSQL 15
- **Cache**: Redis (Valkey 7.2)
- **Storage**: S3-compatible (MinIO in CE)
- **Processes**: Three separate container roles — API server, background worker, beat scheduler

### `apps/web` — Main Application
The primary user-facing frontend for workspace members.

- **Framework**: React 19 + React Router v7 + Vite (client-side SPA)
- **State**: MobX (observable stores per domain)
- **Port**: 3000
- **Served by**: Nginx (in Docker) → Caddy proxy

### `apps/space` — Public Project Boards
A separate frontend for publicly shared boards and embedded issue views. **Server-side rendered** (SSR via react-router-serve).

- **Framework**: React 19 + React Router v7 + Vite (SSR)
- **Port**: 3002
- **Base path**: `/spaces`
- **Use case**: Anonymous/public access to shared project boards

### `apps/admin` — Instance Admin Panel
Configuration panel for the self-hosted instance (users, auth providers, email, AI, storage).

- **Framework**: React 19 + React Router v7 + Vite (client-side SPA)
- **Port**: 3001
- **Base path**: `/god-mode`
- **Access**: Restricted to instance administrators

### `apps/live` — Real-Time Collaboration Server
Enables collaborative document editing using the **Yjs CRDT** protocol.

- **Framework**: Express.js + HocusPocus 2.15.2
- **Protocol**: WebSocket
- **Port**: 3000 (internal)
- **Base path**: `/live`
- **Sync**: Redis pub/sub for multi-instance coordination

### `apps/proxy` — Reverse Proxy
Routes all public traffic to the appropriate backend service.

- **Technology**: Caddy 2.11.3 (custom build with DNS challenge modules)
- **Role**: Single entry point, TLS termination, request routing, file upload size limiting

---

## Infrastructure Components

| Component | Image | Role |
|-----------|-------|------|
| PostgreSQL | `postgres:15.7-alpine` | Primary relational database |
| Valkey/Redis | `valkey/valkey:7.2.11-alpine` | Cache, sessions, Celery results, HocusPocus pub/sub |
| RabbitMQ | `rabbitmq:3.13.6-management-alpine` | Celery task broker |
| MinIO | `minio/minio` | S3-compatible object storage (avatars, attachments, exports) |

---

## Service Dependency Graph

```
                    ┌─────────────┐
                    │    Proxy    │  :80/:443
                    │   (Caddy)   │
                    └──────┬──────┘
           ┌───────────────┼──────────────────┐
           │               │                  │
     /spaces/*         /live/*          /api/* /auth/*
     /god-mode/*                        /static/*
           │               │                  │
     ┌─────▼─────┐  ┌──────▼──────┐   ┌──────▼──────┐
     │   space   │  │    live     │   │     api     │
     │  :3002    │  │  :3000      │   │    :8000    │
     └─────┬─────┘  └──────┬──────┘   └──────┬──────┘
           │               │                  │
           │        ┌──────▼──────┐    ┌──────▼──────┐
           │        │    Redis    │    │  PostgreSQL  │
           │        │  (pub/sub)  │    │   (data)    │
           │        └─────────────┘    └─────────────┘
           │
     ┌─────▼─────┐
     │    web    │  /* (catch-all)
     │  :3000    │
     └───────────┘

     ┌───────────┐  ┌─────────────┐  ┌─────────────┐
     │  worker   │  │ beat-worker │  │  migrator   │
     │ (celery)  │  │  (celery)   │  │ (one-shot)  │
     └─────┬─────┘  └──────┬──────┘  └─────────────┘
           └───────────────┴──────────────────────────► RabbitMQ
```

---

## Request Flow Examples

### Standard API request (authenticated user)
```
Browser → Proxy (/api/*) → API container (Django) → PostgreSQL
                                                   → Redis (cache)
                                                   → MinIO (files)
```

### Collaborative document editing
```
Browser (TipTap + Y.js) → Proxy (/live/*) → Live server (HocusPocus)
                                                    ├─ Redis (sync across instances)
                                                    └─ API (/api/v1/...) → PostgreSQL
```

### Public board access
```
Anonymous browser → Proxy (/spaces/*) → Space app (SSR) → API (/api/public/*)
```

### File upload
```
Browser → Proxy (with FILE_SIZE_LIMIT check) → API (presign) → MinIO
```

---

## Shared Packages

All JavaScript/TypeScript apps share code via pnpm workspace packages:

| Package | Purpose |
|---------|---------|
| `@plane/ui` | Base component library (buttons, modals, dropdowns…) |
| `@plane/propel` | Advanced components (charts, complex tables, command palette) |
| `@plane/editor` | TipTap rich-text editor with collaboration support |
| `@plane/services` | Axios HTTP client + all API service classes |
| `@plane/types` | TypeScript types for every API entity |
| `@plane/hooks` | Shared React hooks (outside-click, local-storage, platform-os…) |
| `@plane/i18n` | i18next setup + translation files |
| `@plane/constants` | API endpoint paths, enum values, filter config |
| `@plane/utils` | Date/string/color utilities, HTML↔Markdown conversion |
| `@plane/shared-state` | Shared MobX store classes (issues, members, pages…) |
| `@plane/tailwind-config` | Shared Tailwind CSS configuration |
| `@plane/logger` | Winston logger for server-side apps |
| `@plane/decorators` | Express.js controller decorators (used by live) |

---

## Authentication Overview

All three frontends authenticate via the Django API:

1. **Email + password** — standard credential flow
2. **Magic link** — token sent to email, one-time sign-in
3. **OAuth** — Google, GitHub, GitLab, Gitea
4. **API tokens** — long-lived tokens for programmatic access / bots
5. **Sessions** — custom Django session store (device-tracked, 7-day TTL)

The `space` app has its own parallel auth flow for public/anonymous access to shared boards.

---

## Key Design Decisions

- **Monorepo with Turborepo**: Build caching, task orchestration, and dependency graph across all packages and apps.
- **React Router v7 (not Next.js)**: All three frontends migrated from Next.js to React Router v7 + Vite. Compatibility shims (`apps/web/app/compat/next/`) exist for gradual migration.
- **MobX everywhere**: Chosen over Redux/Zustand for its reactive, class-based store pattern which scales well to Plane's complex domain model.
- **HocusPocus + Y.js**: Industry-standard CRDT-based collaboration, same stack as Notion-like tools.
- **Caddy as proxy**: Automatic HTTPS via Let's Encrypt, built-in DNS challenge support, simple Caddyfile syntax.
- **Soft deletes**: Most entities use soft delete (deleted_at / archived_at) with a 60-day hard-delete window via Celery.
