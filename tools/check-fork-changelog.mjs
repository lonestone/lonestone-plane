#!/usr/bin/env node
/**
 * Checks FORK_CHANGELOG.md against the repository.
 *
 *   node tools/check-fork-changelog.mjs --staged         pre-commit: every staged upstream file is listed
 *   node tools/check-fork-changelog.mjs [--base <ref>]   audit against upstream (default base: upstream/preview)
 *
 * "Upstream files" are all files outside the fork folders (FORK_OWNED below). The audit:
 * - fails when an upstream file differs from upstream without a row in "Upstream files touched",
 *   or when a row's file no longer differs;
 * - warns about listed files and "Upstream dependencies" that upstream changed since the
 *   "Last upstream sync" commit: they must be re-checked when merging upstream.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CHANGELOG = "FORK_CHANGELOG.md";
const FILES_SECTION = "## Upstream files touched";
const DEPENDENCIES_SECTION = "## Upstream dependencies";
const SYNC_PATTERN = /\*\*Last upstream sync\*\*:[^`]*`([0-9a-f]{7,40})`/;

// Folders and files that only the fork has. Everything else is upstream code.
const FORK_OWNED = [
  "apps/web/oe/",
  "apps/api/plane/extended/",
  "docs/architecture/",
  "tools/",
  "deployments/lonestone/",
  "docker-compose.lonestone.yml",
  "apps/web-e2e/",
  "docker-compose-e2e.yml",
  ".claude/skills/start-feature/",
  ".claude/skills/plane-feature-check/",
  CHANGELOG,
];
const isUpstreamFile = (file) => !FORK_OWNED.some((owned) => file === owned || file.startsWith(owned));

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
// For lookups that may fail (a path missing on one side): git's error output is not shown.
const tryGit = (...args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};
const lines = (output) => (output ? output.split("\n").filter(Boolean) : []);

const args = process.argv.slice(2);
const stagedMode = args.includes("--staged");
// In pre-commit, read the changelog as it will be committed (index), not the working tree: a row added
// to the file but not staged must not let the commit through.
const changelog = (stagedMode && tryGit("show", `:${CHANGELOG}`)) || readFileSync(CHANGELOG, "utf8");

// Paths in the first column of the tables of a "## " section (all its sub-sections included).
function tablePaths(title) {
  const start = changelog.indexOf(title);
  if (start === -1) throw new Error(`${CHANGELOG}: section "${title}" not found`);
  const end = changelog.indexOf("\n## ", start + title.length);
  const section = changelog.slice(start, end === -1 ? undefined : end);
  return new Set([...section.matchAll(/^\|\s*`([^`]+)`/gm)].map((match) => match[1]));
}

function report(level, title, files, hint) {
  const print = level === "error" ? console.error : console.warn;
  print(`\n${level === "error" ? "✖" : "⚠"} ${title}\n${files.map((file) => `  - ${file}`).join("\n")}\n\n${hint}\n`);
  if (level === "error") process.exitCode = 1;
}

const listed = tablePaths(FILES_SECTION);

if (stagedMode) {
  // With an upstream remote, a file staged back to its upstream content no longer needs a row.
  const upstreamBase = tryGit("rev-parse", "--verify", "-q", "upstream/preview")
    ? tryGit("merge-base", "HEAD", "upstream/preview")
    : null;
  const staged = lines(git("diff", "--cached", "--name-only", "--diff-filter=ACMRD")).filter(isUpstreamFile);
  const missing = staged.filter((file) => {
    if (listed.has(file)) return false;
    if (!upstreamBase) return true;
    return tryGit("rev-parse", `:${file}`) !== tryGit("rev-parse", `${upstreamBase}:${file}`);
  });
  if (missing.length > 0) {
    report(
      "error",
      `${CHANGELOG}: staged upstream files are not listed in "${FILES_SECTION}"`,
      missing,
      `Add one row per file under its feature, then stage ${CHANGELOG}. See AGENTS.md ("Touching upstream code").`
    );
  }
} else {
  const baseIndex = args.indexOf("--base");
  const base = baseIndex === -1 ? "upstream/preview" : args[baseIndex + 1];
  if (!tryGit("rev-parse", "--verify", "-q", base)) {
    console.error(`Base ref "${base}" not found. Run: git fetch upstream preview`);
    process.exit(2);
  }
  const mergeBase = git("merge-base", "HEAD", base);

  // Working tree and index against upstream, so that uncommitted and staged work is checked too.
  // Untracked files are ignored until they are staged (local files must not need a row).
  const changed = new Set(
    [
      ...lines(git("diff", "--name-only", mergeBase)),
      ...lines(git("diff", "--cached", "--name-only", mergeBase)),
    ].filter(isUpstreamFile)
  );
  const missing = [...changed].filter((file) => !listed.has(file)).toSorted();
  const stale = [...listed].filter((file) => !changed.has(file)).toSorted();
  if (missing.length > 0) {
    report(
      "error",
      `${CHANGELOG}: upstream files that differ from ${base} are not listed`,
      missing,
      "Add one row per file under its feature."
    );
  }
  if (stale.length > 0) {
    report(
      "error",
      `${CHANGELOG}: listed files no longer differ from ${base}`,
      stale,
      "Remove their rows (or the file was renamed upstream: update the path)."
    );
  }

  // Upstream changes since the last reviewed sync, on files the fork touches or relies on.
  const lastSync = changelog.match(SYNC_PATTERN)?.[1];
  if (!lastSync || !tryGit("rev-parse", "--verify", "-q", `${lastSync}^{commit}`)) {
    report(
      "error",
      `${CHANGELOG}: "Last upstream sync" commit not found`,
      [lastSync ?? "(missing)"],
      "Set it to the upstream commit last merged and reviewed."
    );
  } else {
    const watched = [...listed, ...tablePaths(DEPENDENCIES_SECTION)];
    const upstreamChanged = new Set(lines(git("diff", "--name-only", lastSync, base, "--", ...watched)));
    const toRecheck = watched.filter((file) => upstreamChanged.has(file)).toSorted();
    if (toRecheck.length > 0) {
      report(
        "warning",
        `Upstream changed these files since the last sync (${lastSync}): re-check the fork code that touches or relies on them`,
        [...new Set(toRecheck)],
        `After the review, set "Last upstream sync" to the merged upstream commit.`
      );
    }
    const mergedBase = git("rev-parse", "--short", mergeBase);
    if (!git("rev-parse", mergeBase).startsWith(lastSync)) {
      console.warn(`⚠ The branch is based on upstream ${mergedBase}, but "Last upstream sync" says ${lastSync}.`);
    }
  }
  if (!process.exitCode) console.log(`✔ ${CHANGELOG}: ${changed.size} upstream files, all listed.`);
}
