import { invalid } from "../errors";
import { getBlock, getScene } from "../queries";
import type { Block, BlockId, Project, SceneId } from "../schema/entities";
import { cloneBlocks } from "./scenes";
import { defineCommand } from "./util";

/** Знімок скопійованих блоків. Це звичайні дані: їх можна тримати в буфері обміну. */
export type BlockClipboard = {
  sourceSceneId: SceneId;
  blocks: Block[];
};

/** Копіювання не змінює проєкт, тож це запит, а не команда. Блоки — з однієї сцени. */
export function copyBlocks(project: Project, blockIds: BlockId[]): BlockClipboard {
  if (blockIds.length === 0) throw invalid("blockIds must not be empty");
  const ids = [...new Set(blockIds)];
  const first = getBlock(project, ids[0]!);
  const blocks = ids.map((id) => {
    const { scene, block } = getBlock(project, id);
    if (scene.id !== first.scene.id) throw invalid("Copied blocks must belong to one scene");
    return structuredClone(block);
  });
  return { sourceSceneId: first.scene.id, blocks };
}

/** Кореневі блоки знімка: ті, у які не веде жоден інший скопійований блок. */
export function clipboardRoots(clip: BlockClipboard): BlockId[] {
  const targets = new Set<BlockId>();
  for (const b of clip.blocks) {
    for (const { next } of b.lines) if (next?.type === "block") targets.add(next.blockId);
  }
  return clip.blocks.map((b) => b.id).filter((id) => !targets.has(id));
}

export type PasteBlocksArgs = { sceneId: SceneId; clipboard: BlockClipboard };

/**
 * Вставка: копія з новими ID з'являється окремою гілкою (FLOWS.md, 9).
 * Зв'язок на блок поза знімком зберігається, якщо такий блок є в цільовій сцені, інакше стає `null`.
 * Персонаж, якого вже немає в проєкті, стає `null`.
 */
export const pasteBlocks = defineCommand({
  name: "pasteBlocks",
  label: (a: PasteBlocksArgs) => (a.clipboard.blocks.length === 1 ? "Вставити блок" : `Вставити блоки (${a.clipboard.blocks.length})`),
  run(draft, args: PasteBlocksArgs, ctx) {
    const scene = getScene(draft, args.sceneId);
    if (args.clipboard.blocks.length === 0) throw invalid("Clipboard is empty");
    const wasEmpty = Object.keys(scene.blocks).length === 0;
    const { blocks, idMap } = cloneBlocks(args.clipboard.blocks, ctx, (target) =>
      target in scene.blocks ? { type: "block", blockId: target } : null,
    );
    for (const b of blocks) {
      if (b.characterId !== null && !(b.characterId in draft.characters)) b.characterId = null;
      scene.blocks[b.id] = b;
    }
    const rootBlockIds = clipboardRoots(args.clipboard).map((id) => idMap.get(id)!);
    if (wasEmpty && scene.startBlockId === null) scene.startBlockId = rootBlockIds[0] ?? blocks[0]!.id;
    return { blockIds: blocks.map((b) => b.id), rootBlockIds };
  },
});
