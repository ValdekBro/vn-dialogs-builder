import type { Locator, Page } from "@playwright/test";
import { t } from "../src/renderer/src/strings/uk";
import { expect, test } from "./support/app";
import { prologue } from "./support/seeds";

/** Playing a scene as a chat (FLOWS.md, 17). */

test.use({ launch: { seed: [prologue()] } });

test("E24 simulation: ▶ on a block, a choice, a jump to the next scene, the end, and a broken branch", async ({ vn }) => {
  const { page } = vn;
  const project = await vn.project();
  const morning = project.scenes[project.sceneOrder[0]!]!;
  const start = morning.blocks[morning.startBlockId!]!;
  const choice = Object.values(morning.blocks).find((b) => b.lines.length === 2)!;

  await vn.canvas.block(start.id).hover();
  await vn.canvas.block(start.id).getByRole("button", { name: t.canvas.tip.play }).click();
  await expect(page.getByText(t.sim.playing(morning.name, true))).toBeVisible();

  // Pause holds autoplay; Space shows the next line by hand.
  const lines = page.getByTestId("sim-line");
  await expect(lines.first()).toContainText("Ранок. Татко вже порається біля хати");
  await page.getByRole("button", { name: t.sim.pause }).click();
  const shown = await lines.count();
  await page.waitForTimeout(1500);
  await expect(lines).toHaveCount(shown);
  await advanceUntil(page, page.getByTestId("sim-choice"));
  await expect(lines.nth(1)).toContainText("Вставай, ГГ");

  // Option 1 jumps to «Біля криниці», which ends the story.
  await page.keyboard.press("1");
  await advanceUntil(page, page.getByText(t.sim.scene("Біля криниці")));
  await advanceUntil(page, page.getByText(t.sim.end, { exact: false }).first());

  // Restart; option 2 leads nowhere — playback stops and shows the spot in the builder.
  await page.getByRole("button", { name: t.sim.restart }).first().click();
  await advanceUntil(page, page.getByTestId("sim-choice"));
  await page.keyboard.press("2");
  const problem = page.getByTestId("sim-problem");
  await expect(problem).toContainText(t.sim.problem.dangling_output());
  await problem.getByRole("button", { name: t.sim.showInBuilder }).click();
  await expect(vn.topBar.view(t.views.builder)).toHaveAttribute("aria-current", "page");
  await expect(vn.canvas.block(choice.id)).toBeInViewport();
});

/** Presses Space until `target` shows (autoplay may already have shown some lines). */
async function advanceUntil(page: Page, target: Locator) {
  for (let i = 0; i < 6 && !(await target.isVisible()); i++) await page.keyboard.press("Space");
  await expect(target).toBeVisible();
}
