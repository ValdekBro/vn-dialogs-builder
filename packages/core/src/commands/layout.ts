import { invalid } from "../errors";
import { getBlock, getScene } from "../queries";
import type { BlockId, Position, SceneId } from "../schema/entities";
import { defineCommand } from "./util";

export type MoveBlocksArgs = {
  /** New position for each block; `null` returns the block to automatic layout. */
  moves: { blockId: BlockId; pos: Position | null }[];
};

/** Manual block placement on the canvas (FLOWS.md, 8a). One undo step for the whole drag. */
export const moveBlocks = defineCommand({
  name: "moveBlocks",
  label: (a: MoveBlocksArgs) =>
    a.moves.every((m) => m.pos === null)
      ? "Повернути блок на місце"
      : a.moves.length === 1
        ? "Перемістити блок"
        : `Перемістити блоки (${a.moves.length})`,
  run(draft, args: MoveBlocksArgs) {
    if (args.moves.length === 0) throw invalid("moves must not be empty");
    for (const { blockId, pos } of args.moves) {
      const { block } = getBlock(draft, blockId);
      if (pos === null) {
        delete block.pos;
        continue;
      }
      if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) throw invalid("Position must be finite numbers");
      block.pos = { x: Math.round(pos.x), y: Math.round(pos.y) };
    }
    return { blockIds: args.moves.map((m) => m.blockId) };
  },
});

export type ResetLayoutArgs = { sceneId: SceneId };

/** Forget all manual positions in the scene: layout is fully automatic again. */
export const resetLayout = defineCommand({
  name: "resetLayout",
  label: () => "Авторозкладка",
  run(draft, args: ResetLayoutArgs) {
    const scene = getScene(draft, args.sceneId);
    let reset = 0;
    for (const block of Object.values(scene.blocks)) {
      if (block.pos) {
        delete block.pos;
        reset++;
      }
    }
    return { reset };
  },
});
