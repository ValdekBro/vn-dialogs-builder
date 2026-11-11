import { invalid } from "../errors";
import { getBlock, getLine } from "../queries";
import type { BlockId, LineId, Next } from "../schema/entities";
import { requireText } from "./blocks";
import { defineCommand, requirePermutation, validateNext } from "./util";

/** Команди над репліками блоку. Дві й більше реплік у блоці — це вибір (FLOWS.md, 6). */

export type AddLineArgs = { blockId: BlockId; text: string; index?: number; next?: Next };

export const addLine = defineCommand({
  name: "addLine",
  label: () => "Додати репліку",
  run(draft, args: AddLineArgs, ctx) {
    const { scene, block } = getBlock(draft, args.blockId);
    const index = args.index ?? block.lines.length;
    if (!Number.isInteger(index) || index < 0 || index > block.lines.length) {
      throw invalid(`index must be between 0 and ${block.lines.length}`);
    }
    const line = { id: ctx.newId("ln"), text: requireText(args.text), next: validateNext(draft, scene, args.next ?? null) };
    block.lines.splice(index, 0, line);
    return { blockId: block.id, lineId: line.id };
  },
});

export type UpdateLineArgs = { lineId: LineId; text: string };

export const updateLine = defineCommand({
  name: "updateLine",
  label: () => "Змінити репліку",
  run(draft, args: UpdateLineArgs) {
    const { block, index } = getLine(draft, args.lineId);
    block.lines[index]!.text = requireText(args.text);
    return { blockId: block.id, lineId: args.lineId };
  },
});

export type DeleteLineArgs = { lineId: LineId };

/** Остання репліка не видаляється: блок без реплік не має сенсу — видаліть блок. */
export const deleteLine = defineCommand({
  name: "deleteLine",
  label: () => "Видалити репліку",
  run(draft, args: DeleteLineArgs) {
    const { block, index } = getLine(draft, args.lineId);
    if (block.lines.length === 1) throw invalid("Cannot delete the only line of a block; delete the block instead");
    block.lines.splice(index, 1);
    return { blockId: block.id, deletedId: args.lineId };
  },
});

export type ReorderLinesArgs = { blockId: BlockId; lineIds: LineId[] };

export const reorderLines = defineCommand({
  name: "reorderLines",
  label: () => "Змінити порядок реплік",
  run(draft, args: ReorderLinesArgs) {
    const { block } = getBlock(draft, args.blockId);
    requirePermutation(
      args.lineIds,
      block.lines.map((l) => l.id),
      "lineIds",
    );
    const byId = new Map(block.lines.map((l) => [l.id, l]));
    block.lines = args.lineIds.map((id) => byId.get(id)!);
    return { blockId: block.id };
  },
});
