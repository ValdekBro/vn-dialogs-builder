#!/usr/bin/env node
// Випуск нової версії (ARCHITECTURE.md, «Оновлення»): `pnpm release 0.2.0`.
// Потрібен розділ версії в CHANGELOG.md (він стане описом релізу).
// Піднімає версію, комітить, ставить тег vX.Y.Z і пушить. Далі все робить GitHub Actions
// (.github/workflows/release.yml): тести, збірка інсталятора, публікація релізу.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { changelogSection } from "./changelog.mjs";

const version = process.argv[2]?.replace(/^v/, "");
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Використання: pnpm release <версія>, наприклад: pnpm release 0.2.0");
  process.exit(1);
}
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

// Опис релізу береться з CHANGELOG.md: без розділу нової версії реліз не випускаємо.
if (!changelogSection(version)) {
  console.error(`Спершу додайте в CHANGELOG.md розділ "## [${version}] — <дата>" зі змінами цієї версії.`);
  process.exit(1);
}

if (git("status", "--porcelain")) {
  console.error("Є незакомічені зміни. Спершу закомітьте їх.");
  process.exit(1);
}
const tag = `v${version}`;
if (git("tag", "--list", tag)) {
  console.error(`Тег ${tag} вже існує.`);
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
console.log(`Готово: ${tag} відправлено. Збірку видно на https://github.com/ValdekBro/vn-dialogs-builder/actions`);
