# Agent Development Guide

## Commands

- `pnpm dev` - Start all dev servers (web:3000, admin:3001)
- `pnpm build` - Build all packages and apps
- `pnpm check` - Run all checks (format, lint, types)
- `pnpm check:lint` - OxLint across all packages
- `pnpm check:types` - TypeScript type checking
- `pnpm fix` - Auto-fix format and lint issues
- `pnpm turbo run <command> --filter=<package>` - Target specific package/app
- `pnpm --filter=@plane/ui storybook` - Start Storybook on port 6006

## Fork extension conventions

- **Backend**: All custom Django code goes in `apps/api/plane/extended/` (`plane.extended`). APIs under `/api/extended/`, DB tables `extended_*`. Do not add new top-level apps or fork migrations under `plane.db`. Details: `docs/architecture/fork-maintenance.md`.
- **Frontend**: Edition UI/stores live in `apps/web/oe/` (`@/plane-web/*`). Fork-only routes in `apps/web/app/routes/extended.ts`.

### Before starting a feature

Before writing a spec, a plan or code for a new feature, check whether Plane already offers it, in the Community Edition or a paid plan: follow `.claude/skills/plane-feature-check/SKILL.md` (Claude Code runs it automatically through a `UserPromptSubmit` hook in `.claude/settings.json`). For now the project does not build features that Plane does not offer: if Plane does not have it, stop and say so. A feature built anyway is an exception and must have its own entry in `FORK_CHANGELOG.md` ("Features not in Plane"). When it exists in a paid plan, mirror Plane's behaviour and plug into the CE placeholder.

### Touching upstream code

Upstream code is everything outside the fork folders: `apps/web/core/`, `apps/web/ce/`, `packages/`, and every `apps/api/plane/` package except `plane.extended`. Each line changed there can conflict on the next upstream merge, so keep the footprint as small as possible.

- **Look for an extension point first**: a `@/plane-web/*` import, a CE placeholder (`docs/architecture/placeholder-map.md`), a public store method, a service. Reuse it from `oe/` rather than editing upstream code.
- **When upstream code must change**, swap only the placeholder or add one line that renders fork code. Keep upstream logic, guards and display rules.
- **Never change an upstream signature or shared type** to fit a fork feature. Adapt the feature or the fork API instead, and keep fork-only types in `oe/`.
- **Prefer optimistic updates**: update the store first with upstream's own local update, call the API, revert on error. Do not refetch a whole view after a change: upstream's refetch clears the list (loader, closed menus, lost pagination).
- **Translations**: append keys at the end of an existing namespace; never edit an upstream key.
- **No formatting, lint-only or unrelated fixes** in upstream files. Unrelated fixes go on their own branch.
- **List every upstream file you modify, add or delete** (any file outside the fork folders) in `FORK_CHANGELOG.md` ("Upstream files touched"), under its feature, in the same commit. Fork code that copies upstream code or calls upstream internals goes in "Upstream dependencies". The pre-commit hook blocks the commit otherwise; `node tools/check-fork-changelog.mjs` audits the whole fork against `upstream/preview`.
- **Check the footprint** before opening a PR: `git diff --stat origin/preview -- apps/web/core apps/web/ce packages`.

Details, examples and pitfalls: "Keeping upstream changes minimal" in `docs/architecture/fork-maintenance.md`.

## Code Style

- **Imports**: Use `workspace:*` for internal packages, `catalog:` for external deps
- **TypeScript**: Strict mode enabled, all files must be typed
- **Formatting**: oxfmt, run `pnpm fix:format`
- **Linting**: OxLint with shared `.oxlintrc.json` config
- **Naming**: camelCase for variables/functions, PascalCase for components/types
- **Error Handling**: Use try-catch with proper error types, log errors appropriately
- **State Management**: MobX stores in `packages/shared-state`, reactive patterns
- **Testing**: All features require unit tests, use existing test framework per package
- **Components**: Build in `@plane/ui` with Storybook for isolated development

## Backend tests (Docker)

The Django/pytest suite for `apps/api` runs in an isolated stack defined by `docker-compose-test.yml` at the repo root.

Prereq (once): `./setup.sh` — generates `apps/api/.env` from `.env.example`.

- Full suite: `docker compose -f docker-compose-test.yml up --build --abort-on-container-exit --exit-code-from api-tests`
- Subset: `docker compose -f docker-compose-test.yml run --rm api-tests pytest -m unit`
- Teardown: `docker compose -f docker-compose-test.yml down -v`

See `apps/api/tests/RUNNING_TESTS.md` for the full walkthrough and troubleshooting; see `apps/api/tests/TESTING_GUIDE.md` for test conventions and fixtures.
