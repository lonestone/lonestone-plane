---
name: plane-feature-check
description: Step 1 of the start-feature skill; also usable alone. Run FIRST, before any spec, plan or code, whenever a new feature, specification, user story, epic or product change is requested (EN or FR — "feature", "fonctionnalité", "spec", "spécification", "implement", "ajouter la possibilité de…"). Checks whether the feature exists in Plane (Community Edition or a paid plan), reports where to plug it in, and explains that the project does not build features Plane does not offer.
user_invocable: true
---

# Plane Feature Check

This repository is a fork of Plane. Before specifying or building a feature, find out whether Plane already has it, in the free Community Edition or in a paid plan (Pro, Business, Enterprise). The answer decides how to build it, or whether to build it at all.

**Project direction:** for now, the fork only builds features that exist in Plane, mostly paid-plan features brought to the self-hosted Community Edition. It does not create features that Plane does not have. Every such feature must be carried alone through each upstream merge, and may clash with what Plane ships later.

## When to run

Before writing a spec, a plan or code for any new user-facing capability. Skip it for bug fixes, refactors, tooling and documentation, and when this check already ran for the same feature in the session.

## Workflow

### 1. Restate the feature

Write one sentence describing the capability from the user's point of view (e.g. "select several work items and change their state at once"). List 3–5 search terms in English, including Plane's vocabulary: work item (formerly issue), cycle, module, intake, page, project view.

### 2. Search the code first

Paid features leave traces in the Community Edition. Search `apps/web/core/`, `apps/web/ce/`, `packages/` and `apps/api/plane/`:

- **Upgrade placeholders**: components named `*Upgrade*`, `*Banner*`, `*Placeholder*`, empty states that mention a plan (`grep -ri "upgrade" apps/web/ce apps/web/core --include=*.tsx`).
- **Disabled hooks**: hooks hard-coded to `false` or `null` (e.g. `useBulkOperationStatus = () => false`).
- **Dead API calls**: services calling routes that the backend does not define (compare `apps/web/core/services/` with `apps/api/plane/app/urls/`).
- **The placeholder map**: `docs/architecture/placeholder-map.md` lists the known CE placeholders and what replaces them.
- **Fork code**: `apps/web/oe/` and `apps/api/plane/extended/` — the fork may already have it.

### 3. Check Plane's public sources

Use WebFetch / WebSearch:

1. **Plan comparison** — <https://plane.so/pricing>, section "Feature comparison". The reference for which plan offers what (Free, Pro, Business, Enterprise).
2. **User docs** — <https://docs.plane.so/> (search `site:docs.plane.so <term>`). How the feature behaves; the reference for UX.
3. **Developer docs** — <https://developers.plane.so/> for the API shape of the feature.
4. **Changelog** — <https://plane.so/changelog> (Cloud and Self-hosted tabs) to date the feature and see its scope.

### 4. Report the verdict

Give one of these verdicts, with the sources (file paths and URLs):

| Verdict                  | Meaning                               | Next step                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **In Community Edition** | Plane already does it for free        | Do not rebuild it. Check the user's need again: configuration, or a small extension?                                                                                                                                                                                                                      |
| **Paid plan only**       | Exists in Pro / Business / Enterprise | Build it in the fork, mirroring Plane's paid behaviour and UX from the docs. Plug into the CE placeholder found in step 2, and list every upstream file it touches in `FORK_CHANGELOG.md` (swap only the placeholder, see "Keeping upstream changes minimal" in `docs/architecture/fork-maintenance.md`). |
| **Not in Plane**         | No plan offers it                     | **Stop** and explain the project direction (step 5).                                                                                                                                                                                                                                                      |
| **Unclear**              | Sources disagree or say nothing       | Say what was found and treat it as **Not in Plane** until shown otherwise (step 5).                                                                                                                                                                                                                       |

Also state the gap if the fork version would differ from the paid one (fewer properties, different behaviour).

### 5. Features Plane does not offer

When the verdict is **Not in Plane** or **Unclear**, do not write a spec, a plan or code. Tell the user:

- that the project direction, for now, is not to create features that Plane does not offer;
- the closest existing Plane feature, if any, and whether the need can be met with it;
- what building it would cost: the upstream files it would touch, and the risk of clashing with a future Plane feature.

If the user still decides to build it, it is an exception to the project direction. It must be documented in `FORK_CHANGELOG.md`, section "Features not in Plane", in a dedicated entry (template at the end of that file) that says the feature does not exist in Plane, why it was built anyway, who decided it and when, and which upstream files it touches. Write that entry as part of the feature, not afterwards.

## Output format

```
Plane feature check: <feature>
Verdict: <In Community Edition | Paid plan only (<plans>) | Not in Plane | Unclear>
Direction: <fits the project | outside the project direction: changelog entry required if built>
Code traces: <paths, or "none">
Sources: <URLs>
Plug-in point: <placeholder / hook / none>
Gaps vs Plane: <differences, or "none">
```
