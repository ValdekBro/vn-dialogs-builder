import { invalid, notFound } from "../errors";
import { getBlock, getScene } from "../queries";
import type { Block, BlockId, CharacterId, Line, LineId, Next, Output, Project, Scene, SceneId } from "../schema/entities";
import {
  defineCommand,
  detachIncoming,
  resolveOutputInScene,
  validateCharacterId,
  validateNext,
  type CommandContext,
} from "./util";

export type NewLineInput = { text: string; next?: Next };

export type AddBlockArgs = {
  sceneId: SceneId;
  characterId: CharacterId | null;
  /** The block's lines, at least one. Several lines make a choice. */
  lines: NewLineInput[];
  /** The output to connect the new block to. */
  from?: Output;
  /** Insert between `from` and its previous `next`: the old continuation goes to the first line. */
  insert?: boolean;
};

/**
 * Adds a block (MCP.md, 5.4; FLOWS.md, 4–5).
 * If the scene has no start block and the block connects to nothing, it becomes the start block.
 */
export const addBlock = defineCommand({
  name: "addBlock",
  label: (a: AddBlockArgs) => (a.insert ? "Вставити блок" : "Додати блок"),
  run(draft, args: AddBlockArgs, ctx) {
    const scene = getScene(draft, args.sceneId);
    if (!Array.isArray(args.lines) || args.lines.length === 0) throw invalid("lines must contain at least one line");
    if (args.insert && !args.from) throw invalid("insert requires from");

    const from = args.from ? resolveOutputInScene(draft, scene.id, args.from) : undefined;
    if (args.insert && args.lines[0]!.next !== undefined) {
      throw invalid("With insert, the first line continues to the old next: do not set its next");
    }
    const block = buildBlock(draft, scene, ctx, {
      characterId: args.characterId,
      lines: args.lines,
      carried: args.insert && from ? from.line.next : undefined,
    });
    scene.blocks[block.id] = block;
    if (from) from.line.next = { type: "block", blockId: block.id };
    else if (scene.startBlockId === null) scene.startBlockId = block.id;
    return { blockId: block.id, lineIds: block.lines.map((l) => l.id) };
  },
});

/** Creates a block. `carried` is the `next` taken over from the output on insert; the first line gets it. */
export function buildBlock(
  project: Project,
  scene: Scene,
  ctx: CommandContext,
  input: { characterId: CharacterId | null; lines: NewLineInput[]; carried?: Next | undefined },
): Block {
  const lines: Line[] = input.lines.map((l, i) => ({
    id: ctx.newId("ln"),
    text: requireText(l.text),
    next: i === 0 && input.carried !== undefined ? input.carried : validateNext(project, scene, l.next ?? null),
  }));
  return { id: ctx.newId("blk"), characterId: validateCharacterId(project, input.characterId), lines };
}

export type LineUpdateInput = { id?: LineId; text: string; next?: Next };

export type UpdateBlockArgs = {
  blockId: BlockId;
  characterId?: CharacterId | null;
  /**
   * The full new list of lines. With `id` it updates an existing line (without `next` the link stays),
   * without `id` it creates a new one. Existing lines missing from the list are deleted.
   */
  lines?: LineUpdateInput[];
};

/**
 * Which lines disappear after `updateBlock`. The MCP layer uses this
 * to decide whether human approval is needed (MCP.md, 5.9).
 */
export function linesRemovedByUpdate(project: Project, args: UpdateBlockArgs): LineId[] {
  if (args.lines === undefined) return [];
  const { block } = getBlock(project, args.blockId);
  const kept = new Set(args.lines.map((l) => l.id).filter(Boolean));
  return block.lines.filter((l) => !kept.has(l.id)).map((l) => l.id);
}

/** Full block edit as one step (MCP.md, 5.4). Only the given fields change. */
export const updateBlock = defineCommand({
  name: "updateBlock",
  label: () => "Змінити блок",
  run(draft, args: UpdateBlockArgs, ctx) {
    const { scene, block } = getBlock(draft, args.blockId);
    let removedLineIds: LineId[] = [];
    if (args.characterId !== undefined) block.characterId = validateCharacterId(draft, args.characterId);
    if (args.lines !== undefined) {
      if (args.lines.length === 0) throw invalid("A block must keep at least one line; delete the block instead");
      const existing = new Map(block.lines.map((l) => [l.id, l]));
      const seen = new Set<string>();
      const next: Line[] = args.lines.map((item) => {
        if (item.id !== undefined) {
          const current = existing.get(item.id);
          if (!current) throw notFound("Line", `${item.id} in block ${block.id}`);
          if (seen.has(item.id)) throw invalid(`Duplicate line id ${item.id}`);
          seen.add(item.id);
          return {
            id: current.id,
            text: requireText(item.text),
            next: item.next !== undefined ? validateNext(draft, scene, item.next) : current.next,
          };
        }
        return { id: ctx.newId("ln"), text: requireText(item.text), next: validateNext(draft, scene, item.next ?? null) };
      });
      removedLineIds = block.lines.filter((l) => !seen.has(l.id)).map((l) => l.id);
      block.lines = next;
    }
    return { blockId: block.id, removedLineIds };
  },
});

export type DeleteBlocksArgs = { blockIds: BlockId[] };

/**
 * Deletes blocks. Links into them become `null`; so does the start block.
 * Returns the outputs left dangling.
 */
export const deleteBlocks = defineCommand({
  name: "deleteBlocks",
  label: (a: DeleteBlocksArgs) => (a.blockIds.length === 1 ? "Видалити блок" : `Видалити блоки (${a.blockIds.length})`),
  run(draft, args: DeleteBlocksArgs) {
    if (args.blockIds.length === 0) throw invalid("blockIds must not be empty");
    const ids = [...new Set(args.blockIds)];
    const byScene = new Map<SceneId, Set<BlockId>>();
    for (const id of ids) {
      const { scene } = getBlock(draft, id);
      const set = byScene.get(scene.id) ?? new Set<BlockId>();
      set.add(id);
      byScene.set(scene.id, set);
    }
    const danglingOutputs: Required<Output>[] = [];
    for (const [sceneId, removed] of byScene) {
      const scene = draft.scenes[sceneId]!;
      for (const id of removed) delete scene.blocks[id];
      danglingOutputs.push(...detachIncoming(scene, removed));
    }
    return { deletedIds: ids, danglingOutputs };
  },
});

export function requireText(text: string): string {
  if (typeof text !== "string") throw invalid("text must be a string");
  return text;
}
