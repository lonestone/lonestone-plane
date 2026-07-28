# App: web — Main Frontend Application

**Path**: `apps/web/`  
**Framework**: React 19 + React Router v7 + Vite  
**Rendering**: Client-side SPA (SSR: false)  
**Port**: 3000 (internal), served via Nginx in Docker  
**Base path**: `/` (catch-all in Caddy)

---

## Tech Stack

| Library | Purpose |
|---------|---------|
| React 19 | UI framework |
| React Router v7 | File-based routing (replaces Next.js) |
| Vite | Build tool |
| MobX + mobx-react | State management |
| SWR | Data fetching / cache |
| Axios (`@plane/services`) | HTTP client |
| TipTap + Y.js | Rich text editor with collaboration |
| Atlaskit drag-and-drop | Drag-and-drop (issues, boards) |
| Recharts | Charts (analytics, burndown) |
| React Hook Form | Form management |
| TanStack Table | Data tables |
| i18next | Internationalisation |

---

## Directory Layout

```
apps/web/
├── app/                     # React Router v7 app directory
│   ├── compat/next/         # Next.js compatibility shims
│   │   ├── link.tsx         # <Link> wrapper
│   │   ├── navigation.ts    # useRouter, usePathname, useSearchParams
│   │   └── script.tsx       # <Script> wrapper
│   └── [route files]        # File-based routes
├── core/                    # Main application code
│   ├── components/          # Feature components (~60 domains)
│   ├── store/               # MobX stores
│   │   └── root.store.ts    # Store aggregator
│   ├── services/            # API service wrappers
│   ├── hooks/               # App-specific hooks
│   ├── helpers/             # Helper functions
│   └── lib/                 # Third-party setup
├── ce/                      # Community Edition overrides
│   └── store/               # CE-specific store variants
├── styles/                  # Global CSS
├── public/                  # Static assets
├── vite.config.ts
├── react-router.config.ts   # SSR: false, appDirectory: "app"
└── postcss.config.js
```

> **Note on `compat/next/`**: The app was migrated from Next.js to React Router v7. These shims allow shared components that still use `next/link`, `next/navigation` to work without mass refactoring.

---

## Routing

File-based routing in `/app` directory using React Router v7 conventions:
- `layout.tsx` — shared layout wrapper
- `page.tsx` — route component
- `[param]` — dynamic segment
- `(group)` — layout group (no URL segment)

### Route Map

```
/                                        Sign in
/sign-up                                 Registration
/accounts/forgot-password
/accounts/reset-password
/accounts/set-password

/[workspaceSlug]/                        Workspace home
/[workspaceSlug]/projects/               Project list
/[workspaceSlug]/projects/[projectId]/
  /issues/                               Issues list
  /issues/[issueId]/                     Issue detail
  /cycles/                               Cycles list
  /cycles/[cycleId]/                     Cycle detail
  /modules/                              Modules list
  /modules/[moduleId]/                   Module detail
  /views/                                Views list
  /views/[viewId]/                       View detail
  /pages/                                Pages list
  /pages/[pageId]/                       Page detail
  /intake/                               Intake queue
/[workspaceSlug]/analytics/[tabId]/      Analytics
/[workspaceSlug]/active-cycles/          Active cycles dashboard
/[workspaceSlug]/drafts/                 Draft issues
/[workspaceSlug]/workspace-views/        Workspace-level views
/[workspaceSlug]/stickies/               Sticky notes
/[workspaceSlug]/notifications/          Notification centre
/[workspaceSlug]/settings/               Workspace settings
  /members/
  /billing/
  /exports/
  /webhooks/
  /projects/[projectId]/                 Project settings
/settings/profile/                       User profile
```

Total: ~60 route files.

---

## State Management (MobX)

All state is managed via MobX observable classes, aggregated in a `RootStore`.

### Root Store (`core/store/root.store.ts`)

The `RootStore` instantiates and cross-links all domain stores. Provided via React context so any component can access it via a `useStores()` hook.

Uses `enableStaticRendering(true)` to prevent memory leaks in SSR contexts (even though this app is CSR, the pattern is kept for package compatibility).

### Store Domains

| Store | File(s) | Responsibility |
|-------|---------|---------------|
| `WorkspaceStore` | `workspace/` | Workspace list, current workspace |
| `ProjectStore` | `project/` | Project list, CRUD |
| `MemberStore` | `member/` | Workspace & project members |
| `IssueStore` | `issue/` | Issue CRUD, pagination |
| `IssueDetailStore` | `issue/issue-details/` | Single issue detail + activity |
| `CycleStore` | `cycle/` | Cycles, cycle issues |
| `ModuleStore` | `module/` | Modules, module issues |
| `LabelStore` | `label.store.ts` | Labels (workspace + project) |
| `StateStore` | `state.store.ts` | Issue workflow states |
| `EstimateStore` | `estimates/` | Estimation schemes |
| `InboxStore` | `inbox/` | Intake queue items |
| `PageStore` | `pages/` (in shared-state) | Pages/documents |
| `AnalyticsStore` | `analytics.store.ts` | Analytics data |
| `DashboardStore` | `dashboard.store.ts` | Home dashboard data |
| `FavoriteStore` | `favorite.store.ts` | User favourites |
| `GlobalViewStore` | `global-view.store.ts` | Workspace-level saved views |
| `ProjectViewStore` | `project-view.store.ts` | Project-level saved views |
| `TimelineStore` | `timeline/` | Gantt chart data |
| `StickyStore` | `sticky/` | Sticky notes |
| `RouterStore` | `router.store.ts` | Current route params |
| `ThemeStore` | `theme.store.ts` | Dark/light theme |
| `InstanceStore` | `instance.store.ts` | Server instance config |
| `CommandPaletteStore` | `command-palette.store.ts` | Command palette state |
| `PowerKStore` | `power-k.store.ts` | Power-K command system |
| `MultipleSelectStore` | `multiple_select.store.ts` | Multi-selection state |

**CE-specific stores** in `ce/store/` override or extend the base stores with community-edition-specific logic (feature flags, analytics, etc.).

---

## Services Layer (`core/services/`)

All API communication goes through service classes (Axios-based, from `@plane/services`). Services are instantiated once and used by stores.

Key services:
- `api.service.ts` — Base Axios instance with interceptors
- `auth.service.ts` — Sign in/up, OAuth
- `workspace.service.ts` — Workspace CRUD
- `project.service.ts` — Project CRUD
- `issue.service.ts` — Issue CRUD + bulk operations
- `cycle.service.ts` — Cycle CRUD + issue association
- `module.service.ts` — Module CRUD
- `estimate.service.ts` — Estimate schemes
- `analytics.service.ts` — Workspace/project analytics
- `dashboard.service.ts` — Home dashboard widgets
- `file.service.ts` / `file-upload.service.ts` — File uploads
- `live.service.ts` — Live collaboration endpoints
- `ai.service.ts` — AI features
- `indexedDB.service.ts` — Local cache (offline support)
- `view.service.ts`, `webhook.service.ts`, `user.service.ts`, etc.

---

## Components (`core/components/`)

Organised by domain. ~60 feature areas:

| Domain | Key components |
|--------|---------------|
| `issues/` | List view, Board view, Table view, Gantt view, spreadsheet view, issue detail modal |
| `cycles/` | Cycle list, cycle detail, cycle board, burndown chart |
| `modules/` | Module list, module detail, module board |
| `pages/` | Page list, page editor (TipTap), page sidebar |
| `inbox/` | Intake queue, triage view |
| `analytics/` | Workspace analytics, project analytics, charts |
| `gantt-chart/` | Gantt/timeline view for issues, cycles, modules |
| `editor/` | TipTap wrapper components |
| `global/` | App header, workspace sidebar |
| `sidebar/` | Navigation sidebar |
| `dropdowns/` | Issue priority, state, assignee, label dropdowns |
| `auth-screens/` | Sign in, sign up, OAuth flows |
| `settings/` | Workspace/project settings forms |
| `power-k/` | Command palette (Cmd+K) |
| `stickies/` | Sticky note cards |
| `workspace-notifications/` | Notification centre |
| `views/` | View creation and listing |

---

## Environment Variables

All prefixed with `VITE_` (Vite convention, baked in at build time):

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Django API base URL |
| `VITE_WEB_BASE_URL` | `http://localhost:3000` | This app's URL |
| `VITE_ADMIN_BASE_URL` | `http://localhost:3001` | Admin panel URL |
| `VITE_ADMIN_BASE_PATH` | `/god-mode` | Admin app base path |
| `VITE_SPACE_BASE_URL` | `http://localhost:3002` | Space app URL |
| `VITE_SPACE_BASE_PATH` | `/spaces` | Space app base path |
| `VITE_LIVE_BASE_URL` | `http://localhost:3100` | Live server URL |
| `VITE_LIVE_BASE_PATH` | `/live` | Live server base path |

---

## Build

```bash
# Development (hot reload)
pnpm --filter web dev

# Production build
pnpm --filter web build
# Output: apps/web/dist/

# Type check + lint
pnpm --filter web check
```

The production build produces static files served by Nginx inside Docker. The Nginx config uses SPA fallback routing: all 404s return `index.html` so React Router handles navigation client-side.

---

## Docker

`Dockerfile.web` uses the 3-stage Turborepo pattern:
1. **pruner** — `turbo prune --scope=web --docker`
2. **builder** — `pnpm install` + `turbo build --filter=web`
3. **runner** — Nginx serving `dist/`

The `admin` app's `/god-mode` base path is handled by the `web` Nginx config (it serves the admin's build output at that path).
