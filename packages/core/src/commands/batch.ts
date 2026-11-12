import { invalid } from "../errors";
import { getScene, resolveCharacter } from "../queries";
import type { Block, BlockId, Line, Next, Output, Project, SceneId } from "../schema/entities";
import { requireText } from "./blocks";
import { defineCommand, resolveOutputInScene, validateNext } from "./util";

/** Character by ID or exact name; `null` means no character. */
export type CharacterRef = string | null;

function characterIdOf(project: Project, ref: CharacterRef): string | null {
  return ref === null ? null : resolveCharacter(project, ref).id;
}

/** Connects a chain/tree to `from`. Returns the `next` that is carried over on insert. */
function attach(draft: Project, sceneId: SceneId, from: Output | undefined, insert: boolean | undefined) {
  if (insert && !from) throw invalid("insert requires from");
  if (!from) return { carried: undefined, connect: undefined };
  const { line } = resolveOutputInScene(draft, sceneId, from);
  const carried = insert ? line.next : undefined;
  return {
    carried,
    connect: (blockId: BlockId) => {
      line.next = { type: "block", blockId };
    },
  };
}

export type AddChainArgs = {
  sceneId: SceneId;
  from?: Output;
  insert?: boolean;
  lines: { character: CharacterRef; text: string }[];
  /** `next` of the last block; `null` by default. Incompatible with `insert`. */
  end?: Next;
};

/** A linear dialogue as one undo step (MCP.md, 5.7). */
export const addChain = defineCommand({
  name: "addChain",
  label: (a: AddChainArgs) => `Додати ланцюжок (${a.lines.length})`,
  run(draft, args: AddChainArgs, ctx) {
    const scene = getScene(draft, args.sceneId);
    if (args.lines.length === 0) throw invalid("lines must contain at least one line");
    if (args.insert && args.end !== undefined) throw invalid("insert and end cannot be combined");
    const { carried, connect } = attach(draft, scene.id, args.from, args.insert);
    const last: Next = carried !== undefined ? carried : validateNext(draft, scene, args.end ?? null);

    const ids = args.lines.map(() => ctx.newId("blk"));
    args.lines.forEach((line, i) => {
      const next: Next = i < ids.length - 1 ? { type: "block", blockId: ids[i + 1]! } : last;
      scene.blocks[ids[i]!] = {
        id: ids[i]!,
        characterId: characterIdOf(draft, line.character),
        lines: [{ id: ctx.newId("ln"), text: requireText(line.text), next }],
      };
    });
    if (connect) connect(ids[0]!);
    else if (scene.startBlockId === null) scene.startBlockId = ids[0]!;
    return { blockIds: ids };
  },
});

/**
 * Tree node: one line (`text` + `next`) or several — a choice (`lines`).
 */
export type TreeNode = {
  label?: string;
  character: CharacterRef;
  text?: string;
  next?: TreeTarget;
  lines?: { text: string; next?: TreeTarget }[];
};

export type TreeTarget = TreeNode | { ref: string } | { blockId: BlockId } | { end: true } | { scene: SceneId } | null;

export type AddTreeArgs = {
  sceneId: SceneId;
  from?: Output;
  /**
   * Insert the tree between `from` and its old `next`. The old `next` goes to every tree output
   * whose `next` is not given at all (an explicit `null` stays `null`).
   */
  insert?: boolean;
  root: TreeNode;
};

function isNode(t: TreeTarget | undefined): t is TreeNode {
  return typeof t === "object" && t !== null && "character" in t;
}

/** A branching part as one undo step (MCP.md, 5.7). Labels allow convergence within one call. */
export const addTree = defineCommand({
  name: "addTree",
  label: () => "Додати гілку",
  run(draft, args: AddTreeArgs, ctx) {
    const scene = getScene(draft, args.sceneId);
    const { carried, connect } = attach(draft, scene.id, args.from, args.insert);

    // Pass 1: an ID for every node, labels.
    const nodeIds = new Map<TreeNode, BlockId>();
    const labels = new Map<string, BlockId>();
    const keys: Record<string, BlockId> = {};
    let counter = 0;
    const visit = (node: TreeNode) => {
      if (nodeIds.has(node)) throw invalid("The same node object appears twice; use { ref } for convergence");
      if (node.lines !== undefined && (node.text !== undefined || node.next !== undefined)) {
        throw invalid("A tree node has either text/next (one line) or lines (a choice), not both");
      }
      if (node.lines === undefined && node.text === undefined) throw invalid("A tree node needs text or lines");
      if (node.lines !== undefined && node.lines.length === 0) throw invalid("lines must not be empty");
      const id = ctx.newId("blk");
      nodeIds.set(node, id);
      counter++;
      if (node.label !== undefined) {
        if (labels.has(node.label)) throw invalid(`Duplicate label "${node.label}"`);
        labels.set(node.label, id);
        keys[node.label] = id;
      } else {
        keys[`#${counter}`] = id;
      }
      if (isNode(node.next)) visit(node.next);
      for (const l of node.lines ?? []) if (isNode(l.next)) visit(l.next);
    };
    visit(args.root);

    // Pass 2: blocks.
    const resolve = (t: TreeTarget | undefined): Next => {
      if (t === undefined) return carried !== undefined ? carried : null;
      if (t === null) return null;
      if (isNode(t)) return { type: "block", blockId: nodeIds.get(t)! };
      if ("ref" in t) {
        const id = labels.get(t.ref);
        if (!id) throw invalid(`Unknown label "${t.ref}"`);
        return { type: "block", blockId: id };
      }
      if ("blockId" in t) return validateNext(draft, scene, { type: "block", blockId: t.blockId });
      if ("end" in t && t.end === true) return { type: "end" };
      if ("scene" in t) return validateNext(draft, scene, { type: "scene", sceneId: t.scene });
      throw invalid("Invalid tree target");
    };
    const created: Block[] = [];
    for (const [node, id] of nodeIds) {
      const items = node.lines ?? [{ text: node.text!, next: node.next }];
      const lines: Line[] = items.map((l) => ({ id: ctx.newId("ln"), text: requireText(l.text), next: resolve(l.next) }));
      created.push({ id, characterId: characterIdOf(draft, node.character), lines });
    }
    for (const b of created) scene.blocks[b.id] = b;

    const rootBlockId = nodeIds.get(args.root)!;
    if (connect) connect(rootBlockId);
    else if (scene.startBlockId === null) scene.startBlockId = rootBlockId;
    return { blockIds: keys, rootBlockId };
  },
});
