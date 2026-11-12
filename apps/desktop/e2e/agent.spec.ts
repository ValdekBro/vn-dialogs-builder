import { t } from "../src/renderer/src/strings/uk";
import { expect, test } from "./support/app";
import { prologue } from "./support/seeds";

/** Working together with an agent over MCP (FLOWS.md, 14). */

test.use({ launch: { seed: [prologue()], approvalSec: 3 } });

test("E19 and E22: the agent's blocks appear on the canvas, and the human can undo them", async ({ vn }) => {
  const agent = await vn.connectAgent();
  const project = await vn.project();
  const well = project.sceneOrder[1]!;
  await vn.page.getByTestId(`scene-${well}`).click();

  const before = Object.keys(project.scenes[well]!.blocks).length;
  const { rootBlockId } = await agent.call<{ rootBlockId: string }>("add_tree", {
    sceneId: well,
    root: { character: "Автор", text: "[Біля криниці вже чекає черга]", next: { end: true } },
  });
  await expect(vn.canvas.block(rootBlockId)).toContainText("Біля криниці вже чекає черга");

  await vn.page.keyboard.press("ControlOrMeta+z");
  await expect(vn.canvas.block(rootBlockId)).toHaveCount(0);
  expect(Object.keys((await vn.project()).scenes[well]!.blocks)).toHaveLength(before);
  await agent.close();
});

test("E20 deletion by the agent: reject, approve, and no answer", async ({ vn }) => {
  const agent = await vn.connectAgent();
  const project = await vn.project();
  const morning = project.scenes[project.sceneOrder[0]!]!;
  const tatko = Object.values(morning.blocks).find((b) => b.lines[0]!.text.startsWith("Вставай"))!;
  const panel = vn.page.getByTestId("approval-panel");
  const remove = () => agent.call<{ status: string }>("delete_blocks", { blockIds: [tatko.id], reason: "Татко тут зайвий" });

  let pending = remove();
  await expect(panel).toContainText("Татко тут зайвий");
  await panel.getByRole("button", { name: t.approval.reject }).click();
  expect((await pending).status).toBe("rejected");
  await expect(vn.canvas.block(tatko.id)).toBeVisible();

  pending = remove();
  await expect(panel).toBeVisible();
  // No answer: the short test timeout runs out.
  expect((await pending).status).toBe("timeout");
  await expect(panel).toHaveCount(0);

  pending = remove();
  await panel.getByRole("button", { name: t.approval.approve }).click();
  expect((await pending).status).toBe("approved");
  await expect(vn.canvas.block(tatko.id)).toHaveCount(0);
  await agent.close();
});
