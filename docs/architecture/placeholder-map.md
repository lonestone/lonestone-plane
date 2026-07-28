# CE Placeholder Map

Every `return <></>` in `ce/` is an empty slot the Pro edition fills. This document maps every placeholder to its contract (props), where it renders in the UI, and what file you override in your edition layer.

---

## Quick reference

| Feature area | Placeholder component | Where it renders | Risk to override |
|---|---|---|---|
| **Project templates** | `ProjectTemplateSelect` | Project creation modal header | ✅ Zero |
| **Issue templates** | `WorkItemTemplateSelect` | Issue create/edit modal | ✅ Zero |
| **Automations page** | `CustomAutomationsRoot` | Project settings → Automations | ✅ Zero |
| **Issue sidebar extras** | `WorkItemAdditionalSidebarProperties` | Issue detail sidebar | ✅ Zero |
| **Issue modal extras** | `WorkItemModalAdditionalProperties` | Issue create/edit modal | ✅ Zero |
| **Issue widget buttons** | `WorkItemAdditionalWidgetActionButtons` | Issue detail toolbar | ✅ Zero |
| **Issue widget panels** | `WorkItemAdditionalWidgetCollapsibles` | Issue detail body | ✅ Zero |
| **Issue widget modals** | `WorkItemAdditionalWidgetModals` | Issue detail (modal registry) | ✅ Zero |
| **Issue list column** | `WorkItemAdditionalProperties` (layouts) | Issue list/board/table rows | ✅ Zero |
| **Epics modal** | `CreateUpdateEpicModal` | Global | ✅ Zero |
| **Workflow tree** | `WorkFlowGroupTree` | Issue list (grouped by state) | ✅ Zero |
| **Workflow message** | `WorkFlowDisabledMessage` | State transition UI | ✅ Zero |
| **Gantt dependencies** | 4 components | Gantt chart | ✅ Zero |
| **De-dupe** | 4 components | Issue quick actions | ✅ Zero |
| **Pages share** | `PageShareControl` | Page header | ✅ Zero |
| **Pages collaborators** | `PageCollaboratorsList` | Page header | ✅ Zero |
| **Pages extra actions** | `PageDetailsHeaderExtraActions` | Page header | ✅ Zero |
| **Pages move modal** | `MovePagesModal` | Page actions | ✅ Zero |
| **View publish modal** | `PublishViewModal` | View header actions | ✅ Zero |
| **View layout extras** | `GlobalViewLayoutSelection` | Workspace views header | ✅ Zero |
| **Sidebar app switcher** | `SidebarAppSwitcher` | Main sidebar top | ✅ Zero |
| **Teams sidebar** | `SidebarTeamsList` | Workspace sidebar | ✅ Zero |
| **Integrations page** | ❌ No placeholder | Workspace settings → Integrations | ⚠️ Edit `app/` file |
| **Settings nav entries** | ❌ No placeholder | Settings sidebar | ⚠️ Edit constants package |

---

## Project & Issue Templates

### `ProjectTemplateSelect`
**File to override:** `oe/components/projects/create/template-select.tsx`  
**Where it renders:** Top-left of the cover image in the "Create project" modal  
**Called from:** `core/components/project/create/header.tsx`

```ts
export type TProjectTemplateSelect = {
  disabled?: boolean;
  onClick?: () => void;   // opens your template picker
};
```

In CE this is an empty `<></>`. In EE clicking it presumably opens a template library modal. The `handleNextStep` callback in `CreateProjectForm` accepts a `templateId` prop — it's already plumbed through. You implement the picker UI, call your template API to pre-fill the form, then pass the selected template's ID back via `onClick`.

---

### `WorkItemTemplateSelect`
**File to override:** `oe/components/issues/issue-modal/template-select.tsx`  
**Where it renders:** Inside the issue create/edit modal  
**Called from:** `core/components/issues/issue-modal/form.tsx`

```ts
export type TWorkItemTemplateSelect = {
  projectId: string | null;
  typeId: string | null;          // selected issue type (for type-scoped templates)
  disabled?: boolean;
  size?: "xs" | "sm";
  placeholder?: string;
  renderChevron?: boolean;
  dropDownContainerClassName?: string;
  handleModalClose: () => void;   // call this when template replaces modal content
  handleFormChange?: () => void;  // call this after pre-filling fields
};
```

When a template is selected, you'd call the template API to get default values and populate the form via `react-hook-form`'s `setValue`. The `handleModalClose` / `handleFormChange` hooks let you signal form state changes to the parent.

---

## Automations

### `CustomAutomationsRoot`
**File to override:** `oe/components/automations/root.tsx`  
**Where it renders:** Project settings → Automations page (full page content)  
**Called from:** `app/(all)/[workspaceSlug]/settings/projects/[projectId]/automations/page.tsx`

```ts
export type TCustomAutomationsRootProps = {
  projectId: string;
  workspaceSlug: string;
};
```

The route already exists. The page is a skeleton that calls your component with the project context. You render the full automations UI here — rule list, create form, etc. Nothing in `core/` or `app/` needs to change.

Also available but less critical:

- `AutomationsListWrapper` — the layout wrapper around the automations page (from `oe/components/automations/list/wrapper.tsx` — check the `app/` layout file)

---

## Issue Detail — Widget System

Three placeholders sit inside the issue detail view and receive a consistent set of props. They are the designed injection points for "widget"-style panels (worklog, time tracking, custom fields blocks, etc.).

### `WorkItemAdditionalWidgetActionButtons`
**File to override:** `oe/components/issues/issue-detail-widgets/action-buttons.tsx`  
**Where it renders:** Issue detail header / action bar

### `WorkItemAdditionalWidgetCollapsibles`
**File to override:** `oe/components/issues/issue-detail-widgets/collapsibles.tsx`  
**Where it renders:** Issue detail body (below the built-in collapsible sections)

### `WorkItemAdditionalWidgetModals`
**File to override:** `oe/components/issues/issue-detail-widgets/modals.tsx`  
**Where it renders:** Mounted globally inside the issue detail (renders modals, not visible UI)

All three share the same props contract:

```ts
type Props = {
  disabled: boolean;
  hideWidgets: TWorkItemWidgets[];  // list of widget keys to suppress
  issueServiceType: TIssueServiceType;
  projectId: string;
  workItemId: string;
  workspaceSlug: string;
};
```

The `TWorkItemWidgets` type (from `@plane/types`) is likely an enum of all possible widget keys. You can use `hideWidgets` to let users collapse/hide your custom widgets via the same mechanism upstream uses for its own.

---

## Issue Detail — Sidebar Properties

Already covered in the previous document, but included here for completeness:

### `WorkItemAdditionalSidebarProperties`
**File to override:** `oe/components/issues/issue-details/additional-properties.tsx`

### `WorkItemModalAdditionalProperties`
**File to override:** `oe/components/issues/issue-modal/modal-additional-properties.tsx`

---

## Issue Layouts — List/Board/Table Row

### `WorkItemAdditionalProperties` (issue layouts)
**File to override:** `oe/components/issues/issue-layouts/additional-properties.tsx`  
**Where it renders:** Each row in list, board, and table views

```ts
// From ce/components/issues/issue-layouts/additional-properties.tsx
// (read the actual type from the file — it receives the issue ID and context)
```

This is the slot for adding extra columns/cells to issue rows. If you add a `customer_id` field, this is where you'd show it inline in the list without opening the detail panel.

---

## Epics

### `CreateUpdateEpicModal`
**File to override:** `oe/components/epics/epic-modal/modal.tsx`  
**Where it renders:** Called globally when creating/editing an epic-type issue

```ts
export interface EpicModalProps {
  data?: Partial<TIssue>;       // pre-fill data
  isOpen: boolean;
  onClose: () => void;
  beforeFormSubmit?: () => Promise<void>;
  onSubmit?: (res: TIssue) => Promise<void>;
  fetchIssueDetails?: boolean;
  primaryButtonText?: { default: string; loading: string };
  isProjectSelectionDisabled?: boolean;
}
```

The modal is a full TIssue-compatible create/edit form, but specialised for epic-type issues. CE renders nothing — Epics exist as a concept (via `IssueType.is_epic`) but the create/edit UI is stubbed out.

---

## Workflow

State-transition workflows (restricting which state transitions are allowed, like Jira workflows) are fully stubbed in CE.

### `WorkFlowGroupTree`
**File to override:** `oe/components/workflow/workflow-group-tree.tsx`  
**Where it renders:** Issue list view, inside each state group header

```ts
type Props = {
  groupBy?: TIssueGroupByOptions;
  groupId: string | undefined;    // the current group's ID (usually state ID)
};
```

In EE this presumably shows a visual flow indicator (arrows between allowed states). In CE it renders nothing.

### `WorkFlowDisabledMessage`
**File to override:** `oe/components/workflow/workflow-disabled-message.tsx`  
**Where it renders:** State dropdown, when a transition is not allowed

```ts
type Props = {
  parentStateId: string;
  className?: string;
};
```

Also: `WorkFlowDisabledOverlay` — an overlay on the entire state group when workflow enforcement blocks a drag.

---

## Gantt Chart — Dependencies

Four components stub out the dependency-arrow layer on the Gantt chart.

| Component | File | Role |
|---|---|---|
| `DependencyPaths` | `ce/components/gantt-chart/dependency/dependency-paths.tsx` | SVG paths connecting dependent issues |
| `DraggableDependencyPath` | `.../draggable-dependency-path.tsx` | Interactive draggable path |
| `RightDraggable` | `.../blockDraggables/right-draggable.tsx` | Right handle for creating dependencies |
| `LeftDraggable` | `.../blockDraggables/left-draggable.tsx` | Left handle |

All are empty `<></>` in CE. Override all four in `oe/components/gantt-chart/dependency/` to implement visual dependency drawing.

---

## De-duplication

Four components implement the "find duplicate" feature.

| Component | File | Role |
|---|---|---|
| `DeDupeButtonRoot` | `ce/components/de-dupe/de-dupe-button.tsx` | Button to trigger duplicate search |
| `DuplicateModalRoot` | `.../duplicate-modal/root.tsx` | Full duplicate-search modal |
| `DuplicatePopoverRoot` | `.../duplicate-popover/root.tsx` | Inline popover variant |
| `DuplicateIssueBlockButtonLabel` | `.../issue-block/button-label.tsx` | Label inside duplicate block |

```ts
// DeDupeButtonRoot props
type TDeDupeButtonRoot = {
  workspaceSlug: string;
  isDuplicateModalOpen: boolean;
  handleOnClick: () => void;
  label: string;
};
```

---

## Pages

Four placeholders in the page editor header.

### `PageShareControl`
**File to override:** `oe/components/pages/header/share-control.tsx`

```ts
type TPageShareControlProps = {
  page: TPageInstance;       // full page store instance
  storeType: EPageStoreType; // which store context (project, workspace, etc.)
};
```

Renders a share/invite button in the page header toolbar. CE returns `null`.

### `PageCollaboratorsList`
**File to override:** `oe/components/pages/header/collaborators-list.tsx`

```ts
type TPageCollaboratorsListProps = {
  page: TPageInstance;
};
```

Shows avatar stack of users currently viewing/editing the page. CE returns `null`. This integrates with the live server's presence data.

### `PageDetailsHeaderExtraActions`
**File to override:** `oe/components/pages/extra-actions.tsx`

```ts
type TPageHeaderExtraActionsProps = {
  page: TPageInstance;
  storeType: EPageStoreType;
};
```

Extra action buttons at the end of the page header (export, version history, etc.). CE returns `null`.

### `MovePagesModal` / page modals
**File to override:** `oe/components/pages/modals/modals.tsx`  
Also: `MovePagesModal` in `oe/components/pages/modals/move-page-modal.tsx`

---

## Views

### `PublishViewModal`
**File to override:** `oe/components/views/publish/modal.tsx`

```ts
type Props = {
  isOpen: boolean;
  view: IProjectView;
  onClose: () => void;
};
```

The "Publish view" modal (make a view publicly accessible as a shared board). The `DeployBoard` model already exists in the backend for this.

### `GlobalViewLayoutSelection`
**File to override:** `oe/components/views/helper.tsx`

```ts
type TLayoutSelectionProps = {
  onChange: (layout: EIssueLayoutTypes) => void;
  selectedLayout: EIssueLayoutTypes;
  workspaceSlug: string;
};
```

Layout switcher in the workspace views header. CE returns `<></>` — meaning workspace views have no layout toggle in CE. EE presumably adds Gantt, spreadsheet, etc. at workspace scope.

Also in `helper.tsx`:
- `WorkspaceAdditionalLayouts` — additional layout renderers for workspace views
- `AdditionalHeaderItems` — extra buttons in any view's header (receives the full `IProjectView` object)

---

## Sidebar Navigation

### `SidebarAppSwitcher`
**File to override:** `oe/components/sidebar/app-switcher.tsx`  
**Where it renders:** Top of the main collapsible sidebar

No props. CE renders `null`. EE likely renders a product switcher (Plane ↔ Plane Docs ↔ etc.).

### `WorkspaceAppSwitcher`
**File to override:** `oe/components/workspace/app-switcher.tsx`  
**Where it renders:** Workspace-level context

No props. Same concept, different placement.

### `SidebarTeamsList`
**File to override:** `oe/components/workspace/sidebar/teams-sidebar-list.tsx`  
**Where it renders:** Workspace sidebar, below projects list

No props. CE renders `null`. EE adds a "Teams" section linking to team views.

---

## Workspace Members & Billing

### `BillingActionsButton`
**File to override:** `oe/components/workspace/billing/billing-actions-button.tsx`  
**Where it renders:** Members settings page header

No props. CE renders `<></>`. EE shows an "Upgrade" or "Manage billing" CTA.

### `MembersActivityButton`
**File to override:** `oe/components/workspace/members/members-activity-button.tsx`  
**Where it renders:** Members settings page header

No props. CE renders `<></>`. EE shows a "View activity" button (member audit log).

### `SendWorkspaceInvitationModal`
**File to override:** `oe/components/workspace/members/` (check the index export)  
**Where it renders:** Members settings page

---

## The Two Gaps: Integrations and Settings Navigation

### Integrations page — no placeholder

`app/(all)/[workspaceSlug]/settings/(workspace)/integrations/page.tsx` imports directly from `@/components/integration/` with no `@/plane-web` hook. The page fetches integrations from `/api/integrations/` and maps over them, rendering one `SingleIntegrationCard` per integration.

**To add your own integration:**

Option A — Add a new integration via the backend. The `Integration` model (`plane.db.models.integration.base`) stores integration definitions. If you add a row to this table (via a data migration or admin), the frontend will automatically render a card for it on the page. You then implement your integration's auth and callback views in your Django app.

Option B — Edit `integrations/page.tsx` directly (25 lines). Add your custom integration card alongside the dynamic list. This is safe because the file is very thin.

### Settings navigation — no placeholder

Adding a new item to the workspace or project settings sidebar requires editing `packages/constants/src/settings/workspace.ts` or `packages/constants/src/settings/project.ts` (both in `@plane/constants`).

These files export typed constant objects (`WORKSPACE_SETTINGS`, `PROJECT_SETTINGS`) that the settings sidebar renders. There's no runtime extension mechanism — they're static TypeScript objects.

**To add a settings page:**

1. Add your route file in `app/.../settings/projects/[projectId]/my-feature/page.tsx` — the route works immediately.
2. Edit `packages/constants/src/settings/project.ts` to add your entry to `PROJECT_SETTINGS` and `GROUPED_PROJECT_SETTINGS`. This touches an upstream file, but these constants change rarely and the diff is always additive (one new key-value pair).
3. Add the TypeScript key to `TProjectSettingsTabs` (in `packages/types/`) — same story: additive, low-conflict-risk.

**Conflict risk:** Low. Upstream adds settings entries very infrequently. When it does, it adds a new key to the object — your new key is independent and merge conflicts will only occur if upstream happens to add an entry right next to yours alphabetically, which is trivially resolved.

---

## Hooks placeholders

Beyond components, `ce/hooks/` also contains empty hooks:

| Hook | File | Purpose |
|------|------|---------|
| `useAdditionalEditorMention` | `ce/hooks/use-additional-editor-mention.tsx` | Inject custom @-mention targets into the editor |
| `useAdditionalFavoriteItemDetails` | `ce/hooks/use-additional-favorite-item-details.ts` | Extend favorite item metadata |
| `useBulkOperationStatus` | `ce/hooks/use-bulk-operation-status.ts` | Status for bulk operations (CE stub) |
| `useEditorFlagging` | `ce/hooks/use-editor-flagging.ts` | Content moderation flags in editor |
| `useFileSize` | `ce/hooks/use-file-size.ts` | File size limit hook (CE uses default) |
| `useIssueEmbed` | `ce/hooks/use-issue-embed.tsx` | Issue embed in editor |
| `useIssueProperties` | `ce/hooks/use-issue-properties.tsx` | Extended issue property hooks |
| `useNotificationPreview` | `ce/hooks/use-notification-preview.tsx` | Notification preview data |
| `usePageFlag` | `ce/hooks/use-page-flag.ts` | Page feature flags |
| `useTimelineChart` | `ce/hooks/use-timeline-chart.ts` | Timeline/Gantt chart data hook |

Override any of these in `oe/hooks/` and they'll be picked up wherever `core/` imports `@/plane-web/hooks/...`.
