import type { Project } from "@vn/core";
import { t } from "../src/renderer/src/strings/uk";
import { expect, test, type VnApp } from "./support/app";

/** Building a dialogue on the canvas (FLOWS.md, 3–6 and 0). */

/** Creates a project through the UI and returns the opened app. */
async function newProject(vn: VnApp, name = "Ранок у селі") {
  await vn.page.getByRole("button", { name: t.projects.create }).click();
  await vn.page.getByLabel(t.projects.namePlaceholder).fill(name);
  await vn.page.getByRole("button", { name: t.projects.createConfirm }).click();
  await expect(vn.canvas.addFirst()).toBeVisible();
}

function scene(project: Project) {
  return project.scenes[project.sceneOrder[0]!]!;
}

/** The only line of the block with this text. */
function lineOf(project: Project, text: string) {
  for (const b of Object.values(scene(project).blocks)) {
    const line = b.lines.find((l) => l.text === text);
    if (line) return { block: b, line };
  }
  throw new Error(`No line «${text}»`);
}

test("E2–E3 first block and a chain: (+) after each block, Shift+Enter, Esc cancels", async ({ vn }) => {
  await newProject(vn);

  // E2: the first block becomes the start block, its output is unconnected.
  await vn.canvas.addFirst().click();
  await vn.draft.pickCharacter("Автор");
  await vn.draft.line().fill("[Ранок. Татко вже порається біля хати]");
  await vn.draft.line().press("Enter");
  let project = await vn.project();
  const first = lineOf(project, "[Ранок. Татко вже порається біля хати]");
  expect(scene(project).startBlockId).toBe(first.block.id);
  await expect(vn.canvas.block(first.block.id)).toContainText("старт");
  await expect(vn.canvas.addAfter(first.line.id)).toBeVisible();

  // E3 + E4: next block with a new character straight from the picker, two-line text.
  await vn.canvas.addAfter(first.line.id).click();
  await vn.draft.pickCharacter("Татко");
  await vn.draft.line().pressSequentially("Вставай, ГГ, сонце вже високо!");
  await vn.draft.line().press("Shift+Enter");
  await vn.draft.line().pressSequentially("Збігай по воду.");
  await vn.draft.line().press("Enter");
  project = await vn.project();
  const second = lineOf(project, "Вставай, ГГ, сонце вже високо!\nЗбігай по воду.");
  expect(first.block.id).not.toBe(second.block.id);
  expect(lineOf(project, "[Ранок. Татко вже порається біля хати]").line.next).toEqual({ type: "block", blockId: second.block.id });
  expect(project.characters[second.block.characterId!]!.name).toBe("Татко");

  // Esc cancels the draft without changes.
  await vn.canvas.addAfter(second.line.id).click();
  await vn.draft.pickCharacter("Автор");
  await vn.draft.line().fill("[Цей текст не має зберегтися]");
  await vn.draft.line().press("Escape");
  await expect(vn.page.locator(".react-flow__node textarea")).toHaveCount(0);
  expect(Object.keys(scene(await vn.project()).blocks)).toHaveLength(2);
});

test("E5 choice: several options in a draft, each with its own output", async ({ vn }) => {
  await newProject(vn);
  await vn.canvas.addFirst().click();
  await vn.draft.pickCharacter("ГГ");
  await vn.draft.line(0).fill("Уже біжу, тату!");
  await vn.draft.addOption().click();
  await vn.draft.line(1).fill("Ще п'ять хвилин…");
  await vn.draft.line(1).press("Enter");

  const project = await vn.project();
  const [block] = Object.values(scene(project).blocks);
  expect(block!.lines.map((l) => l.text)).toEqual(["Уже біжу, тату!", "Ще п'ять хвилин…"]);
  for (const line of block!.lines) await expect(vn.canvas.addAfter(line.id)).toBeVisible();
});

test("E9 undo and redo: buttons and Ctrl/Cmd+Z revert each step", async ({ vn }) => {
  await newProject(vn);
  await vn.canvas.addFirst().click();
  await vn.draft.pickCharacter("Автор");
  await vn.draft.line().fill("[Ранок. Татко вже порається біля хати]");
  await vn.draft.line().press("Enter");
  const { line } = lineOf(await vn.project(), "[Ранок. Татко вже порається біля хати]");
  await vn.canvas.addAfter(line.id).click();
  await vn.draft.pickCharacter("Автор");
  await vn.draft.line().fill("[Пахне свіжим хлібом]");
  await vn.draft.line().press("Enter");
  const blocks = async () => Object.keys(scene(await vn.project()).blocks).length;
  expect(await blocks()).toBe(2);

  await vn.topBar.undo().click();
  await expect.poll(blocks).toBe(1);
  await vn.page.keyboard.press("ControlOrMeta+z");
  await expect.poll(blocks).toBe(0);
  await expect(vn.canvas.addFirst()).toBeVisible();

  await vn.topBar.redo().click();
  await expect.poll(blocks).toBe(1);
  await vn.page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(blocks).toBe(2);
  await expect(vn.canvas.blockWithText("Пахне свіжим хлібом")).toBeVisible();
});
