#!/usr/bin/env bash
#
# Build and publish the fork's 6 Docker images to Docker Hub.
#
# Tag convention: v<upstream version>-lonestone.<iteration>
# The upstream version is read from the root package.json — the same file the
# backend reads at startup to register `current_version` in the database
# (register_instance.py), so the image tag and the version the app reports stay
# aligned.
#
# Usage:
#   ./tools/release-lonestone.sh 1                 # build + push v1.3.1-lonestone.1
#   ./tools/release-lonestone.sh 2 --no-push       # build only
#   ./tools/release-lonestone.sh 2 --dry-run       # print commands, execute nothing
#   ./tools/release-lonestone.sh 1 --force         # overwrite an already published tag
#
# Configuration is per-machine and lives in tools/release.env (gitignored) or in
# the environment — nothing about one developer's setup is hardcoded here:
#   PLANE_REGISTRY_NS    required. Docker Hub namespace to push to.
#   PLANE_FORK_SUFFIX    optional, defaults to "lonestone".
#
# WARNING — VITE_* variables are frozen into the bundle at build time (web,
# admin and space apps). If deployment URLs change, retagging is NOT enough:
# fill in tools/release.env (see release.env.example) so they are passed as
# --build-arg.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# service|dockerfile|context
IMAGES=(
  "web|apps/web/Dockerfile.web|."
  "admin|apps/admin/Dockerfile.admin|."
  "space|apps/space/Dockerfile.space|."
  "live|apps/live/Dockerfile.live|."
  "backend|apps/api/Dockerfile.api|./apps/api"
  "proxy|apps/proxy/Dockerfile.ce|./apps/proxy"
)

die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m==>\033[0m %s\n' "$*"; }
ok() { printf '\033[32m  ok\033[0m %s\n' "$*"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*"; }

ITERATION=""
DO_PUSH=1
DRY_RUN=0
FORCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --no-push) DO_PUSH=0 ;;
    --dry-run) DRY_RUN=1 ;;
    --force)   FORCE=1 ;;
    # Print the header block, however long it is — no line numbers to drift
    -h|--help) awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "$0"; exit 0 ;;
    -*)        die "unknown option: $1" ;;
    *)         [ -z "$ITERATION" ] || die "iteration already provided ($ITERATION)"; ITERATION="$1" ;;
  esac
  shift
done

[ -n "$ITERATION" ] || die "missing iteration. Usage: $0 <iteration> [--no-push] [--dry-run] [--force]"
[[ "$ITERATION" =~ ^[0-9]+$ ]] || die "iteration must be an integer, got: $ITERATION"

cd "$REPO_ROOT"

# --- per-machine configuration ----------------------------------------------
# tools/release.env is gitignored: it holds this machine's registry namespace and
# any VITE_* overrides. Environment variables win over the file.
BUILD_ARGS=()
if [ -f tools/release.env ]; then
  info "reading tools/release.env"
  while IFS='=' read -r key value; do
    key="${key%"${key##*[![:space:]]}"}"          # trim trailing space
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [ -z "$key" ] && continue
    case "$key" in
      VITE_*)  BUILD_ARGS+=(--build-arg "${key}=${value}") ;;
      PLANE_*) [ -z "${!key:-}" ] && export "$key=$value" ;;
      *)       printf '\033[33mwarning:\033[0m ignoring unknown key in release.env: %s\n' "$key" ;;
    esac
  done < tools/release.env
fi

REGISTRY_NS="${PLANE_REGISTRY_NS:-}"
FORK_SUFFIX="${PLANE_FORK_SUFFIX:-lonestone}"

[ -n "$REGISTRY_NS" ] || die "PLANE_REGISTRY_NS is not set.
  Set the Docker Hub namespace to push to, either in the environment or in
  tools/release.env (copy tools/release.env.example to start).
  Example:  PLANE_REGISTRY_NS=my-org"

# Each variable contributes two array elements: "--build-arg" and "KEY=VALUE"
[ ${#BUILD_ARGS[@]} -gt 0 ] && info "$(( ${#BUILD_ARGS[@]} / 2 )) VITE_* override(s) will be passed as --build-arg"

# --- upstream version -------------------------------------------------------
[ -f package.json ] || die "package.json not found at repo root"
VERSION="$(python3 -c 'import json;print(json.load(open("package.json"))["version"])')"
[ -n "$VERSION" ] || die "could not read version from package.json"
TAG="v${VERSION}-${FORK_SUFFIX}.${ITERATION}"

# --- guardrails -------------------------------------------------------------
info "release $TAG  (upstream $VERSION, iteration $ITERATION)"

# --porcelain also reports untracked files, which still land in the build context
if [ -n "$(git status --porcelain)" ]; then
  printf '\033[33mwarning:\033[0m working tree is dirty — the image will not match any commit\n'
  git status --porcelain | sed 's/^/           /' | head -10
fi
GIT_SHA="$(git rev-parse --short HEAD)"
echo "  commit: $GIT_SHA"
echo "  images: ${#IMAGES[@]}"

if [ "$DO_PUSH" -eq 1 ] && [ "$DRY_RUN" -eq 0 ] && [ "$FORCE" -eq 0 ]; then
  info "checking that $TAG is not already published"
  for entry in "${IMAGES[@]}"; do
    name="${entry%%|*}"
    if docker manifest inspect "${REGISTRY_NS}/plane-${name}:${TAG}" >/dev/null 2>&1; then
      die "${REGISTRY_NS}/plane-${name}:${TAG} already exists in the registry. Bump the iteration, or use --force to overwrite."
    fi
  done
  ok "tag available"
fi

run() {
  if [ "$DRY_RUN" -eq 1 ]; then printf '  \033[90m%s\033[0m\n' "$*"; else "$@"; fi
}

# --- build ------------------------------------------------------------------
for entry in "${IMAGES[@]}"; do
  IFS='|' read -r name dockerfile context <<< "$entry"
  image="${REGISTRY_NS}/plane-${name}:${TAG}"
  info "build $image"
  run docker build -f "$dockerfile" -t "$image" "${BUILD_ARGS[@]}" "$context" \
    || die "build failed for plane-${name}"
  ok "$image"
done

# --- push -------------------------------------------------------------------
if [ "$DO_PUSH" -eq 1 ]; then
  for entry in "${IMAGES[@]}"; do
    name="${entry%%|*}"
    image="${REGISTRY_NS}/plane-${name}:${TAG}"
    info "push $image"
    run docker push "$image" || die "push failed for plane-${name}"
    ok "$image"
  done
else
  info "push skipped (--no-push)"
fi

# --- summary ----------------------------------------------------------------
echo
info "release $TAG complete (commit $GIT_SHA)"
if [ "$DO_PUSH" -eq 1 ] && [ "$DRY_RUN" -eq 0 ]; then
  printf '%-32s %s\n' "IMAGE" "DIGEST"
  for entry in "${IMAGES[@]}"; do
    name="${entry%%|*}"
    image="${REGISTRY_NS}/plane-${name}:${TAG}"
    digest="$(docker inspect --format '{{range .RepoDigests}}{{.}} {{end}}' "$image" 2>/dev/null \
      | grep -oE 'sha256:[a-f0-9]{12}' | head -1)"
    printf '%-32s %s\n' "plane-${name}" "${digest:-?}"
  done
fi
