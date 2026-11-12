#!/usr/bin/env node
// Releases a new version (ARCHITECTURE.md, "Updates"): `pnpm release 0.2.0`.
// Requires the version's section in CHANGELOG.md (it becomes the release notes).
// Bumps the version, commits, tags vX.Y.Z and pushes. GitHub Actions does the rest
// (.github/workflows/release.yml): tests, installer builds, publishing the release.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { changelogSection } from "./changelog.mjs";

const version = process.argv[2]?.replace(/^v/, "");
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: pnpm release <version>, e.g.: pnpm release 0.2.0");
  process.exit(1);
}
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

// Release notes come from CHANGELOG.md: no section for the new version, no release.
if (!changelogSection(version)) {
  console.error(`First add a "## [${version}] — <date>" section with this version's changes to CHANGELOG.md.`);
  process.exit(1);
}

if (git("status", "--porcelain")) {
  console.error("There are uncommitted changes. Commit them first.");
  process.exit(1);
}
const tag = `v${version}`;
if (git("tag", "--list", tag)) {
  console.error(`Tag ${tag} already exists.`);
  process.exit(1);
}

for (const file of ["package.json", "apps/desktop/package.json"]) {
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  pkg.version = version;
  writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
}

git("add", "package.json", "apps/desktop/package.json");
git("commit", "-m", `Release ${tag}`);
git("tag", tag);
git("push", "origin", "HEAD");
git("push", "origin", tag);
console.log(`Done: ${tag} pushed. See the build at https://github.com/ValdekBro/vn-dialogs-builder/actions`);
