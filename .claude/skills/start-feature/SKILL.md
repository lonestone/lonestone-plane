---
name: start-feature
description: Entry point for any new feature in this fork. Use when the user starts a feature (`/start-feature <description>`, "start a feature", "nouvelle fonctionnalité", "on attaque la feature…"). Runs the Plane feature check, creates the branch, prepares FORK_CHANGELOG.md, finds the upstream extension points and plans the tests before any spec or code.
user_invocable: true
---

# Start a feature

This repository is a fork of Plane that must stay close to upstream. Every new feature starts here, so that the checks happen before any spec, plan or code. Run the steps in order and stop where a step says so.

## 1. Check that Plane offers the feature

Run the `plane-feature-check` skill on the requested feature and report its verdict.

- **In Community Edition**: stop. Plane already does it; discuss the need with the user (configuration, small extension).
- **Not in Plane** or **Unclear**: stop and explain the project direction, as the skill says. Continue only if the user decides to build it anyway, and draft its entry in `FORK_CHANGELOG.md` ("Features not in Plane"): who decided, when, why, closest Plane feature.
- **Paid plan only**: continue. Plane's paid behaviour, from its docs, is the reference for the UX.

## 2. Create the branch

Use the `branch-name` skill: `feat/<work-item-id>-<short-description>`, from an up-to-date `origin/preview`. Ask for the Plane work item ID if the user did not give one; do not invent it.

## 3. Prepare FORK_CHANGELOG.md

- Add the feature to the "Features" table: name with its work item ID, pull request (to fill in later), Plane equivalent from step 1, docs (to fill in later).
- Add its sub-section, at the end, under "Upstream files touched" and under "Upstream dependencies". Rows are added as the work goes: the pre-commit hook blocks a commit that stages an unlisted upstream file.

## 4. Find the extension points

Before writing code, list where the feature plugs into upstream, in this order of preference:

1. A CE placeholder or `@/plane-web/*` import (found in step 1, or in `docs/architecture/placeholder-map.md`).
2. Public store methods and services that `apps/web/oe/` can call (prefer upstream's local updates for optimistic changes).
3. As a last resort, one line in an upstream file that renders fork code.

Report to the user the upstream files the feature would modify, and the upstream code it would rely on without modifying it. Wait for their agreement before writing code: this is the feature's upstream footprint.

## 5. Plan the tests

Before writing code, list the tests the feature needs, following "Testing" in `docs/architecture/fork-maintenance.md`:

- **Backend**: the unit tests and the contract tests of each `/api/extended/` route (permissions, validation errors, all or nothing behaviour).
- **Frontend**: the user paths to cover end to end in `apps/web-e2e/`, and the accessible locators they rely on (role, label). Plan no `data-testid` in upstream files.

Report the list to the user with the extension points.

## 6. Recall the rules for the rest of the work

Point to "Keeping upstream changes minimal" and "Testing" in `docs/architecture/fork-maintenance.md`, and to its checklist before opening a pull request. If the user works with Spec Kit locally, continue with `/speckit-specify`.

## Output

```
Feature: <name> (<work item ID>)
Plane check: <verdict, plans, sources>
Branch: <branch name>
Extension points: <placeholders, store methods, services>
Upstream footprint: <files to modify / files relied on, or "none">
Tests: <unit and contract tests / e2e user paths>
Next: <spec, plan, or code>
```
