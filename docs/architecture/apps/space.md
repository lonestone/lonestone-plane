# App: space — Public Project Boards

**Path**: `apps/space/`  
**Framework**: React 19 + React Router v7 + Vite  
**Rendering**: **Server-Side Rendered (SSR)** via `react-router-serve`  
**Port**: 3002 (internal)  
**Base path**: `/spaces` (configurable via `VITE_SPACE_BASE_PATH`)  
**Caddy route**: `/spaces/*` → `space:3002`

---

## Purpose

The `space` app provides **publicly accessible project boards** for anonymous users or external stakeholders. It allows workspace admins to share a project's issues publicly without requiring sign-in.

Key differences from `apps/web`:
- **SSR enabled** — initial HTML is rendered server-side for SEO and faster first load
- **Simplified feature set** — read-only boards, no full project management
- **Separate auth flow** — parallel sign-in for public space access
- **Uses `@plane/services`** — no local service layer

---

## Directory Layout

```
apps/space/
├── app/                   # React Router v7 routes (SSR)
├── components/            # Space-specific components
│   ├── account/           # Sign in for space users
│   ├── common/
│   ├── editor/            # Read-only rich text display
│   ├── instance/
│   ├── issues/            # Issue list, board, detail
│   ├── ui/
│   └── views/
├── store/                 # MobX stores (simplified)
│   ├── root.store.ts
│   ├── cycle.store.ts
│   ├── instance.store.ts
│   ├── issue.store.ts
│   ├── issue-detail.store.ts
│   ├── issue-filters.store.ts
│   ├── label.store.ts
│   ├── members.store.ts
│   ├── module.store.ts
│   ├── profile.store.ts
│   ├── state.store.ts
│   ├── user.store.ts
│   ├── helpers/
│   │   ├── base-issues.store.ts
│   │   └── filter.helpers.ts
│   └── publish/
│       ├── publish.store.ts      # Published board config
│       └── publish_list.store.ts
├── hooks/
├── helpers/
├── lib/
├── providers/             # React context providers
├── styles/
├── utils/
├── public/
└── react-router.config.ts # SSR: true
```

---

## Routing

```
/                              Landing / root
/[workspaceSlug]/[projectId]/  Public project board
/issues/[anchor]/              Publicly shared single issue
```

The `anchor` is a unique deploy token generated when a project is made public.

---

## State Management

The store structure is a **subset** of `apps/web`'s stores, containing only what's needed for read-only public boards:

| Store | Purpose |
|-------|---------|
| `IssueStore` | List of issues on the board |
| `IssueDetailStore` | Single issue view |
| `IssueFiltersStore` | Filter/grouping state |
| `StateStore` | Issue workflow states |
| `LabelStore` | Issue labels |
| `MembersStore` | Project members (for assignee display) |
| `CycleStore` | Cycles (for filtering) |
| `ModuleStore` | Modules (for filtering) |
| `UserStore` | Currently signed-in space user |
| `ProfileStore` | User profile |
| `InstanceStore` | Instance configuration |
| `PublishStore` | Published board settings (anchor, permissions) |
| `PublishListStore` | List of published boards |

---

## API Endpoints Used

The space app calls the public API namespace:

```
/api/public/   → plane.space.urls
```

These endpoints allow anonymous or lightly-authenticated access to:
- Published board configuration
- Issue list + detail
- States, labels, members (read-only)

---

## Authentication

A **parallel auth flow** exists in the Django API for space users (`/auth/spaces/sign-in/`, `/auth/spaces/sign-up/`). This creates a separate session context from the main workspace session.

Anonymous access is possible for fully public boards (no sign-in required). The board's visibility is controlled by the `DeployBoard` / `Intake` configuration in the API.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Django API URL |
| `VITE_WEB_BASE_URL` | `http://localhost:3000` | Main web app URL |
| `VITE_SPACE_BASE_URL` | `http://localhost:3002` | This app's URL |
| `VITE_SPACE_BASE_PATH` | `/spaces` | Base path (must match Caddy routing) |

---

## Build & Runtime

```bash
# Development
pnpm --filter space dev

# Production build
pnpm --filter space build
# Output: apps/space/build/
```

**Runtime**: `react-router-serve` runs a Node.js server that handles SSR requests. Unlike `web` and `admin` (which are static files served by Nginx), `space` requires a live Node.js process.

`Dockerfile.space`:
1. `turbo prune --scope=space --docker`
2. `pnpm install --frozen-lockfile`
3. `turbo build --filter=space`
4. Runtime: `react-router-serve build/server/index.js`
