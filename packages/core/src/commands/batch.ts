import { invalid } from "../errors";
import { getScene, resolveCharacter } from "../queries";
import type { Block, BlockId, Line, Next, Output, Project, SceneId } from "../schema/entities";
import { requireText } from "./blocks";
import { defineCommand, resolveOutputInScene, validateNext } from "./util";

/** Персонаж за ID або точним ім'ям; `null` — без персонажа. */
export type CharacterRef = string | null;

function characterIdOf(project: Project, ref: CharacterRef): string | null {
  return ref === null ? null : resolveCharacter(project, ref).id;
}

/** Підключає ланцюжок/дерево до `from`. Повертає `next`, що переходить далі при вставці. */
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
  /** `next` останнього блоку; за замовчуванням `null`. Несумісний з `insert`. */
  end?: Next;
};

/** Лінійний діалог одним кроком undo (MCP.md, 5.7). */
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
 * Вузол дерева: одна репліка (`text` + `next`) або кілька — вибір (`lines`).
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
   * Вставити дерево між `from` і його старим `next`. Старий `next` отримують усі виходи
   * дерева, у яких `next` не вказано зовсім (явний `null` лишається `null`).
   */
  insert?: boolean;
  root: TreeNode;
};

function isNode(t: TreeTarget | undefined): t is TreeNode {
  return typeof t === "object" && t !== null && "character" in t;
}

/** Розгалужена гілка одним кроком undo (MCP.md, 5.7). Мітки дозволяють сходження в межах виклику. */
export const addTree = defineCommand({
  name: "addTree",
  label: () => "Додати гілку",
  run(draft, args: AddTreeArgs, ctx) {
    const scene = getScene(draft, args.sceneId);
    const { carried, connect } = attach(draft, scene.id, args.from, args.insert);

    // Прохід 1: ID для кожного вузла, мітки.
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

    // Прохід 2: блоки.
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
