# Bulk edit of work item properties (LONESTONEP-5)

Select several work items and change their properties at once, in the list, spreadsheet, gantt and board layouts of a project. Plane offers this as "Bulk Ops" in its paid plans; the fork brings it to the Community Edition, and adds selection on the board, which Plane does not have.

This page explains how the feature plugs into upstream code. The list of upstream files it touches is in [`FORK_CHANGELOG.md`](../../FORK_CHANGELOG.md).

## Bulk actions bar

The upstream files it touches, and the upstream code it relies on, are listed in [`FORK_CHANGELOG.md`](../../FORK_CHANGELOG.md) (feature "Bulk edit"). The bulk edit strings are added at the end of `bulk_operations` in `packages/i18n/src/locales/{en,fr}/work-item.json` (no upstream key changed): on a merge conflict, keep upstream's keys and re-append ours.

The bar itself lives in `oe/components/issues/bulk-operations/`. The assignee, label and module menus copy the option rendering of the upstream dropdowns in `oe/components/issues/bulk-operations/dropdown-options.tsx` instead of importing it from `core/`; re-check it when upstream restyles those dropdowns. The backend lives in `plane.extended` (`issue_bulk_update` view, serializer and service).

The API is all or nothing, to fit the upstream store: if one work item cannot take the change, it answers `400 {"error", "code"}` and writes nothing. The codes the bar translates are `not_found` (a work item was deleted, archived or moved) and `invalid_date_range` (the start date would end up after the due date). The bar sends batches of 500 work items, the API limit; if a later batch fails, the toast reports how many were saved before it.

The issue stores are not modified. The bar updates the store optimistically from `oe/components/issues/bulk-operations/use-bulk-update.ts`:

1. For each selected work item it computes the new values (additions merged, `remove_*` values filtered out, other properties replaced) and applies them with the store's `updateIssue(..., shouldSync = false)`. That is upstream's `issueUpdate` in local mode, the one it uses for its own local changes: it updates the work item and moves it between groups (`updateIssueList`) without calling the API. The store interfaces leave `shouldSync` out, so the hook calls it through a typed cast (`TLocalIssueUpdate`); re-check it if upstream changes `issueUpdate`.
2. It sends the batch with `IssueService.bulkOperations`. If the API rejects it, the previous values are put back the same way.
3. Once saved: in a module's view, work items taken out of that module leave the list (`removeIssueFromList`); in a cycle or module view, the progress stats are fetched again (`fetchCycleDetails` or `fetchModuleDetails`, plus `fetchActiveCycleProgressPro` for v2 cycles); in the background, the work items are read back (`IssueService.retrieveIssues`, 100 per request) and whatever differs from the store is applied.

The view is never refetched: `fetchIssuesWithExistingPagination` clears the list first, which shows the loader, closes the open menu and resets the pagination. The removal keys are typed in `oe/components/issues/bulk-operations/types.ts`, not in the shared `TBulkOperationsPayload`, whose keys the upstream `bulkUpdateProperties` uses to index work items.

## Dropped: per-work-item partial success

A first version reported a result per work item, so that one bad work item did not block the others ("48 updated, 2 skipped: start date after due date"). It was removed because it did not fit the fork's constraint of staying as close as possible to upstream: it changed upstream signatures in nine `core/` files for a feature upstream does not have. Do not bring it back without weighing that cost again. How it worked, in case it is needed:

- API: `200` with `{"updated_issue_ids", "unchanged_issue_ids", "failed": [{"issue_id", "code"}]}`. A work item not found or with an invalid date range went to `failed` instead of rejecting the request; the others were still written.
- Types: `TBulkOperationsFailureCode` and `TBulkOperationsResponse` in `packages/types/src/issues/issue.ts`.
- Service: `bulkOperations` returned `Promise<TBulkOperationsResponse>` instead of `Promise<any>`.
- Base store: `bulkUpdateProperties` returned the response and applied the change to `response.updated_issue_ids` only, not to every sent id (upstream assumes they all succeed). It also handled the `remove_*` keys, took work items out of the current module's list and refreshed the cycle or module stats; that part now lives in the bar (optimistic update through upstream's local `issueUpdate`).
- The eight `core/store/issue/*/issue.store.ts` files: each interface (`IProjectIssues`, `ICycleIssues`, …) declares its own `bulkUpdateProperties` with `Promise<void>`. They all had to return `Promise<TBulkOperationsResponse>`, otherwise the bar, which reads the union of the stores, cannot access the response. TypeScript does not accept a `Promise<Response>` implementation behind a `Promise<void>` interface, so there is no way around these files without lying casts.
- Bar: merged the responses of the batches and showed a warning toast with one counted reason per failure code (`failure_reasons.*` used ICU plurals).

## Board multi-select

The upstream files it touches, and the upstream code it relies on, are listed in [`FORK_CHANGELOG.md`](../../FORK_CHANGELOG.md) (feature "Board multi-select").

New fork code: `oe/components/issues/board-selection/`. `BoardSelection` builds the selection groups, renders the bulk bar over the bottom of the board and publishes the selection helpers in a MobX box (`helpers-store.ts`), since it is a sibling of the board rather than a wrapper. `BoardCardSelection` reads them and wires touch selection on the card wrapper with native listeners. It only uses the upstream selection helpers (`handleEntityClick`). There is no column "select all" checkbox: upstream has no extension point in the column header, and Plane only offers bulk operations in the list and spreadsheet layouts.
