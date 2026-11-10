# Agent Development Guide

> **Before any new feature, run `/start-feature <description>`** (or follow `.claude/skills/start-feature/SKILL.md`). It checks that Plane offers the feature, creates the branch, prepares `FORK_CHANGELOG.md` and finds the upstream extension points before any spec or code. For now this fork only builds features that Plane offers (in a paid plan, usually): if Plane does not have it, stop and say so. A feature built anyway is an exception, documented in `FORK_CHANGELOG.md` ("Features not in Plane").

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

### Tests

- **Backend**: unit and contract tests are required for fork code, in `apps/api/plane/tests/unit/extended/` and `apps/api/plane/tests/contract/app/`. Conventions: `apps/api/plane/tests/TESTING_GUIDE.md` (the "Backend tests" section below points to `apps/api/tests/`, which only has `RUNNING_TESTS.md`).
- **Frontend**: `apps/web` has no unit test framework, and a fork feature does not add one. Cover the user paths end to end with Playwright in `apps/web-e2e/`: `pnpm --filter=web-e2e test:e2e`, against a throwaway stack.
- **E2E**: locate elements by role and accessible name, never with a `data-testid` added to an upstream file. Each test creates its own data. A flaky test is fixed or deleted.
- Delete the tests of a dropped behaviour; do not skip them.

Details: "Testing" in `docs/architecture/fork-maintenance.md`.

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
