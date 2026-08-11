# Invite Lonestone clients as collaborating guests

Use this when a client needs backlog visibility and work-item CRUD on **one** project, without org admin access or other clients’ projects.

## Setup

1. Invite the client as a **Workspace Guest** (not Member).
2. Add them to the client project only as a **Project Guest**.
3. In **Project settings → Members**:
   - Enable **Guest access** (`guest_view_all_features`) so they see the full backlog.
   - Enable **Allow guests to collaborate** (`guest_can_collaborate`) so they can create/edit work items and open Cycles/Modules.

## What they can do

- Create and update work items in that project.
- Delete work items they created (same rule as Members).
- Open Cycles/Modules and attach/detach work items.
- Comment on visible work items.

## What they cannot do

- Change workspace / organization settings.
- Create or delete Cycles/Modules themselves.
- Access projects they were not added to.
- Be promoted to Project Member while remaining a Workspace Guest (role ceiling).

## Anti-pattern

Do **not** invite clients as Workspace/Project Members just to unlock editing — that widens org surfaces and makes multi-client confidentiality harder to reason about.
