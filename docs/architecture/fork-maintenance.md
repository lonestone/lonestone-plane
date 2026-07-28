# Fork Maintenance Guide

This document describes how to maintain a long-lived fork of Plane CE, build your own Docker images, and add features in a way that minimises merge conflicts when pulling upstream updates.

---

## How Plane is Designed to be Extended

Before discussing strategy, it helps to understand how the Plane core team itself layers the pro edition on top of the CE codebase. The architecture has a deliberate extension seam you can exploit.

### The `@/plane-web` alias (frontend)

`apps/web/tsconfig.json` defines:

```json
"paths": {
  "@/*":          ["./core/*"],
  "@/plane-web/*": ["./ce/*"]
}
```

The `core/` directory imports from `@/plane-web/` at **330 callsites** for anything that should be overridable between editions. In CE builds, that alias resolves to `./ce/`. In the (private) pro builds, it resolves to `./ee/` (or similar). The `ce/` folder itself has 280 TypeScript files, most of which are thin wrappers or extensions of the base implementations.

**This is the designed extension point.** The `ce/` folder is the CE edition layer. You create your own edition layer next to it and change one line in tsconfig.

### The backend — no equivalent seam

The Django API does **not** have a matching `ce/`/`ee/` folder split. EE features are added as additional Django apps installed via `INSTALLED_APPS`. The `license/` app manages the `Instance` model and an `InstanceEdition` enum (`PLANE_COMMUNITY`), which suggests that EE checks gate features at the API level by reading `instance.edition`. There are no feature flag helpers in the CE codebase — that logic lives in the private EE app.

---

## Repository Strategy

### Remote setup

Your fork should track two remotes:

```bash
git remote add origin git@github.com:<your-org>/plane.git   # your fork
git remote add upstream git@github.com:makeplane/plane.git  # official CE
```

### Branching model

```
upstream/preview   (official CE — read-only tracking)
    │
    ▼ (merge periodically)
your-org/preview   (your integration branch — never force-pushed)
    │
    ├── feature/my-feature-a
    ├── feature/my-feature-b
    └── release/YYYY-MM-DD      (cut releases from here)
```

- **Never rebase `preview` onto upstream** once you have your own commits — this rewrites history and makes future merges painful. Always `git merge upstream/preview`.
- Track upstream's `preview` branch, not `master`. The CE team releases from `preview`.

### Pulling upstream updates

```bash
git fetch upstream
git checkout preview
git merge upstream/preview        # resolve conflicts, then commit
```

This is the core loop. How painful it is depends entirely on where you put your code (see below).

---

## Building Your Own Docker Images

### Option 1 — Build from your fork directly

The simplest approach: your CI clones your fork, runs the existing Dockerfiles, and pushes to your own registry.

```yaml
# .github/workflows/build.yml (example)
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build API
        uses: docker/build-push-action@v6
        with:
          context: ./apps/api
          file: ./apps/api/Dockerfile.api
          push: true
          tags: ghcr.io/<your-org>/plane-api:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build Web
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ./apps/web/Dockerfile.web
          push: true
          tags: ghcr.io/<your-org>/plane-web:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            VITE_API_BASE_URL=https://your-api.example.com
            ...
```

Repeat for `space`, `admin`, `live`, and `proxy`. Build args for Vite frontend variables must be passed at **build time** (they are baked in).

### Option 2 — Separate your customisation Dockerfile layer

Instead of modifying the official Dockerfiles, extend them:

```dockerfile
# apps/web/Dockerfile.ours (new file, never conflicts with upstream)
FROM ghcr.io/<your-org>/plane-web-base:latest AS base
# patch in your additional static assets, configs, etc.
COPY our-assets/ /usr/share/nginx/html/our-assets/
```

This only works for additive changes. For anything that requires a different build (new dependencies, new env vars), you must either modify the upstream Dockerfiles or maintain your own copies.

### Tagging strategy

| Tag | Meaning |
|-----|---------|
| `latest` | Latest release on your fork |
| `YYYY-MM-DD` | Dated release |
| `<git-sha>` | Exact build (for rollbacks) |
| `upstream-<upstream-sha>` | Records which upstream commit this was built from |

Storing the upstream commit in the tag makes it easy to answer "are we more than N weeks behind upstream?"

### Build args that must be resolved at build time

The frontend Vite apps bake environment variables into the bundle at build time. You must supply these during `docker build`:

```
VITE_API_BASE_URL
VITE_WEB_BASE_URL
VITE_SPACE_BASE_URL  / VITE_SPACE_BASE_PATH
VITE_ADMIN_BASE_URL  / VITE_ADMIN_BASE_PATH
VITE_LIVE_BASE_URL   / VITE_LIVE_BASE_PATH
```

If you run the app behind a sub-path or separate domain, you need a separate image build per environment (or use runtime injection via nginx `sub_filter` — messy). Plan your URL structure carefully before building.

---

## How to Add Features Without Causing Merge Conflicts

### Golden rule

**Put your code in your edition layer, not in `core/` or `ce/`.**

The `core/` and `ce/` directories will change with every upstream update. If you touch them, you will have conflicts. Instead:

1. Create your own edition folder, e.g. `apps/web/oe/` ("our edition")
2. Change the tsconfig alias to point at it
3. Build your features there, extending `core/` classes

```json
// apps/web/tsconfig.json — change one line
"@/plane-web/*": ["./oe/*"]   // was: ["./ce/*"]
```

Your `oe/` folder starts as a copy of `ce/`, and you extend from there. Since `tsconfig.json` itself changes rarely (it's a critical infrastructure file), this one-line change is easy to manage on merges.

### Tier your changes by conflict risk

| Tier | Where | Conflict risk | Examples |
|------|-------|--------------|---------|
| **Safe** | `oe/` (your edition layer) | Near-zero | New stores, new components, new hooks, feature overrides |
| **Moderate** | `packages/` (shared packages) | Low–medium | New shared types, new service methods |
| **Risky** | `core/` | High | Changes to shared layout, root store constructor |
| **Very risky** | `ce/` | Medium–high | Overrides that upstream also changes |
| **Extremely risky** | `apps/api/plane/db/models/` | High | New model fields, new models |
| **Nuclear** | `pnpm-lock.yaml` | Always conflicts | Every upstream update touches this |

### Frontend: adding a new feature

**New store** — create `oe/store/my-feature.store.ts`, extend `CoreRootStore` in `oe/store/root.store.ts`:
```ts
// oe/store/root.store.ts
import { CoreRootStore } from "@/store/root.store";
import { MyFeatureStore } from "./my-feature.store";

export class RootStore extends CoreRootStore {
  myFeature: MyFeatureStore;
  constructor() {
    super();
    this.myFeature = new MyFeatureStore(this);
  }
}
```

**New component** — create in `oe/components/my-feature/`, import from `@/plane-web/components/my-feature` in `core/`. Add the `core/` reference only when you need to inject into an existing UI slot. Otherwise build standalone pages.

**New route** — add route files in `apps/web/app/`. React Router picks them up automatically. No core changes needed.

**Override a CE component** — if `core/` imports `@/plane-web/components/cycles` and you want to extend the cycle list, create `oe/components/cycles/` with your version. `core/` keeps importing from the alias; it now resolves to yours.

### Backend: adding a new feature

The Django API has no clean `ce/`/`ee/` split, so you need a different strategy:

**New Django app (recommended)** — create `apps/api/plane/my_feature/` as a standalone Django app:
```python
# apps/api/plane/my_feature/apps.py
class MyFeatureConfig(AppConfig):
    name = "plane.my_feature"
```

Register it in `settings/common.py`:
```python
INSTALLED_APPS = [
    ...
    "plane.my_feature",   # your addition
]
```

Add URLs in `plane/urls.py`:
```python
path("api/v1/my-feature/", include("plane.my_feature.urls")),
```

All models, views, serializers, tasks, and URLs stay inside your app. The only files you touch in the existing structure are `settings/common.py` (1 line) and `plane/urls.py` (1 line). Both are stable files that rarely conflict.

**New fields on existing models** — this is the danger zone (see below).

---

## The Hard Problems

### 1. Django migrations

This is the **hardest problem** in fork maintenance.

Every upstream release adds new migration files in `apps/api/plane/db/migrations/`. There are already 122. When upstream adds migration `0122_xxx.py` and you have also added your own `0122_my_feature.py`, the numbers collide.

**Strategy A: namespaced migrations in your own app (recommended)**

Keep all your model additions in your own Django app (`plane.my_feature`). Its migrations are in `apps/api/plane/my_feature/migrations/` and never conflict with `plane.db.migrations`. Your models FK into upstream models freely (Django supports cross-app FK). This only fails if you need to add a field to an existing upstream model.

**Strategy B: dependency-based migration ordering**

If you must add to `plane.db`, use Django's `dependencies` list in your migrations:

```python
class Migration(migrations.Migration):
    dependencies = [
        # Always depend on the latest upstream migration you know about
        ("db", "0121_alter_estimate_type"),
        # Plus your previous migration if any
        ("db", "0121_our_custom_field"),
    ]
```

On each upstream merge, audit whether new upstream migrations have a higher number than your last dependency, and update accordingly. This is manual but workable.

**Strategy C: a separate "our additions" migration sequence**

Give your migrations in `plane.db` a custom prefix (e.g. `9000_`, `9001_`) so they never numerically collide with upstream's sequential numbers. This relies on convention but is simple and visible.

**The squash trap**: Do not squash your migrations. If you squash and upstream hasn't squashed, replaying history becomes complex.

**Practical rule**: On every upstream merge, immediately run:
```bash
python manage.py migrate --check
python manage.py showmigrations
```
And resolve any ordering issues before doing anything else.

### 2. `pnpm-lock.yaml` conflicts

At 559 KB, this file conflicts on nearly every upstream merge. You cannot meaningfully resolve it manually.

**Recommended resolution:**
```bash
git checkout --theirs pnpm-lock.yaml   # take upstream's lockfile
pnpm install                            # re-add your packages on top
git add pnpm-lock.yaml
```

This works because pnpm is deterministic: `pnpm install` with your `package.json` additions will regenerate a correct lockfile on top of upstream's resolution. You lose your lock on your custom packages (they'll be re-resolved to latest), which is acceptable if you pin versions in `package.json`.

For packages in the pnpm **catalog** (`pnpm-workspace.yaml`), upstream regularly updates the catalog. If you add entries, they'll be in the catalog section — easy to merge.

### 3. The `ce/` folder

Upstream changes `ce/` regularly — it's the CE edition implementation, not a stable API. If you base your work in `ce/`, you'll fight upstream on every merge.

The `oe/`-folder approach (above) avoids this entirely because you never touch `ce/`.

However, when upstream changes something in `ce/` that you have **copied** into `oe/`, you won't get the conflict warning — you'll silently miss the upstream fix. To catch this:

```bash
# After each upstream merge, diff ce/ against your oe/ to see what changed
git diff upstream/preview HEAD -- apps/web/ce/ > /tmp/ce-changes.diff
# Review the diff and apply relevant fixes to your oe/
```

Automate this in CI as a review step.

### 4. Upstream `core/` changes that break your extensions

When upstream refactors a `core/` component that you override in `oe/`, your override may silently become stale (wrong props, missing required context). TypeScript catches most of this, but not all (especially runtime store cross-references).

**Mitigation**: TypeScript strict mode + full type check as a CI gate:
```bash
pnpm check:types   # must pass on every merge
```

Make sure your `oe/` files import and extend typed interfaces, not concrete classes, where possible.

### 5. Vite build args baked at build time

If upstream adds a new `VITE_*` variable in a new feature, your builds will miss it until you add it to your CI. Track `apps/web/.env.example` changes on every upstream merge.

### 6. Turbo cache invalidation

If upstream changes `turbo.json` (especially the `globalEnv` list), your Turbo remote cache may be invalidated unexpectedly. Always check `turbo.json` diffs on merge.

---

## Recommended Upstream Merge Procedure

Automate this as much as possible. Run it weekly or with each upstream release.

```bash
#!/usr/bin/env bash
# scripts/upstream-merge.sh

set -e

echo "=== 1. Fetch upstream ==="
git fetch upstream

echo "=== 2. Merge into preview ==="
git checkout preview
git merge upstream/preview --no-edit

echo "=== 3. Check for migration conflicts ==="
python apps/api/manage.py showmigrations 2>&1 | grep "\[ \]"  # any unapplied?
python apps/api/manage.py migrate --check

echo "=== 4. Resolve lockfile ==="
git checkout --theirs pnpm-lock.yaml 2>/dev/null || true
pnpm install

echo "=== 5. Type check ==="
pnpm check:types

echo "=== 6. Diff ce/ vs oe/ for missed upstream changes ==="
git diff upstream/preview HEAD -- apps/web/ce/ --stat

echo "=== 7. Build test ==="
pnpm build

echo "=== Done. Review conflicts manually, then commit. ==="
```

---

## Docker Image Versioning for Your Fork

Tag every image with **both** your release version and the upstream commit it was built from:

```
ghcr.io/your-org/plane-api:2024-06-01-a1b2c3d   (your release date + upstream sha short)
ghcr.io/your-org/plane-api:latest
```

Store a `UPSTREAM_SHA` build arg in every image:

```dockerfile
ARG UPSTREAM_SHA=unknown
LABEL org.opencontainers.image.base.digest=$UPSTREAM_SHA
```

This makes it trivial to answer "how far are we behind upstream?" by comparing the embedded SHA to the current upstream HEAD.

---

## What the Pro Edition Probably Does

Based on the architecture:

- **Frontend**: `tsconfig.json` points `@/plane-web/*` to `./ee/` instead of `./ce/`. The EE edition folder extends CE stores and overrides CE components exactly like CE overrides core.
- **Backend**: One or more private Django apps (e.g. `plane.ee`) registered in a separate `settings/ee.py` settings file. These apps add new models, new API endpoints, and override instance behavior by checking `instance.edition`. The `InstanceEdition` enum in CE has only `PLANE_COMMUNITY` — EE adds more values.
- **License gating**: The `InstanceConfiguration` model (key/value pairs in DB, editable via admin panel) is likely used to store feature flags that the EE app reads. The `get_configuration_value()` helper in `license/utils/instance_value.py` is already the right abstraction to use.
- **Migrations**: EE models live in `plane.ee.migrations/`, not in `plane.db.migrations/`. This is the only clean way to avoid collision.

You can follow the same pattern for your own additions.

---

## Summary: The Minimal-Conflict Setup

| Layer | What you do |
|-------|------------|
| `apps/web/oe/` | Your edition layer (copy of `ce/` + your additions) |
| `apps/web/tsconfig.json` | Change `ce` → `oe` in the `@/plane-web` alias |
| `apps/api/plane/our_app/` | Your Django app (models, views, urls, tasks) |
| `apps/api/plane/settings/common.py` | Add `plane.our_app` to INSTALLED_APPS (+1 line) |
| `apps/api/plane/urls.py` | Add your URL prefix (+1 line) |
| `apps/web/app/` | New React Router route files (no conflicts) |
| `packages/` | New shared packages if needed |

Files you **never touch**:
- `apps/web/core/` — upstream only
- `apps/web/ce/` — upstream only (read it, diff it, but don't edit it)
- `apps/api/plane/db/models/` — upstream only (add new models in your own app)
- `apps/api/plane/db/migrations/` — upstream only
