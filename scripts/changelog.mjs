#!/usr/bin/env node
// The CHANGELOG.md section for a version: `node scripts/changelog.mjs 0.3.0` prints the text under `## [0.3.0]`
// (without the heading) — that is the GitHub release notes. A missing or empty section is an error.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function changelogSection(version, text = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8")) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  const body = lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
  return body || null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv[2]?.replace(/^v/, "");
  const body = version && changelogSection(version);
  if (!body) {
    console.error(`CHANGELOG.md has no "## [${version}]" section describing the changes.`);
    process.exit(1);
  }
  console.log(body);
}
