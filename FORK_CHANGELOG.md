# Fork changelog

Registry of what this fork changes in upstream Plane and relies on from it, grouped by feature. How to keep it up to date: "The fork changelog" in [`docs/architecture/fork-maintenance.md`](docs/architecture/fork-maintenance.md#the-fork-changelog).

**Last upstream sync**: `65f4a99657` (`upstream/preview` of 2026-08-03), merged in `74d7b4187c`.

## Features

| Feature                           | Pull request   | Plane equivalent                                                                                     |
| --------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------- |
| Fork tooling and conventions      | #1, #2, #7     | None: repository tooling                                                                             |
| Edition layer                     | #2             | None: infrastructure. The `@/plane-web` alias and the fork store that every fork store extends       |
| Project templates                 | #2             | Project Templates (Business, Enterprise)                                                             |
| Guest collaboration               | #3, #4         | Closest: guests with custom roles via RBAC + GAC (Enterprise). Not checked against Plane's behaviour |
| Bulk edit (LONESTONEP-5)          | #6             | Bulk Ops (Pro: all properties; Business, Enterprise: also transfers and conversions)                 |
| Board multi-select (LONESTONEP-5) | #6             | None: Plane offers bulk operations in the list and spreadsheet layouts only                          |
| End-to-end tests (LONESTONEP-5)   | (to be opened) | None: test tooling of the fork                                                                       |

## Upstream files touched

Status is relative to upstream: `Modified`, `Added` or `Deleted`.

### Fork tooling and conventions

| File                | Status   | Change                                                                                    |
| ------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `.gitignore`        | Modified | Ignores local Spec Kit files (`.specify/`, `speckit-*` skills, `specs/`)                  |
| `.husky/pre-commit` | Modified | Runs `tools/check-fork-changelog.mjs --staged` before `lint-staged`                       |
| `AGENTS.md`         | Modified | Fork conventions: backend namespace, upstream code rules, feature check, changelog, tests |
| `pyproject.toml`    | Added    | Python project metadata at the repository root                                            |

### Edition layer

| File                                             | Status   | Change                                                                                     |
| ------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------ |
| `apps/api/plane/settings/common.py`              | Modified | Registers `plane.extended` in `INSTALLED_APPS`                                             |
| `apps/api/plane/tests/unit/extended/__init__.py` | Added    | Package of the `plane.extended` unit tests                                                 |
| `apps/api/plane/urls.py`                         | Modified | Mounts `plane.extended.urls` under `/api/extended/`                                        |
| `apps/web/core/lib/store-context.tsx`            | Modified | Provides the fork `RootStore` from `@/plane-web/store/root.store`                          |
| `apps/web/core/store/root.store.ts`              | Modified | Comment only: the core `RootStore` stays the type alias, the runtime store is the fork one |
| `apps/web/tsconfig.json`                         | Modified | `@/plane-web/*` points to `./oe/*` instead of `./ce/*`                                     |

**Known gaps with the conventions**

- `apps/web/core/store/root.store.ts` only gets a comment: a comment-only change in an upstream file. To revert.

### Project templates

| File                                                                                      | Status   | Change                                                                                |
| ----------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `apps/api/plane/tests/contract/app/test_project_template_app.py`                          | Added    | Contract tests of the `/api/extended/` template routes                                |
| `apps/api/plane/tests/unit/extended/test_apply_project_template.py`                       | Added    | Unit tests: applying a template                                                       |
| `apps/api/plane/tests/unit/extended/test_project_template_permissions.py`                 | Added    | Unit tests: template permissions                                                      |
| `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/templates/header.tsx` | Added    | Header of the workspace Templates settings page                                       |
| `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/templates/page.tsx`   | Added    | Workspace Templates settings page                                                     |
| `apps/web/app/routes/extended.ts`                                                         | Modified | Registers the Templates settings route (upstream's extension point, empty upstream)   |
| `apps/web/core/components/project/create/header.tsx`                                      | Modified | Renders the fork `ProjectTemplateSelect` in the project creation header               |
| `apps/web/core/components/projects/create/root.tsx`                                       | Modified | Fills the form from the selected template and applies it after the project is created |
| `apps/web/core/components/settings/workspace/sidebar/item-icon.tsx`                       | Modified | Icon of the workspace "Templates" settings page                                       |
| `packages/constants/src/settings/workspace.ts`                                            | Modified | Templates entry in the workspace settings                                             |
| `packages/i18n/src/locales/en/template.json`                                              | Modified | `source_project` strings (English only)                                               |
| `packages/services/src/index.ts`                                                          | Modified | Exports `./templates`                                                                 |
| `packages/services/src/templates/index.ts`                                                | Added    | Exports the template services                                                         |
| `packages/services/src/templates/project-template.service.ts`                             | Added    | Client of the `/api/extended/` template endpoints                                     |
| `packages/types/src/index.ts`                                                             | Modified | Exports `./templates`                                                                 |
| `packages/types/src/settings.ts`                                                          | Modified | `templates` workspace settings tab                                                    |
| `packages/types/src/templates/index.ts`                                                   | Added    | Exports the template types                                                            |
| `packages/types/src/templates/project.ts`                                                 | Added    | Project template types                                                                |

**Known gaps with the conventions** (to fix in a dedicated pull request)

- `apps/web/core/components/projects/create/root.tsx` holds about 80 lines of template logic (form prefill, apply after creation) in core, instead of a fork component or hook in `oe/` wired with one line.
- The template types and services live in `packages/types` and `packages/services`, shared with upstream, instead of `oe/`: five more upstream files.
- The `source_project` strings are in English only.
- The project creation form is filled from the template by a request that is not cancelled: when it answers after the user typed (slow network, or React StrictMode running the effect twice in dev), the typed name is replaced. Found by the e2e suite.

### Guest collaboration

| File                                                                                     | Status   | Change                                                                                   |
| ---------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `apps/api/plane/app/permissions/base.py`                                                 | Modified | `allow_permission(..., allow_collaborating_guest=False)` and `_is_collaborating_guest`   |
| `apps/api/plane/app/serializers/project.py`                                              | Modified | `guest_can_collaborate` field on two project serializers                                 |
| `apps/api/plane/app/views/cycle/base.py`                                                 | Modified | `allow_collaborating_guest=True` on mutation endpoints                                   |
| `apps/api/plane/app/views/cycle/issue.py`                                                | Modified | `allow_collaborating_guest=True` on mutation endpoints                                   |
| `apps/api/plane/app/views/issue/base.py`                                                 | Modified | `allow_collaborating_guest=True` on mutation endpoints                                   |
| `apps/api/plane/app/views/module/base.py`                                                | Modified | `allow_collaborating_guest=True` on mutation endpoints                                   |
| `apps/api/plane/app/views/module/issue.py`                                               | Modified | `allow_collaborating_guest=True`; module and work item lookups scoped to the project     |
| `apps/api/plane/app/views/project/base.py`                                               | Modified | `select_related("guest_collaboration")` on the project queryset                          |
| `apps/api/plane/tests/contract/app/test_guest_collaboration_app.py`                      | Added    | Contract tests                                                                           |
| `apps/web/core/components/issues/header.tsx`                                             | Modified | Create button permission uses `canEditProjectWorkItems`                                  |
| `apps/web/core/components/issues/issue-detail/root.tsx`                                  | Modified | Edit permission uses `canEditProjectWorkItems`                                           |
| `apps/web/core/components/issues/issue-layouts/calendar/base-calendar-root.tsx`          | Modified | Edit permission uses `canEditProjectWorkItems`                                           |
| `apps/web/core/components/issues/issue-layouts/calendar/roots/project-root.tsx`          | Modified | Edit permission uses `canEditProjectWorkItems`                                           |
| `apps/web/core/components/issues/issue-layouts/empty-states/cycle.tsx`                   | Modified | Empty state actions use `canEditProjectWorkItems`                                        |
| `apps/web/core/components/issues/issue-layouts/empty-states/module.tsx`                  | Modified | Empty state actions use `canEditProjectWorkItems`                                        |
| `apps/web/core/components/issues/issue-layouts/empty-states/project-issues.tsx`          | Modified | Empty state actions use `canEditProjectWorkItems`                                        |
| `apps/web/core/components/issues/issue-layouts/gantt/base-gantt-root.tsx`                | Modified | Edit permission uses `canEditProjectWorkItems`                                           |
| `apps/web/core/components/issues/issue-layouts/kanban/base-kanban-root.tsx`              | Modified | Edit permission uses `canEditProjectWorkItems`                                           |
| `apps/web/core/components/issues/issue-layouts/kanban/roots/cycle-root.tsx`              | Modified | Edit permission per work item project, through `canEditProjectWorkItems`                 |
| `apps/web/core/components/issues/issue-layouts/kanban/roots/profile-issues-root.tsx`     | Modified | Edit permission uses `canEditProjectWorkItems`                                           |
| `apps/web/core/components/issues/issue-layouts/kanban/roots/project-root.tsx`            | Modified | Edit permission uses `canEditProjectWorkItems`                                           |
| `apps/web/core/components/issues/issue-layouts/list/base-list-root.tsx`                  | Modified | Edit permission uses `canEditProjectWorkItems`                                           |
| `apps/web/core/components/issues/issue-layouts/list/roots/cycle-root.tsx`                | Modified | Edit permission per work item project, through `canEditProjectWorkItems`                 |
| `apps/web/core/components/issues/issue-layouts/list/roots/profile-issues-root.tsx`       | Modified | Edit permission uses `canEditProjectWorkItems`                                           |
| `apps/web/core/components/issues/issue-layouts/list/roots/project-root.tsx`              | Modified | Edit permission uses `canEditProjectWorkItems`                                           |
| `apps/web/core/components/issues/issue-layouts/quick-action-dropdowns/cycle-issue.tsx`   | Modified | Edit permission uses `canEditProjectWorkItems`                                           |
| `apps/web/core/components/issues/issue-layouts/quick-action-dropdowns/issue-detail.tsx`  | Modified | Edit permission uses `canEditProjectWorkItems`                                           |
| `apps/web/core/components/issues/issue-layouts/quick-action-dropdowns/module-issue.tsx`  | Modified | Edit permission uses `canEditProjectWorkItems`                                           |
| `apps/web/core/components/issues/issue-layouts/quick-action-dropdowns/project-issue.tsx` | Modified | Edit permission uses `canEditProjectWorkItems`                                           |
| `apps/web/core/components/issues/issue-layouts/spreadsheet/base-spreadsheet-root.tsx`    | Modified | Edit permission uses `canEditProjectWorkItems`                                           |
| `apps/web/core/components/issues/issue-layouts/spreadsheet/roots/cycle-root.tsx`         | Modified | Edit permission per work item project, through `canEditProjectWorkItems`                 |
| `apps/web/core/components/issues/issue-layouts/spreadsheet/roots/project-root.tsx`       | Modified | Edit permission uses `canEditProjectWorkItems`                                           |
| `apps/web/core/components/issues/issue-layouts/spreadsheet/roots/workspace-root.tsx`     | Modified | Edit permission uses `canEditProjectWorkItems`                                           |
| `apps/web/core/components/issues/issue-modal/provider.tsx`                               | Modified | Projects offered in the create modal include those where a guest can collaborate         |
| `apps/web/core/components/issues/peek-overview/root.tsx`                                 | Modified | Edit permission uses `canEditProjectWorkItems`                                           |
| `apps/web/core/components/project/project-settings-member-defaults.tsx`                  | Modified | "Allow guests to collaborate" toggle in the project settings                             |
| `apps/web/core/components/workspace/sidebar/project-navigation.tsx`                      | Modified | Cycles and Modules entries also shown to guests when the project allows collaboration    |
| `apps/web/core/hooks/use-project-collaboration.ts`                                       | Added    | `canEditProjectWorkItems`: member-level edit rights for guests of collaborating projects |
| `packages/services/src/project/guest-collaboration.service.ts`                           | Added    | Client of the guest collaboration endpoint                                               |
| `packages/services/src/project/index.ts`                                                 | Modified | Exports the guest collaboration service                                                  |
| `packages/types/src/project/projects.ts`                                                 | Modified | `guest_can_collaborate` on the project type                                              |

**Known gaps with the conventions** (to fix in a dedicated pull request)

- Upstream permission logic is replaced, not kept: `allowPermissions([ADMIN, MEMBER], PROJECT)` becomes `canEditProjectWorkItems` in 28 core files. A single seam (the fork permission store treating a collaborating guest as a member for project-level checks) would bring them back to upstream.
- Fork logic is added to upstream backend code instead of `plane.extended`: the `allow_permission` decorator, six views and the project serializers (the same method copied twice). Handling the flag once in the decorator would remove the view changes.
- Lint and unrelated changes in upstream files: file-level `// oxlint-disable` comments, and `.sort` replaced by `.toSorted` in `project-navigation.tsx` (fixed on `chore/clean-fork-upstream-sync`).
- Plane offers no such feature as such (closest: guest custom roles on Enterprise). It needs either an entry in "Features not in Plane" or a decision that the Enterprise equivalent covers it.

### Bulk edit (LONESTONEP-5)

| File                                                              | Status   | Change                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/plane/tests/contract/app/test_issue_bulk_update_app.py` | Added    | Contract tests of the bulk update endpoint                                                                                                                                                                                |
| `apps/api/plane/tests/unit/extended/test_issue_bulk_update.py`    | Added    | Unit tests of the bulk update service                                                                                                                                                                                     |
| `apps/web/core/components/issues/bulk-operations/root.tsx`        | Modified | Renders the fork `BulkOperationsBar` instead of `BulkOperationsUpgradeBanner`. Why: keeps upstream's display rule (active, enabled selection) and its call sites in every layout; only the paid-edition banner is swapped |
| `apps/web/core/hooks/use-bulk-operation-status.ts`                | Modified | Re-exports the fork `useBulkOperationStatus`. Why: upstream hard-codes `() => false`, which hides the selection checkboxes                                                                                                |
| `apps/web/core/services/issue/issue.service.ts`                   | Modified | `bulkOperations` posts to `/api/extended/.../issues/bulk-update/` (URL only). Why: the upstream endpoint only exists in the paid edition                                                                                  |
| `packages/i18n/src/locales/en/work-item.json`                     | Modified | Keys appended at the end of `bulk_operations`; no upstream key changed. Why: the fork has no translation namespace of its own; on a merge conflict, keep upstream's keys and re-append ours                               |
| `packages/i18n/src/locales/fr/work-item.json`                     | Modified | Keys appended at the end of `bulk_operations`; no upstream key changed. Why: the fork has no translation namespace of its own; on a merge conflict, keep upstream's keys and re-append ours                               |

**How it plugs in**: the bar (`apps/web/oe/components/issues/bulk-operations/`) replaces upstream's "Upgrade" banner and calls a fork endpoint in `plane.extended` that is all or nothing, so that the upstream stores stay untouched. It updates the store optimistically through upstream's local `issueUpdate`, reverts the change if the API rejects a batch, and never refetches the view (`fetchIssuesWithExistingPagination` clears the list first).

**Dropped**: per-work-item results ("48 updated, 2 skipped"). They changed upstream signatures in nine core files (the eight issue store interfaces and the base store). Do not bring them back without weighing that cost; the design is in the history of #6.

### Board multi-select (LONESTONEP-5)

| File                                                                        | Status   | Change                                                                                                                                                                 |
| --------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/core/components/issues/issue-layouts/kanban/base-kanban-root.tsx` | Modified | Renders `BoardSelection` next to the board's scroll container (one import, one line). Why: the board has no selection upstream and no `@/plane-web` extension point    |
| `apps/web/core/components/issues/issue-layouts/kanban/block.tsx`            | Modified | Renders `BoardCardSelection` inside the card wrapper (one import, one line): card checkbox, selected border and touch selection. Why: the card itself stays unmodified |

**How it plugs in**: `BoardSelection` (`apps/web/oe/components/issues/board-selection/`) builds the selection groups, renders the bulk bar over the board and shares the selection helpers through a MobX box; `BoardCardSelection` adds the checkbox and touch selection on the card wrapper. Only upstream's selection helpers are used.

### End-to-end tests (LONESTONEP-5)

The suite itself (`apps/web-e2e/`, `docker-compose-e2e.yml`) is fork-owned.

| File                  | Status   | Change                                                                                                                                                                                                                |
| --------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm-workspace.yaml` | Modified | Catalog entries `@playwright/test` and `testcontainers`; `allowBuilds` entries for their native dependencies (`cpu-features`, `protobufjs`, `ssh2`, disabled). Why: `apps/web-e2e` uses `catalog:` like every package |
| `pnpm-lock.yaml`      | Modified | Lock entries of `apps/web-e2e`. Why: generated by `pnpm install`; on conflicts, take upstream's lockfile and run `pnpm install` again                                                                                 |

## Upstream dependencies

Upstream files the fork relies on without changing them. Only the LONESTONEP-5 features are inventoried so far; the dependencies of the earlier features are still to be listed.

### Bulk edit (LONESTONEP-5)

| Upstream file                                                                 | What the fork relies on                                                                                                               | Fork code                                                            |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `apps/web/core/store/issue/helpers/base-issues.store.ts`                      | `issueUpdate(..., shouldSync = false)`, exposed by every store as `updateIssue` but left out of the interfaces; `removeIssueFromList` | `apps/web/oe/components/issues/bulk-operations/use-bulk-update.ts`   |
| `apps/web/core/components/dropdowns/member/member-options.tsx`                | Option rendering, copied                                                                                                              | `apps/web/oe/components/issues/bulk-operations/dropdown-options.tsx` |
| `apps/web/core/components/dropdowns/module/module-options.tsx`                | Option rendering, copied                                                                                                              | `apps/web/oe/components/issues/bulk-operations/dropdown-options.tsx` |
| `apps/web/core/components/issues/issue-layouts/properties/label-dropdown.tsx` | Option rendering, copied                                                                                                              | `apps/web/oe/components/issues/bulk-operations/dropdown-options.tsx` |
| `apps/api/plane/bgtasks/issue_activities_task.py`                             | `issue_activity` task and the shape of its `requested_data` / `current_instance` per property                                         | `apps/api/plane/extended/services/issue_bulk_update.py`              |
| `apps/api/plane/bgtasks/webhook_task.py`                                      | `model_activity` task                                                                                                                 | `apps/api/plane/extended/services/issue_bulk_update.py`              |
| `apps/web/core/store/issue/project/issue.store.ts`                            | `updateIssue = this.issueUpdate`, so that `updateIssue` keeps the `shouldSync` parameter                                              | `apps/web/oe/components/issues/bulk-operations/use-bulk-update.ts`   |
| `apps/web/core/store/issue/cycle/issue.store.ts`                              | `updateIssue = this.issueUpdate`; `fetchParentStats` logic copied (cycle details, plus `fetchActiveCycleProgressPro` for v2 cycles)   | `apps/web/oe/components/issues/bulk-operations/use-bulk-update.ts`   |
| `apps/web/core/store/issue/module/issue.store.ts`                             | `updateIssue = this.issueUpdate`; `fetchParentStats` logic copied (module details)                                                    | `apps/web/oe/components/issues/bulk-operations/use-bulk-update.ts`   |
| `apps/web/core/store/issue/project-views/issue.store.ts`                      | `updateIssue = this.issueUpdate`                                                                                                      | `apps/web/oe/components/issues/bulk-operations/use-bulk-update.ts`   |
| `apps/web/core/hooks/use-issue-layout-store.ts`                               | `IssuesStoreContext` is only provided by the work item layout roots, so pages sharing the route params get no store type              | `apps/web/oe/hooks/use-bulk-operation-status.ts`                     |

### Board multi-select (LONESTONEP-5)

| Upstream file                                                            | What the fork relies on                                                                                                 | Fork code                                                              |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/web/core/hooks/use-multiple-select.ts`                             | `TSelectionHelper` selection helpers                                                                                    | `apps/web/oe/components/issues/board-selection/`                       |
| `apps/web/core/components/core/multiple-select/select-group.tsx`         | `MultipleSelectGroup`                                                                                                   | `apps/web/oe/components/issues/board-selection/root.tsx`               |
| `apps/web/core/components/core/multiple-select/entity-select-action.tsx` | `MultipleSelectEntityAction`                                                                                            | `apps/web/oe/components/issues/board-selection/card-selection.tsx`     |
| `apps/web/core/components/issues/issue-layouts/kanban/block.tsx`         | DOM: the element rendered by `BoardCardSelection` sits directly in the card wrapper, which receives the touch listeners | `apps/web/oe/components/issues/board-selection/use-touch-selection.ts` |

### End-to-end tests (LONESTONEP-5)

| Upstream file                                                                                                       | What the fork relies on                                                                                                                                                                                  | Fork code                          |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `apps/web/core/components/issues/issue-layouts/list/block.tsx`, `spreadsheet/issue-row.tsx`, `kanban/block.tsx`     | `id="issue-<id>"` on each row and card, with its selection checkbox inside                                                                                                                               | `apps/web-e2e/tests/helpers/ui.ts` |
| `apps/web/core/components/issues/peek-overview/`                                                                    | The "Work item title" text box of the peek overview                                                                                                                                                      | `apps/web-e2e/tests/helpers/ui.ts` |
| `apps/web/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/cycles/(detail)/`, `modules/(detail)/` | Sidebar toggle (a `PanelRight` icon button, no accessible name), `cycle_sidebar_collapsed` (boolean) and `module_sidebar_collapsed` (string) in local storage, "completed/total" progress in the sidebar | `apps/web-e2e/tests/views.spec.ts` |

## Features not in Plane

None so far.
