#!/usr/bin/env node
// Розділ CHANGELOG.md для версії: `node scripts/changelog.mjs 0.3.0` друкує текст під `## [0.3.0]`
// (без заголовка) — це опис релізу на GitHub. Немає розділу або він порожній — помилка.
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
    console.error(`У CHANGELOG.md немає розділу "## [${version}]" з описом змін.`);
    process.exit(1);
  }
  console.log(body);
}
