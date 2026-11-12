import { invalid } from "../errors";
import { getScene } from "../queries";
import type { Block, BlockId, Next, Scene, SceneId } from "../schema/entities";
import { defineCommand, requireName, requirePermutation, type CommandContext } from "./util";

export type CreateSceneArgs = { name: string; description?: string; index?: number };

export const createScene = defineCommand({
  name: "createScene",
  label: (a: CreateSceneArgs) => `Створити сцену «${a.name}»`,
  run(draft, args: CreateSceneArgs, ctx) {
    const scene: Scene = {
      id: ctx.newId("scn"),
      name: requireName(args.name, "Scene"),
      description: args.description ?? "",
      startBlockId: null,
      blocks: {},
    };
    draft.scenes[scene.id] = scene;
    const index = args.index ?? draft.sceneOrder.length;
    draft.sceneOrder.splice(clampIndex(index, draft.sceneOrder.length), 0, scene.id);
    return { sceneId: scene.id };
  },
});

export type UpdateSceneArgs = {
  sceneId: SceneId;
  name?: string;
  description?: string;
  startBlockId?: BlockId | null;
};

export const updateScene = defineCommand({
  name: "updateScene",
  label: (a: UpdateSceneArgs) => (a.startBlockId !== undefined ? "Змінити стартовий блок" : "Змінити сцену"),
  run(draft, args: UpdateSceneArgs) {
    const scene = getScene(draft, args.sceneId);
    if (args.name !== undefined) scene.name = requireName(args.name, "Scene");
    if (args.description !== undefined) scene.description = args.description;
    if (args.startBlockId !== undefined) {
      if (args.startBlockId !== null && !(args.startBlockId in scene.blocks)) {
        throw invalid(`Block ${args.startBlockId} is not in scene ${scene.id}`);
      }
      scene.startBlockId = args.startBlockId;
    }
    return { sceneId: scene.id };
  },
});

export type DeleteSceneArgs = { sceneId: SceneId };

/** Deletes a scene. Jumps into it from other scenes become `null` (dangling outputs). */
export const deleteScene = defineCommand({
  name: "deleteScene",
  label: () => "Видалити сцену",
  run(draft, args: DeleteSceneArgs) {
    const scene = getScene(draft, args.sceneId);
    delete draft.scenes[scene.id];
    draft.sceneOrder = draft.sceneOrder.filter((id) => id !== args.sceneId);
    const danglingOutputs: { blockId: string; lineId: string }[] = [];
    for (const other of Object.values(draft.scenes)) {
      for (const block of Object.values(other.blocks)) {
        for (const line of block.lines) {
          if (line.next?.type === "scene" && line.next.sceneId === args.sceneId) {
            line.next = null;
            danglingOutputs.push({ blockId: block.id, lineId: line.id });
          }
        }
      }
    }
    return { deletedId: args.sceneId, danglingOutputs };
  },
});

export type DuplicateSceneArgs = { sceneId: SceneId; name?: string };

/** A copy of the scene with new IDs, inserted right after the original. */
export const duplicateScene = defineCommand({
  name: "duplicateScene",
  label: () => "Дублювати сцену",
  run(draft, args: DuplicateSceneArgs, ctx) {
    const source = getScene(draft, args.sceneId);
    const { blocks, idMap } = cloneBlocks(Object.values(source.blocks), ctx, () => null);
    const scene: Scene = {
      id: ctx.newId("scn"),
      name: args.name !== undefined ? requireName(args.name, "Scene") : `${source.name} (копія)`,
      description: source.description,
      startBlockId: source.startBlockId === null ? null : (idMap.get(source.startBlockId) ?? null),
      blocks: Object.fromEntries(blocks.map((b) => [b.id, b])),
    };
    draft.scenes[scene.id] = scene;
    draft.sceneOrder.splice(draft.sceneOrder.indexOf(source.id) + 1, 0, scene.id);
    return { sceneId: scene.id };
  },
});

export type ReorderScenesArgs = { sceneIds: SceneId[] };

export const reorderScenes = defineCommand({
  name: "reorderScenes",
  label: () => "Змінити порядок сцен",
  run(draft, args: ReorderScenesArgs) {
    requirePermutation(args.sceneIds, draft.sceneOrder, "sceneIds");
    draft.sceneOrder = [...args.sceneIds];
    return {};
  },
});

/**
 * Deep copy of blocks with new block and line IDs.
 * Links between copied blocks move to the copies, and a link to a block outside the set
 * is handed to `outside`, which decides what to do with it (keep or clear).
 */
export function cloneBlocks(
  source: Block[],
  ctx: CommandContext,
  outside: (blockId: BlockId) => Next,
): { blocks: Block[]; idMap: Map<BlockId, BlockId> } {
  const idMap = new Map<BlockId, BlockId>();
  for (const b of source) idMap.set(b.id, ctx.newId("blk"));
  const remap = (next: Next): Next => {
    if (next === null) return null;
    if (next.type === "end") return { type: "end" };
    if (next.type === "scene") return { type: "scene", sceneId: next.sceneId };
    const mapped = idMap.get(next.blockId);
    return mapped ? { type: "block", blockId: mapped } : outside(next.blockId);
  };
  const blocks = source.map(
    (b): Block => ({
      id: idMap.get(b.id)!,
      characterId: b.characterId,
      lines: b.lines.map((l) => ({ id: ctx.newId("ln"), text: l.text, next: remap(l.next) })),
    }),
  );
  return { blocks, idMap };
}

function clampIndex(index: number, length: number): number {
  if (!Number.isInteger(index)) throw invalid("index must be an integer");
  return Math.max(0, Math.min(index, length));
}
