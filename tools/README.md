# Fork maintenance tooling

Scripts for the two recurring operations on this fork: publishing Docker images, and pulling in upstream Plane.

| File                   | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `release-lonestone.sh` | Build and push the six Docker images                 |
| `sync-upstream.sh`     | Merge `makeplane/plane` into this fork               |
| `release.env.example`  | Template for per-machine configuration               |
| `.gitignore`           | Keeps the local `release.env` out of version control |

## Why this lives in `tools/`

Upstream Plane uses no `tools/` directory, so every file here is a path upstream will never touch — these scripts cannot cause a merge conflict.

`scripts/` would have been the conventional home, but it is gitignored at `.gitignore:112`, which would have left the tooling unversioned and absent from a fresh clone.

For the same reason, `release.env` is ignored via `tools/.gitignore` rather than an entry in the root `.gitignore`: the root file is upstream-tracked and would have become a recurring conflict point.

---

## Setup

Copy the template and fill in your own values:

```bash
cp tools/release.env.example tools/release.env
```

`tools/release.env` is gitignored, so nothing machine-specific reaches the repository. Environment variables take precedence over the file.

| Variable            | Required | Meaning                                             |
| ------------------- | -------- | --------------------------------------------------- |
| `PLANE_REGISTRY_NS` | **yes**  | Docker Hub namespace to push to                     |
| `PLANE_FORK_SUFFIX` | no       | Fork identifier in the tag, defaults to `lonestone` |

`PLANE_REGISTRY_NS` has no default on purpose: the release script refuses to run without it, so nobody can accidentally publish to another developer's namespace.

---

## `release-lonestone.sh`

Builds and pushes `<namespace>/plane-{web,admin,space,live,backend,proxy}`.

```bash
./tools/release-lonestone.sh 1                # build + push iteration 1
./tools/release-lonestone.sh 2 --dry-run      # print every command, execute nothing
./tools/release-lonestone.sh 2 --no-push      # build locally only
./tools/release-lonestone.sh 1 --force        # overwrite an already published tag
./tools/release-lonestone.sh --help
```

Start with `--dry-run` after any config change — it shows the exact `docker build` invocations, including which namespace and build args resolved.

### Tag convention

```
v<upstream version>-<fork suffix>.<iteration>
```

The upstream version is **read from the root `package.json`** — never passed by hand. That is the same file the backend reads at startup to register `current_version` in the database (`apps/api/plane/license/management/commands/register_instance.py`), so the image tag and the version the running app reports cannot drift apart.

The iteration is your own counter on top of a given upstream version, and resets on each upstream bump:

```
v1.3.1-lonestone.1     first release on upstream 1.3.1
v1.3.1-lonestone.2     a fix on the same upstream
v1.4.0-lonestone.1     after merging upstream 1.4.0
```

This convention exists because it was got wrong once: the first images were tagged `v1.0.0` while the app reported `1.3.1`, giving two different answers to "which version is running?".

### Guardrails

- **Refuses to run without `PLANE_REGISTRY_NS`**, so a missing config cannot become a push to the wrong account.
- **Refuses to overwrite a published tag.** Checks the registry for each of the six images and aborts unless `--force`.
- **Warns on a dirty working tree**, using `git status --porcelain` so untracked files are caught too — they still enter the Docker build context.
- **Stops at the first failure.** A failed build or push aborts the run rather than leaving a partial release published.
- **Prints a digest summary** so you can confirm what actually landed in the registry.

### The `VITE_*` trap

`web`, `admin` and `space` compile their configuration **into the JS bundle** at build time, via `define: { "process.env": ... }` in `apps/web/vite.config.ts:18`. There is no `process` in a browser and nginx serves static files, so nothing can be injected afterwards.

Consequences:

- **Retagging an image does not reconfigure it.** New deployment URLs require a rebuild.
- **You need one image per URL topology.** The same image cannot serve two different origins.
- **Anything `VITE_*` is public** — it ships to every visitor in plain text. Never put a secret behind that prefix.

Leaving these values unset produces relative paths, which is correct when everything is served behind a single proxy on one origin. Set them in `release.env` only when the apps live on separate domains or under a different sub-path.

### Requirements

`docker` (logged in to the target namespace), `git`, `python3`.

---

## `sync-upstream.sh`

Merges `upstream/preview` into this fork. Implements the procedure in [`../docs/architecture/fork-maintenance.md`](../docs/architecture/fork-maintenance.md).

```bash
./tools/sync-upstream.sh --dry-run            # report what would land, change no files
./tools/sync-upstream.sh                      # merge into sync/upstream-<date>, then run checks
./tools/sync-upstream.sh --no-checks          # merge only, skip install/types/build
./tools/sync-upstream.sh --onto preview       # merge straight into preview instead
./tools/sync-upstream.sh --help
```

Start with `--dry-run`. It reports the ahead/behind counts, the upstream commits that would land, and — most usefully — **the set of files changed on both sides**, which is the actual conflict surface before you commit to anything.

Needs no configuration; it adds the `upstream` remote itself if missing.

### What it does

1. Adds the `upstream` remote if missing, fetches `upstream/preview`
2. Reports divergence and the both-sides-changed file list
3. Creates a throwaway `sync/upstream-<date>` branch off `preview` and merges there
4. Runs `pnpm install --frozen-lockfile`, `pnpm check:types`, `pnpm build`
5. Surfaces upstream changes to `apps/web/ce/` and any newly added Django migrations

### Guardrails

- **Merges into a throwaway branch by default**, not `preview`. A bad merge is discarded with `git branch -D sync/...` instead of being untangled. Use `--onto preview` only when you already know the merge is clean.
- **Refuses to run on a dirty tree** — a merge needs a clean starting point.
- **On conflict, stops with the resolution steps** rather than leaving a half-merged state.
- **Fails loudly if post-merge checks break**, keeping the merge commit on the sync branch so `preview` stays green.
- **Exits early when already up to date**, so it is safe to run on a schedule.

### Expected conflicts

`pnpm-lock.yaml` conflicts on essentially every sync. The resolution the script prints:

```bash
git checkout --theirs pnpm-lock.yaml && pnpm install && git add pnpm-lock.yaml
```

`apps/web/ce/` is the other high-risk area — upstream changes it and so might you. The script diffs it for you to review against your own edition layer.

### Never rebase

Always merge, never rebase `preview` onto upstream. Rebasing rewrites history and makes every subsequent sync worse. See "Branching model" in the fork maintenance guide.

### Requirements

`git`, `pnpm`. Network access to `github.com`.

---

## Typical release cycle

```bash
# 1. see what upstream has
./tools/sync-upstream.sh --dry-run

# 2. merge it on a throwaway branch, checks included
./tools/sync-upstream.sh

# 3. review, then promote
git checkout preview && git merge sync/upstream-<date>

# 4. cut images from the new upstream (version comes from package.json)
./tools/release-lonestone.sh 1
```

Step 4 picks up the new upstream version automatically — if the merge bumped `package.json` to `1.4.0`, the tag becomes `v1.4.0-<suffix>.1` with no extra input.
