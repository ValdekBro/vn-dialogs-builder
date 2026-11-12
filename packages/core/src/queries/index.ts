import { CoreError, invalid, notFound } from "../errors";
import type { Block, BlockId, Character, Line, Next, Output, Project, Scene, SceneId } from "../schema/entities";

export function getScene(project: Project, sceneId: string): Scene {
  const scene = project.scenes[sceneId];
  if (!scene) throw notFound("Scene", sceneId);
  return scene;
}

export function getCharacter(project: Project, characterId: string): Character {
  const ch = project.characters[characterId];
  if (!ch) throw notFound("Character", characterId);
  return ch;
}

/** Blocks have global IDs, so the scene can be omitted. */
export function findBlock(project: Project, blockId: string): { scene: Scene; block: Block } | undefined {
  for (const scene of Object.values(project.scenes)) {
    const block = scene.blocks[blockId];
    if (block) return { scene, block };
  }
  return undefined;
}

export function getBlock(project: Project, blockId: string): { scene: Scene; block: Block } {
  const found = findBlock(project, blockId);
  if (!found) throw notFound("Block", blockId);
  return found;
}

export function findLine(project: Project, lineId: string): { scene: Scene; block: Block; line: Line; index: number } | undefined {
  for (const scene of Object.values(project.scenes)) {
    for (const block of Object.values(scene.blocks)) {
      const index = block.lines.findIndex((l) => l.id === lineId);
      if (index >= 0) return { scene, block, line: block.lines[index]!, index };
    }
  }
  return undefined;
}

export function getLine(project: Project, lineId: string) {
  const found = findLine(project, lineId);
  if (!found) throw notFound("Line", lineId);
  return found;
}

/** All outputs of a block with their `next`. */
export function blockOutputs(block: Block): { output: Required<Output>; next: Next }[] {
  return block.lines.map((l) => ({ output: { blockId: block.id, lineId: l.id }, next: l.next }));
}

/** Index of a scene's incoming links: blockId → outputs leading into it. */
export function incomingIndex(scene: Scene): Map<BlockId, Required<Output>[]> {
  const index = new Map<BlockId, Required<Output>[]>();
  for (const block of Object.values(scene.blocks)) {
    for (const { output, next } of blockOutputs(block)) {
      if (next?.type !== "block") continue;
      const list = index.get(next.blockId);
      if (list) list.push(output);
      else index.set(next.blockId, [output]);
    }
  }
  return index;
}

export function incomingOf(scene: Scene, blockId: BlockId): Required<Output>[] {
  return incomingIndex(scene).get(blockId) ?? [];
}

/**
 * Depth-first walk from the start block in output order.
 * Returns the IDs of reachable blocks in first-visit order.
 */
export function traversalOrder(scene: Scene): BlockId[] {
  const order: BlockId[] = [];
  if (scene.startBlockId === null) return order;
  const seen = new Set<BlockId>();
  const stack: BlockId[] = [scene.startBlockId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    const block = scene.blocks[id];
    if (!block) continue;
    seen.add(id);
    order.push(id);
    const targets = blockOutputs(block)
      .map(({ next }) => (next?.type === "block" ? next.blockId : null))
      .filter((t): t is BlockId => t !== null);
    // in reverse order so the first output is visited first
    for (let i = targets.length - 1; i >= 0; i--) {
      if (!seen.has(targets[i]!)) stack.push(targets[i]!);
    }
  }
  return order;
}

export function reachableBlocks(scene: Scene): Set<BlockId> {
  return new Set(traversalOrder(scene));
}

/**
 * Scene, block and line of an output. Throws if the output does not exist.
 * Without `lineId` the output is unambiguous only when the block has one line.
 */
export function resolveOutput(project: Project, output: Output) {
  const { scene, block } = getBlock(project, output.blockId);
  if (output.lineId === undefined) {
    if (block.lines.length !== 1) {
      throw invalid(`Block ${block.id} has ${block.lines.length} lines: specify lineId to address an output`, {
        lineIds: block.lines.map((l) => l.id),
      });
    }
    return { scene, block, line: block.lines[0]! };
  }
  const line = block.lines.find((l) => l.id === output.lineId);
  if (!line) throw notFound("Line", `${output.lineId} in block ${block.id}`);
  return { scene, block, line };
}

/**
 * Character by ID (`chr_…`) or by exact name (MCP.md, principle 5).
 * An ambiguous or unknown name is INVALID_ARGUMENT with a list of candidates.
 */
export function resolveCharacter(project: Project, ref: string): Character {
  const byId = project.characters[ref];
  if (byId) return byId;
  const all = project.characterOrder.map((id) => project.characters[id]!);
  const exact = all.filter((c) => c.name === ref);
  if (exact.length === 1) return exact[0]!;
  const candidates = all.map((c) => ({ id: c.id, name: c.name }));
  if (exact.length > 1) {
    throw invalid(`Character name is ambiguous: "${ref}". Use an id.`, {
      candidates: exact.map((c) => ({ id: c.id, name: c.name })),
    });
  }
  if (ref.startsWith("chr_")) throw new CoreError("NOT_FOUND", `Character not found: ${ref}`, { candidates });
  throw invalid(`Unknown character: "${ref}"`, { candidates });
}

export type FindBlocksArgs = {
  query?: string;
  characterId?: string;
  sceneId?: SceneId;
  /** Only blocks with a choice (several lines). */
  choicesOnly?: boolean;
  limit?: number;
};

/** Block search: case-insensitive substring in line text. */
export function findBlocks(project: Project, args: FindBlocksArgs = {}): { sceneId: SceneId; block: Block }[] {
  const limit = args.limit ?? 50;
  const q = args.query?.toLocaleLowerCase();
  const sceneIds = args.sceneId ? [getScene(project, args.sceneId).id] : project.sceneOrder;
  const out: { sceneId: SceneId; block: Block }[] = [];
  for (const sceneId of sceneIds) {
    const scene = project.scenes[sceneId]!;
    const reached = traversalOrder(scene);
    const reachedSet = new Set(reached);
    const rest = Object.keys(scene.blocks)
      .filter((id) => !reachedSet.has(id))
      .sort();
    for (const id of [...reached, ...rest]) {
      const block = scene.blocks[id]!;
      if (args.choicesOnly && block.lines.length < 2) continue;
      if (args.characterId !== undefined && block.characterId !== args.characterId) continue;
      if (q && !blockMatches(block, q)) continue;
      out.push({ sceneId, block });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function blockMatches(block: Block, q: string): boolean {
  return block.lines.some((l) => l.text.toLocaleLowerCase().includes(q));
}

export function countBlocksOfCharacter(project: Project, characterId: string): number {
  let n = 0;
  for (const scene of Object.values(project.scenes)) {
    for (const block of Object.values(scene.blocks)) if (block.characterId === characterId) n++;
  }
  return n;
}


/**
 * Blocks an output can be connected to (FLOWS.md, 8): any block of the scene.
 * Both convergence (several links into one block) and cycles (a link back along the branch
 * or into the same block — e.g. returning to a question menu) are allowed.
 * Order matches the canvas: first the walk from the start, then the rest.
 */
export function linkTargets(scene: Scene, _fromBlockId: BlockId): BlockId[] {
  const order = traversalOrder(scene);
  const reached = new Set(order);
  const rest = Object.keys(scene.blocks)
    .filter((id) => !reached.has(id))
    .sort();
  return [...order, ...rest];
}
