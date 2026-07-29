#!/usr/bin/env bash
#
# Merge the official Plane repository into this fork.
#
# Implements the procedure from docs/architecture/fork-maintenance.md
# ("Recommended Upstream Merge Procedure"), with guardrails added so a failed
# step stops the run instead of leaving a half-merged tree behind.
#
# Usage:
#   ./tools/sync-upstream.sh                  # fetch + merge into a sync branch, then run checks
#   ./tools/sync-upstream.sh --dry-run        # show what would be merged, change nothing
#   ./tools/sync-upstream.sh --no-checks      # merge only, skip type-check / build
#   ./tools/sync-upstream.sh --onto preview   # merge directly into preview instead of a sync branch
#
# Default behaviour merges into a throwaway branch `sync/upstream-<date>` rather
# than straight into preview, so an ugly merge can be abandoned with a simple
# `git checkout preview && git branch -D sync/...`.
#
# NEVER rebase preview onto upstream — always merge. Rebasing rewrites history
# and makes every subsequent sync worse (fork-maintenance.md, "Branching model").

set -euo pipefail

UPSTREAM_REMOTE="upstream"
UPSTREAM_URL="https://github.com/makeplane/plane.git"
UPSTREAM_BRANCH="preview"
INTEGRATION_BRANCH="preview"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m==>\033[0m %s\n' "$*"; }
ok() { printf '\033[32m  ok\033[0m %s\n' "$*"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*"; }

DRY_RUN=0
RUN_CHECKS=1
TARGET_BRANCH=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)   DRY_RUN=1 ;;
    --no-checks) RUN_CHECKS=0 ;;
    --onto)      shift; [ $# -gt 0 ] || die "--onto requires a branch name"; TARGET_BRANCH="$1" ;;
    -h|--help)   sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)           die "unknown option: $1" ;;
  esac
  shift
done

cd "$REPO_ROOT"

# --- preconditions ----------------------------------------------------------
[ -n "$(git status --porcelain)" ] && die "working tree is dirty — commit or stash first, a merge needs a clean tree"

if ! git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  # Added even under --dry-run: a remote is a read-only config entry, and the
  # fetch below cannot work without it. Remove with: git remote remove upstream
  info "remote '$UPSTREAM_REMOTE' missing — adding $UPSTREAM_URL"
  git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
  ok "remote added (read-only config; --dry-run still changes no files)"
fi

# --- 1. fetch upstream ------------------------------------------------------
info "fetching $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH" --tags
UPSTREAM_SHA="$(git rev-parse --short "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")"
ok "upstream is at $UPSTREAM_SHA"

# --- what would change ------------------------------------------------------
BASE="$(git merge-base HEAD "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")"
BEHIND="$(git rev-list --count "HEAD..$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")"
AHEAD="$(git rev-list --count "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH..HEAD")"

info "divergence: $BEHIND commit(s) behind upstream, $AHEAD local commit(s) ahead"
if [ "$BEHIND" -eq 0 ]; then
  ok "already up to date with upstream — nothing to merge"
  exit 0
fi

echo
info "files upstream touched that this fork has also modified (likely conflicts)"
UPSTREAM_FILES="$(git diff --name-only "$BASE" "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")"
LOCAL_FILES="$(git diff --name-only "$BASE" HEAD)"
OVERLAP="$(comm -12 <(echo "$UPSTREAM_FILES" | sort) <(echo "$LOCAL_FILES" | sort) || true)"
if [ -z "$OVERLAP" ]; then
  ok "none — the fork's changes do not overlap with upstream's"
else
  echo "$OVERLAP" | sed 's/^/     /'
  warn "$(echo "$OVERLAP" | wc -l) file(s) changed on both sides"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo
  info "dry run — stopping before the merge"
  info "upstream commits that would land:"
  git log --oneline --no-decorate "HEAD..$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" | head -20 | sed 's/^/     /'
  exit 0
fi

# --- 2. merge ---------------------------------------------------------------
if [ -n "$TARGET_BRANCH" ]; then
  info "checking out $TARGET_BRANCH (--onto)"
  git checkout "$TARGET_BRANCH"
else
  # git has no Date.now() problem here — the date is only a branch label
  SYNC_BRANCH="sync/upstream-$(date +%Y-%m-%d)"
  info "creating $SYNC_BRANCH from $INTEGRATION_BRANCH"
  git checkout "$INTEGRATION_BRANCH"
  git checkout -B "$SYNC_BRANCH"
  TARGET_BRANCH="$SYNC_BRANCH"
fi

info "merging $UPSTREAM_REMOTE/$UPSTREAM_BRANCH into $TARGET_BRANCH"
if git merge "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" --no-edit; then
  ok "merged cleanly"
  MERGE_CONFLICTS=0
else
  MERGE_CONFLICTS=1
  warn "merge stopped with conflicts:"
  git diff --name-only --diff-filter=U | sed 's/^/     /'
  echo
  info "pnpm-lock.yaml conflicts are expected on every sync — resolve with:"
  echo "     git checkout --theirs pnpm-lock.yaml && pnpm install && git add pnpm-lock.yaml"
  echo
  die "resolve the conflicts above, 'git add' them, then run: git commit && ./tools/sync-upstream.sh --no-checks"
fi

# --- 3..7. post-merge checks ------------------------------------------------
if [ "$RUN_CHECKS" -eq 0 ]; then
  info "checks skipped (--no-checks)"
else
  FAILED=()

  info "installing dependencies (lockfile may have moved)"
  pnpm install --frozen-lockfile || { warn "pnpm install failed"; FAILED+=("pnpm install"); }

  info "type check"
  pnpm check:types || { warn "type check failed"; FAILED+=("check:types"); }

  info "build"
  pnpm build || { warn "build failed"; FAILED+=("build"); }

  info "upstream changes to ce/ — review these against your own edition layer"
  git diff "$BASE" "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" -- apps/web/ce/ --stat | tail -20 | sed 's/^/     /'

  info "Django migrations added upstream"
  git diff --name-only --diff-filter=A "$BASE" "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" \
    -- 'apps/api/plane/**/migrations/*.py' | sed 's/^/     /' || true

  if [ ${#FAILED[@]} -gt 0 ]; then
    echo
    die "post-merge checks failed: ${FAILED[*]} — the merge commit exists on $TARGET_BRANCH, fix before merging into $INTEGRATION_BRANCH"
  fi
  ok "all checks passed"
fi

# --- summary ----------------------------------------------------------------
echo
info "sync complete"
echo "  branch          : $TARGET_BRANCH"
echo "  upstream commit : $UPSTREAM_SHA"
echo "  commits merged  : $BEHIND"
echo "  conflicts       : $([ "$MERGE_CONFLICTS" -eq 0 ] && echo none || echo resolved)"
echo
info "next steps"
echo "  1. review the diff, run the app"
echo "  2. git checkout $INTEGRATION_BRANCH && git merge $TARGET_BRANCH"
echo "  3. ./tools/release-lonestone.sh <iteration>   # rebuild images from the new upstream"
