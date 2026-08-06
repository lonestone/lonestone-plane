# App: api — Django REST Backend

**Path**: `apps/api/`  
**Language**: Python 3.12  
**Framework**: Django + Django REST Framework  
**Process model**: Three container roles (API server, Celery worker, Celery beat)

---

## Module Layout

> **Fork convention:** All custom backend features belong in `plane.extended`
> (`apps/api/plane/extended/`), exposed under `/api/extended/`, with DB tables
> prefixed `extended_*`. Do not add new top-level Django apps or write fork
> migrations into `plane.db`. See [Fork maintenance](../fork-maintenance.md).

```
apps/api/
├── plane/                    # Main Django project package
│   ├── settings/             # Environment-specific settings
│   ├── api/                  # REST API v1 (primary)
│   │   ├── views/            # ViewSets / APIViews
│   │   ├── serializers/      # DRF serializers
│   │   ├── urls/             # URL routing
│   │   └── middleware/       # API auth middleware
│   ├── authentication/       # Auth providers & views
│   ├── app/                  # Internal web views (legacy)
│   ├── space/                # Public/shared space endpoints
│   ├── db/                   # Django ORM models
│   │   ├── models/           # All model definitions
│   │   └── migrations/       # Database migrations
│   ├── bgtasks/              # Celery task functions
│   ├── middleware/           # Request-level middleware
│   ├── utils/                # Shared Python utilities
│   ├── analytics/            # Event tracking
│   ├── license/              # Instance/license management
│   ├── extended/             # Fork-only Django app (all custom models/APIs)
│   │   ├── models/           # Namespaced tables: extended_*
│   │   ├── views/            # Endpoints under /api/extended/
│   │   ├── migrations/       # Keep out of plane.db.migrations
│   │   └── urls.py
│   ├── celery.py             # Celery app config + beat schedule
│   ├── urls.py               # Root URL dispatcher (includes api/extended/)
│   ├── asgi.py               # ASGI entrypoint
│   └── wsgi.py               # WSGI entrypoint
├── bin/                      # Docker entrypoint scripts
├── requirements/             # Python dependencies
└── manage.py
```

---

## Data Model

### Base Mixin (`db/models/base.py`)

All models extend `BaseModel` which provides:

- `created_at`, `updated_at` (auto timestamps)
- `created_by`, `updated_by` (FK to User)
- UUID primary key (`id`)
- Soft delete: `deleted_at`

---

### User & Authentication

#### `User`

Core auth user, extends `AbstractBaseUser`.

| Field                 | Type                | Notes                  |
| --------------------- | ------------------- | ---------------------- |
| `email`               | EmailField (unique) | Primary identifier     |
| `username`            | CharField (unique)  |                        |
| `display_name`        | CharField           |                        |
| `avatar`              | URLField            | Legacy URL             |
| `avatar_asset`        | FK → FileAsset      | New asset-based avatar |
| `cover_image`         | URLField            | Legacy                 |
| `cover_image_asset`   | FK → FileAsset      |                        |
| `user_timezone`       | CharField           | IANA timezone          |
| `is_email_verified`   | BooleanField        |                        |
| `is_password_expired` | BooleanField        |                        |
| `last_active`         | DateTimeField       |                        |
| `last_login_time`     | DateTimeField       |                        |
| `last_logout_time`    | DateTimeField       |                        |
| `token`               | CharField           | Device/magic token     |
| `masked_at`           | DateTimeField       | GDPR masking timestamp |

#### `Profile`

One-to-one extension of User.

| Field                         | Notes                       |
| ----------------------------- | --------------------------- |
| `theme`                       | UI theme preference         |
| `onboarding_step`             | Onboarding progress (JSONB) |
| `role`                        | Job role (free text)        |
| `language`                    | Preferred locale            |
| `start_of_the_week`           | 0=Sunday, 1=Monday          |
| `has_marketing_email_consent` |                             |
| `product_tour`                | Tour progress flags         |

#### `Account`

OAuth account linked to a User.

| Field                                       | Notes                                    |
| ------------------------------------------- | ---------------------------------------- |
| `provider`                                  | `google` / `github` / `gitlab` / `gitea` |
| `provider_account_id`                       | Provider's user ID                       |
| `access_token`, `refresh_token`, `id_token` | OAuth tokens                             |
| `access_token_expired_at`                   | Token expiry                             |

#### `Session`

Custom session store extending `AbstractBaseSession`. Adds `device_info` (JSON) and `user_id` for tracking active sessions per device.

---

### Workspace & Organisation

#### `Workspace`

Top-level organisational unit.

| Field               | Notes                                            |
| ------------------- | ------------------------------------------------ |
| `name`              | Display name                                     |
| `slug`              | URL slug (unique; on delete, timestamp appended) |
| `logo`              | Logo URL                                         |
| `owner`             | FK → User                                        |
| `timezone`          | Default IANA timezone                            |
| `organization_size` | Org size bucket                                  |

#### `WorkspaceMember`

Membership record linking a User to a Workspace.

| Field        | Notes                              |
| ------------ | ---------------------------------- |
| `role`       | `20=Admin`, `15=Member`, `5=Guest` |
| `view_props` | Saved view preferences (JSONB)     |
| `is_active`  | Soft deactivation                  |

#### `WorkspaceMemberInvite`

Pending invitation with one-time `token`. Stores `email`, `role`, `responded_at`, `accepted`.

#### `Team`

Named group of users within a Workspace. Has `name`, `description`, `logo_props` (icon + emoji), FK to Workspace.

#### `WorkspaceTheme`

Custom colour schemes per workspace.

#### `WorkspaceUserProperties`

Per-user, per-workspace preferences: `filters`, `display_filters`, `display_properties`, `rich_filters`, `navigation_project_limit`.

#### `WorkspaceHomePreference`

Controls which home page widgets are visible. `key` choices: `QUICK_LINKS`, `RECENTS`, `MY_STICKIES`, `NEW_AT_PLANE`, `QUICK_TUTORIAL`. Fields: `is_enabled`, `config` (JSONB), `sort_order`.

---

### Projects

#### `Project`

A project inside a Workspace.

| Field                                                                       | Notes                                           |
| --------------------------------------------------------------------------- | ----------------------------------------------- |
| `name`, `identifier`                                                        | `identifier` is a short unique code (≤12 chars) |
| `description`                                                               | Rich text                                       |
| `network`                                                                   | `0=Secret`, `2=Public`                          |
| `timezone`                                                                  | Project timezone                                |
| `emoji`, `icon_prop`, `logo_props`                                          | Icon configuration                              |
| `module_view`, `cycle_view`, `issue_views_view`, `page_view`, `intake_view` | Feature toggles                                 |
| `is_time_tracking_enabled`                                                  | Time tracking                                   |
| `is_issue_type_enabled`                                                     | Custom issue types                              |
| `archive_in`                                                                | Auto-archive after N months                     |
| `close_in`                                                                  | Auto-close after N months                       |
| `default_assignee`                                                          | FK → User                                       |
| `project_lead`                                                              | FK → User                                       |
| `default_state`                                                             | FK → State                                      |
| `archived_at`                                                               | Soft archive                                    |

#### `ProjectMember`

| Field                                        | Notes                         |
| -------------------------------------------- | ----------------------------- |
| `role`                                       | Mirrors WorkspaceMember roles |
| `view_props`, `default_props`, `preferences` | JSONB user prefs              |
| `is_active`                                  |                               |

#### `ProjectIdentifier`

OneToOne with Project. Enforces the unique short code across a workspace.

#### `ProjectUserProperty`

Per-user view preferences for a project: `filters`, `display_filters`, `display_properties`, `rich_filters`, `sort_order`.

---

### Issues (Work Items)

#### `Issue`

The central entity. Uses `ChangeTrackerMixin` to automatically create `IssueActivity` records on save.

| Field                            | Notes                                 |
| -------------------------------- | ------------------------------------- |
| `name`                           | Title                                 |
| `priority`                       | `urgent / high / medium / low / none` |
| `state`                          | FK → State                            |
| `point`                          | Story point (integer)                 |
| `estimate_point`                 | FK → EstimatePoint (typed estimate)   |
| `start_date`, `target_date`      | Date range                            |
| `sequence_id`                    | Auto-increment per project            |
| `sort_order`                     | Float, for drag-and-drop ordering     |
| `completed_at`                   | Set when state.group = COMPLETED      |
| `archived_at`                    | Soft archive                          |
| `is_draft`                       | Draft flag                            |
| `parent`                         | Self-FK for sub-issues                |
| `description_json`               | TipTap JSON (primary)                 |
| `description_html`               | Rendered HTML                         |
| `description_binary`             | Y.js binary (for live editing)        |
| `external_source`, `external_id` | For integrations (GitHub, Jira…)      |
| `type`                           | FK → IssueType                        |
| `assignees`                      | M2M → User (through `IssueAssignee`)  |
| `labels`                         | M2M → Label (through `IssueLabel`)    |

#### `IssueAssignee` / `IssueLabel`

Through models for the M2M relationships above.

#### `IssueRelation`

Links two issues with a typed relationship.
`relation_type`: `duplicate`, `relates_to`, `blocked_by`, `start_before`, `finish_before`, `implemented_by`.

#### `IssueBlocker`

Explicit blocker link: `block` (blocked issue) → `blocked_by` (blocking issue).

#### `IssueMention`

Records `@user` mentions within issue descriptions.

#### `IssueSubscriber`

Users watching an issue.

#### `IssueVote`

Per-user vote on an issue.

#### `IssueComment`

| Field                      | Notes                             |
| -------------------------- | --------------------------------- |
| `comment_json/html/binary` | Rich text in multiple formats     |
| `actor`                    | FK → User (author)                |
| `issue_commented_on`       | FK → Issue (for threaded replies) |

#### `IssueActivity`

Audit trail. Created automatically via `ChangeTrackerMixin` on every issue save.
| Field | Notes |
|-------|-------|
| `field` | Name of changed field |
| `old_value`, `new_value` | Before/after values |
| `verb` | `created` / `updated` / `deleted` |
| `actor` | FK → User |

#### `IssueLink`

External URLs attached to an issue (`title`, `url`).

#### `IssueVersion` / `IssueDescriptionVersion`

Full version history for the issue and its description, enabling restore functionality.

---

### States

#### `State`

Defines the workflow state an issue can be in.

| Field                   | Notes                                                            |
| ----------------------- | ---------------------------------------------------------------- |
| `name`, `color`, `slug` | Display properties                                               |
| `group`                 | `BACKLOG / UNSTARTED / STARTED / COMPLETED / CANCELLED / TRIAGE` |
| `is_triage`             | Marks the special triage state                                   |
| `default`               | Default state for new issues                                     |
| `sequence`              | Display order                                                    |

Two custom managers: `StateManager` (excludes TRIAGE), `TriageStateManager` (only TRIAGE).

---

### Cycles & Modules

#### `Cycle`

Time-boxed sprint-like iteration.

| Field                    | Notes                       |
| ------------------------ | --------------------------- |
| `name`, `description`    |                             |
| `start_date`, `end_date` |                             |
| `owned_by`               | FK → User                   |
| `progress_snapshot`      | JSONB, cached burndown data |
| `version`                | For optimistic locking      |
| `archived_at`            |                             |

#### `CycleIssue`

M2M through model between Cycle and Issue.

#### `Module`

Feature grouping (epics / milestones).

| Field                       | Notes                                                              |
| --------------------------- | ------------------------------------------------------------------ |
| `name`, `description`       |                                                                    |
| `start_date`, `target_date` |                                                                    |
| `status`                    | `backlog / planned / in-progress / paused / completed / cancelled` |
| `lead`                      | FK → User                                                          |
| `logo_props`                | Icon config                                                        |
| `archived_at`               |                                                                    |
| `members`                   | M2M → User (through `ModuleMember`)                                |

---

### Labels

#### `Label`

Coloured tags for issues.

| Field           | Notes                               |
| --------------- | ----------------------------------- |
| `name`, `color` |                                     |
| `parent`        | Self-FK (label groups)              |
| `workspace`     | Workspace-level label if no project |
| `project`       | Project-scoped label                |

---

### Pages (Documents/Wiki)

#### `Page`

Rich text documents attached to projects.

| Field                          | Notes                                 |
| ------------------------------ | ------------------------------------- |
| `name`                         | Title                                 |
| `description_json/html/binary` | Content in multiple formats           |
| `access`                       | `0=Public`, `1=Private`               |
| `is_locked`                    | Prevent edits                         |
| `is_global`                    | Workspace-wide page                   |
| `parent`                       | Self-FK for nested pages              |
| `owned_by`                     | FK → User                             |
| `archived_at`                  |                                       |
| `labels`                       | M2M → Label (through `PageLabel`)     |
| `projects`                     | M2M → Project (through `ProjectPage`) |

#### `PageVersion`

Full version history per page (enables restore).

---

### Views

#### `IssueView`

Saved filter + display configuration.

| Field                                                   | Notes                                |
| ------------------------------------------------------- | ------------------------------------ |
| `name`, `description`                                   |                                      |
| `filters`                                               | JSONB filter definition              |
| `display_filters`, `display_properties`, `rich_filters` | JSONB display config                 |
| `access`                                                | `0=Private`, `1=Public`              |
| `is_locked`                                             |                                      |
| `project`                                               | FK → Project (null = workspace view) |
| `owned_by`                                              | FK → User                            |

---

### Estimates

#### `Estimate`

Defines the estimation scheme for a project.

- `type`: `categories` (T-shirt) or `points` (Fibonacci, etc.)
- `last_used`: Flag for the active estimate scheme

#### `EstimatePoint`

Individual value in an estimate scheme.

- `key` (integer index), `value` (display string, e.g. "XL", "13")

---

### File Assets

#### `FileAsset`

Central file storage record for all uploaded content.

| Field                       | Notes                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `asset`                     | FileField (path in S3/MinIO)                                                                                                                                              |
| `entity_type`               | Enum: `ISSUE_ATTACHMENT`, `ISSUE_DESCRIPTION`, `COMMENT_DESCRIPTION`, `PAGE_DESCRIPTION`, `USER_COVER`, `USER_AVATAR`, `WORKSPACE_LOGO`, `PROJECT_COVER`, `DRAFT_ISSUE_*` |
| `size`                      | File size in bytes                                                                                                                                                        |
| `is_uploaded`               | Whether upload to S3 completed                                                                                                                                            |
| `is_deleted`, `is_archived` | Soft state                                                                                                                                                                |
| `storage_metadata`          | S3 metadata JSONB                                                                                                                                                         |

---

### Intake (Issue Triage Queue)

#### `Intake`

A queue for collecting external requests before converting to issues.

- `is_default`: One default intake per project

#### `IntakeIssue`

Links an Intake to an Issue with triage status.

- `status`: `PENDING=-2`, `REJECTED=-1`, `SNOOZED=0`, `ACCEPTED=1`, `DUPLICATE=2`
- `snoozed_till`: Snooze deadline
- `duplicate_to`: FK → Issue (for duplicate resolution)

---

### Webhooks & API Tokens

#### `APIToken`

Programmatic access tokens.

- `user_type`: `0=Human`, `1=Bot`
- `is_service`: Service account flag
- `allowed_rate_limit`: Per-token rate limit override

#### `Webhook`

Outbound event notifications to external URLs.

- Boolean toggles per event type: `project`, `issue`, `module`, `cycle`, `issue_comment`
- `is_internal`: For Plane's own integrations
- Validated URL (no private IPs, custom domain blocklist)

#### `WebhookLog`

Delivery log with request/response headers and bodies, `retry_count`.

---

### Notifications

#### `Notification`

In-app notification record.

- `entity_identifier/name`: What triggered the notification
- `sender`: Who/what sent it
- `read_at`, `snoozed_till`, `archived_at`: State management
- `receiver`: FK → User

#### `UserNotificationPreference`

Granular opt-in/out per event type (property change, state change, comment, mention, issue completed) at global, workspace, or project level.

---

### Other Models

| Model                      | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `DraftIssue`               | Unsaved/draft work items (not yet published to a project)      |
| `Favorite`                 | User-bookmarked entities (issues, pages, views, cycles…)       |
| `Sticky`                   | Personal sticky notes per workspace                            |
| `UserRecentVisit`          | Tracks recently visited entities for quick navigation          |
| `AnalyticView`             | Saved analytics query definitions                              |
| `ExporterHistory`          | Export job records (JSON/CSV/XLSX)                             |
| `Importer`                 | Data import jobs (GitHub, Jira)                                |
| `Device` / `DeviceSession` | Login device tracking                                          |
| Integration models         | `GithubRepository`, `GithubRepositorySync`, `SlackProjectSync` |

---

## URL Structure

```
/api/          → plane.app.urls       (legacy app endpoints)
/api/public/   → plane.space.urls     (public/anonymous endpoints)
/api/instances/→ plane.license.urls   (instance management)
/api/v1/       → plane.api.urls       (primary REST API)
/auth/         → plane.authentication.urls
/              → plane.web.urls       (static/fallback)
```

### Authentication endpoints (`/auth/`)

| Pattern                                               | Purpose             |
| ----------------------------------------------------- | ------------------- |
| `sign-in/`, `sign-up/`                                | Email + password    |
| `spaces/sign-in/`, `spaces/sign-up/`                  | Public space auth   |
| `google/`, `github/`, `gitlab/`, `gitea/`             | OAuth initiation    |
| `google/callback/`, …                                 | OAuth callbacks     |
| `magic-generate/`, `magic-sign-in/`, `magic-sign-up/` | Magic link flow     |
| `forgot-password/`, `reset-password/<uid>/<token>/`   | Password reset      |
| `change-password/`, `set-password/`                   | Password management |
| `get-csrf-token/`                                     | CSRF token endpoint |

### REST API v1 (`/api/v1/`)

Organised by resource: `work-items`, `projects`, `cycles`, `modules`, `states`, `labels`, `members`, `assets`, `invites`, `intake`, `stickies`, `users`, `estimates`.

---

## Authentication System

**Session-based** — Django sessions stored in the custom `SessionStore` (database-backed with device tracking). Session cookie: httponly, secure, samesite, 7-day TTL.

**OAuth flow** (all providers follow the same pattern):

1. Frontend redirects to `/auth/<provider>/`
2. Django generates OAuth state and redirects to provider
3. Provider calls back to `/auth/<provider>/callback/`
4. Django adapter creates/updates User + Account records
5. Django creates a session and redirects to the frontend

**Magic link flow**:

1. Client POSTs email to `/auth/magic-generate/`
2. Server emails a one-time code
3. Client POSTs code to `/auth/magic-sign-in/`
4. Server validates, creates session

**API tokens**: Sent via `X-API-Key` header. Validated in `APITokenMiddleware`, rate-limited per token.

---

## Background Tasks (Celery)

### Configuration

- **Broker**: RabbitMQ (AMQP) — `AMQP_URL` or `RABBITMQ_*` vars
- **Result backend**: Redis
- **Serializer**: JSON
- **Scheduler**: `django-celery-beat` with `DatabaseScheduler`

### Periodic Tasks (Beat Schedule)

| Schedule    | Task                                | Purpose                                                    |
| ----------- | ----------------------------------- | ---------------------------------------------------------- |
| Every 5 min | `stack_email_notification`          | Batch and send email notifications                         |
| Every 6 hrs | `push_instance_metrics`             | Telemetry / analytics                                      |
| Daily 00:00 | `hard_delete`                       | Permanently delete soft-deleted records (60-day retention) |
| Daily 01:00 | `archive_and_close_old_issues`      | Auto-archive/close stale issues                            |
| Daily 01:30 | `delete_old_s3_link`                | Clean up expired export S3 links                           |
| Daily 02:00 | `delete_unuploaded_file_asset`      | Purge incomplete uploads                                   |
| Daily 02:30 | `delete_api_logs`                   | Prune API activity logs (14-day retention)                 |
| Daily 02:45 | `delete_email_notification_logs`    | Prune email logs (7-day retention)                         |
| Daily 03:00 | `delete_page_versions`              | Prune old page versions                                    |
| Daily 03:15 | `delete_issue_description_versions` | Prune issue description versions                           |
| Daily 03:30 | `delete_webhook_logs`               | Prune webhook delivery logs (14-day retention)             |

### Task Categories (`bgtasks/`)

| File                                | Purpose                              |
| ----------------------------------- | ------------------------------------ |
| `email_notification_task.py`        | Stack and send batched notifications |
| `issue_activities_task.py`          | Create IssueActivity records async   |
| `webhook_task.py`                   | Deliver webhook payloads with retry  |
| `notification_task.py`              | Create Notification records          |
| `event_tracking_task.py`            | PostHog analytics events             |
| `page_version_task.py`              | Save page version snapshots          |
| `issue_description_version_task.py` | Save issue description versions      |
| `issue_version_sync.py`             | Sync issue versions                  |
| `file_asset_task.py`                | S3 cleanup + metadata tasks          |
| `copy_s3_object.py`                 | Copy objects within S3               |
| `deletion_task.py`                  | Hard delete (soft-deleted records)   |
| `cleanup_task.py`                   | Log/version retention cleanup        |
| `issue_automation_task.py`          | Auto-archive/close issues            |
| `exporter_expired_task.py`          | Remove expired export files          |
| `recent_visited_task.py`            | Update recent visit records          |
| `workspace_seed_task.py`            | Seed default data for new workspaces |
| `forgot_password_task.py`           | Send password reset email            |
| `project_invitation_task.py`        | Send invitation email                |
| `user_activation_email_task.py`     | Send welcome email                   |
| `analytic_plot_export.py`           | Generate analytics export files      |

---

## Middleware Stack

Order (outermost → innermost):

1. `CorsMiddleware` — CORS headers
2. `SecurityMiddleware` — HTTPS redirects, HSTS
3. `WhiteNoise` — Static file serving
4. `SessionMiddleware` — Session handling
5. `CommonMiddleware` — URL normalisation
6. `CsrfViewMiddleware` — CSRF protection
7. `AuthenticationMiddleware` — Attaches `request.user`
8. `XFrameOptionsMiddleware` — Clickjacking protection
9. `CurrentRequestUserMiddleware` — Request context (via `crum`)
10. `GZipMiddleware` — Response compression
11. `RequestBodySizeLimitMiddleware` — Enforces `FILE_SIZE_LIMIT`
12. `APITokenLogMiddleware` — Logs API token requests
13. `RequestLoggerMiddleware` — Async request logging
14. `ReadReplicaRoutingMiddleware` _(optional)_ — Read replica routing

---

## Settings Overview

Key settings files:

- `settings/common.py` — All shared config (most of the configuration lives here)
- `settings/production.py` — Production-specific overrides
- `settings/local.py` — Local dev overrides
- `settings/storage.py` — Custom `S3Storage` backend
- `settings/redis.py` — Redis instance factory

Important settings values:

| Setting                           | Value / Source                                   |
| --------------------------------- | ------------------------------------------------ |
| `IS_SELF_MANAGED`                 | Always `True` in CE                              |
| `SESSION_ENGINE`                  | `plane.db.models.session`                        |
| `SESSION_COOKIE_AGE`              | 604800 (7 days)                                  |
| `HARD_DELETE_AFTER_DAYS`          | 60                                               |
| `API_ACTIVITY_LOG_RETENTION_DAYS` | 14                                               |
| `EMAIL_LOG_RETENTION_DAYS`        | 7                                                |
| `WEBHOOK_LOG_RETENTION_DAYS`      | 14                                               |
| Database routing                  | `ReadReplicaRouter` (if `ENABLE_READ_REPLICA=1`) |
| Default throttle                  | 30 req/min (anon), 60 req/min (API key)          |

---

## Rate Limiting

- Default DRF throttle: `AnonRateThrottle` — 30/minute
- Asset endpoint throttle: 5/minute
- API token throttle: configurable via `API_KEY_RATE_LIMIT` env var (default `60/minute`)
- Per-token override via `APIToken.allowed_rate_limit`
- Auth endpoints have their own throttles (in `authentication/rate_limit.py`)
