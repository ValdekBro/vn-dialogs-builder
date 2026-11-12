import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ExportFile, getAuthor } from "@vn/core";
import { t } from "../src/renderer/src/strings/uk";
import { expect, test } from "./support/app";
import { lastTram, prologue } from "./support/seeds";

/** Projects: first launch, autosave, export and import (FLOWS.md, 15). */

test("E1 first launch: create a project, its canvas opens with the Author", async ({ vn }) => {
  const { page } = vn;
  await expect(page.getByRole("heading", { name: t.projects.title })).toBeVisible();
  await expect(page.getByText(t.projects.empty)).toBeVisible();

  await page.getByRole("button", { name: t.projects.create }).click();
  await page.getByLabel(t.projects.namePlaceholder).fill("Ранок у селі");
  await page.getByRole("button", { name: t.projects.createConfirm }).click();

  await expect(vn.topBar.switcher()).toHaveText("Ранок у селі");
  await expect(page.getByRole("textbox", { name: t.scenes.name })).toHaveValue(t.scenes.defaultName(1));
  await expect(vn.canvas.addFirst()).toBeVisible();
  const project = await vn.project();
  expect(getAuthor(project).name).toBe("Автор");
});

test.describe("with a seeded project", () => {
  test.use({ launch: { seed: [lastTram()] } });

  test("E15 autosave: changes survive a restart, and the last project opens again", async ({ vn }) => {
    await expect(vn.topBar.switcher()).toHaveText("Останній трамвай");
    const block = vn.canvas.blockWithText("Сідайте швидше");
    await block.getByText("Сідайте швидше, це останній на сьогодні.").dblclick();
    const editor = vn.draft.line();
    await editor.fill("Сідайте швидше, це останній на сьогодні. Наступний аж о п'ятій.");
    await editor.press("Enter");
    await expect(vn.topBar.saved()).toBeVisible();

    const again = await vn.restart();
    await expect(again.topBar.switcher()).toHaveText("Останній трамвай");
    await expect(again.canvas.blockWithText("Наступний аж о п'ятій.")).toBeVisible();
  });

  test("E17 export and import: the file passes the schema, import creates the same project", async ({ vn }) => {
    const file = join(vn.dataDir, "Останній трамвай.json");
    await vn.stubSaveDialog(file);
    await vn.topBar.exportButton().click();
    await expect(vn.toast(t.transfer.exported("Останній трамвай.json"))).toBeVisible();
    const exported = ExportFile.parse(JSON.parse(await readFile(file, "utf8")));
    expect(exported.scenes[0]!.blocks.map((b) => b.lines[0]!.text)).toEqual([
      "[Північ. Останній трамвай повільно під'їжджає до зупинки]",
      "Сідайте швидше, це останній на сьогодні.",
    ]);
    const original = await vn.project();

    await vn.topBar.switcher().click();
    await vn.page.getByRole("menuitem", { name: t.projects.allProjects }).click();
    await vn.stubOpenDialog(file);
    await vn.page.getByRole("button", { name: t.transfer.import }).click();
    await expect(vn.toast(t.transfer.imported("Останній трамвай (імпорт)"))).toBeVisible();
    await expect(vn.topBar.switcher()).toHaveText("Останній трамвай (імпорт)");

    const imported = await vn.project();
    expect(imported.id).not.toBe(original.id);
    const texts = (p: typeof imported) => Object.values(p.scenes).flatMap((s) => Object.values(s.blocks).flatMap((b) => b.lines.map((l) => l.text))).sort();
    expect(texts(imported)).toEqual(texts(original));
    await expect(vn.canvas.blockWithText("Сідайте швидше")).toBeVisible();
  });

  test("E17 a broken file is rejected with a clear message, nothing is created", async ({ vn }) => {
    const bad = join(vn.dataDir, "чужий файл.json");
    await writeFile(bad, JSON.stringify({ format: "vn-dialogs-builder.export", version: 999 }));
    await vn.topBar.switcher().click();
    await vn.page.getByRole("menuitem", { name: t.projects.allProjects }).click();
    await vn.stubOpenDialog(bad);
    await vn.page.getByRole("button", { name: t.transfer.import }).click();
    await expect(vn.toast(t.transfer.errors.IMPORT_TOO_NEW!)).toBeVisible();
    await expect(vn.page.locator('[data-testid^="project-"]')).toHaveCount(1);
  });
});

test.describe("with the prologue", () => {
  test.use({ launch: { seed: [prologue()] } });

  test("E15 the last open scene opens again after a restart", async ({ vn }) => {
    const project = await vn.project();
    const well = project.sceneOrder[1]!;
    await vn.page.getByTestId(`scene-${well}`).click();
    await expect(vn.page.getByRole("textbox", { name: t.scenes.name })).toHaveValue("Біля криниці");
    // The choice is written to settings.json; wait for it before closing.
    await expect.poll(async () => JSON.parse(await readFile(join(vn.dataDir, "settings.json"), "utf8")).lastScenes?.[project.id]).toBe(well);

    const again = await vn.restart();
    await expect(again.page.getByRole("textbox", { name: t.scenes.name })).toHaveValue("Біля криниці");
  });
});
