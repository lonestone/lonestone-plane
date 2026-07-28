# App: admin — Instance Admin Panel

**Path**: `apps/admin/`  
**Framework**: React 19 + React Router v7 + Vite  
**Rendering**: Client-side SPA (SSR: false)  
**Port**: 3001 (internal)  
**Base path**: `/god-mode` (configurable via `VITE_ADMIN_BASE_PATH`)  
**Access**: Instance administrators only

---

## Purpose

The `admin` app is a **configuration panel for the self-hosted Plane instance**. It is not for managing projects or issues — it is for managing the server itself:

- Authentication provider setup (Google OAuth, GitHub, GitLab, Gitea, magic links, email/password)
- Email server configuration (SMTP)
- AI settings (OpenAI keys, etc.)
- Image/file storage settings
- Workspace management (create, list, administrate workspaces from outside)
- General instance settings (name, banner, branding)

---

## Directory Layout

```
apps/admin/
├── app/                         # React Router v7 routes
│   ├── layout.tsx               # Root layout (sign-in gate)
│   ├── page.tsx                 # Sign-in page
│   └── (all)/                   # Routes for authenticated admins
│       └── (dashboard)/         # Dashboard layout with sidebar
│           ├── layout.tsx        # Sidebar + nav
│           ├── general/          # General instance settings
│           ├── workspace/        # Workspace administration
│           │   └── create/       # Create workspace
│           ├── authentication/   # Auth provider config
│           │   ├── github/
│           │   ├── gitlab/
│           │   ├── google/
│           │   └── gitea/
│           ├── ai/               # AI integration settings
│           ├── image/            # Image/storage settings
│           └── email/            # SMTP email settings
├── src/                          # Components and stores
│   └── tests/                    # Admin-specific tests
├── store/
│   ├── root.store.ts
│   ├── instance.store.ts         # Server instance config
│   ├── theme.store.ts
│   ├── user.store.ts             # Current admin user
│   └── workspace.store.ts        # Workspace administration
├── vite.config.ts
└── react-router.config.ts        # SSR: false
```

---

## Routing

```
/                           Sign in (admin credentials)
/(dashboard)/
  /general                  Instance name, logo, branding
  /workspace/               Workspace list
  /workspace/create         Create new workspace
  /authentication/          Auth method overview
  /authentication/github    GitHub OAuth app config
  /authentication/gitlab    GitLab OAuth app config
  /authentication/google    Google OAuth credentials
  /authentication/gitea     Gitea OAuth config
  /ai                       OpenAI / AI provider settings
  /image                    Unsplash API, image storage config
  /email                    SMTP server configuration
```

---

## State Management

Minimal MobX stores — only what admin needs:

| Store | Purpose |
|-------|---------|
| `InstanceStore` | Reads/writes instance-level configuration from API |
| `WorkspaceStore` | Lists and manages workspaces at the server level |
| `UserStore` | The currently signed-in admin user |
| `ThemeStore` | Dark/light mode preference |

---

## API Endpoints Used

The admin app calls `plane.license.urls` (`/api/instances/`) for instance configuration, plus standard workspace/user endpoints from `/api/v1/`.

Instance configuration is stored in the `Instance` model (in `plane/license/`) and controls which features are enabled server-wide.

---

## Authentication

The admin uses the **same session-based auth** as the main app, but access is gated on `is_staff` or admin-level workspace membership. The session cookie for the admin has a **shorter TTL (1 hour)** compared to the main app (7 days), configured via `ADMIN_SESSION_COOKIE_AGE` in Django settings.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Django API URL |
| `VITE_ADMIN_BASE_URL` | `http://localhost:3001` | This app's URL |
| `VITE_ADMIN_BASE_PATH` | `/god-mode` | Base path (must match routing) |
| `VITE_WEB_BASE_URL` | `http://localhost:3000` | Main web app URL |
| `VITE_SPACE_BASE_URL` | `http://localhost:3002` | Space app URL |

---

## Build & Runtime

```bash
# Development
pnpm --filter admin dev

# Production build
pnpm --filter admin build
# Output: apps/admin/build/
```

The admin app is built as **static files** and served by Nginx (same container as `web`). The `web` container's Nginx config serves the admin build at the `/god-mode` path.

`Dockerfile.admin`:
1. `turbo prune --scope=admin --docker`
2. `pnpm install --frozen-lockfile`
3. `turbo build --filter=admin`
4. Runtime: Nginx serving `build/` at `/god-mode`
