import type { Block, BlockId, Next, Output, Scene, SceneId } from "@vn/core";

/**
 * Projection of the scene graph onto canvas nodes and links (FLOWS.md, sections 1–4, 8).
 *
 * Every block is drawn once. A link into a block that another link already leads to (convergence)
 * is just another ordinary line. Dangling outputs get a stub with `(+)`,
 * and outputs ending the story get an "END" marker. Node order is the walk from the start,
 * so the layout keeps branches in line order.
 *
 * A pure function without React: easy to test, and the canvas only draws the result.
 */

/** An output on the canvas is always exact: a block and a line. */
export type LineOutput = Required<Output>;

/** Output key: `blk_…:ln_…`. */
export function outputKey(o: LineOutput): string {
  return `${o.blockId}:${o.lineId}`;
}

/** Id of the output point (handle) on a block node — the line id. */
export function handleId(o: LineOutput): string {
  return o.lineId;
}

export type Draft = {
  /** The output the new block will connect to. Without it the draft stands alone (first block of the scene). */
  from?: LineOutput;
  /** Insert between `from` and its old continuation. */
  insert?: boolean;
};

export type ProjNode =
  | { kind: "block"; id: string; blockId: BlockId; isStart: boolean; reachable: boolean }
  | { kind: "stub"; id: string; output: LineOutput; state: "open" | "end" }
  /** A jump to the start of another scene — a link badge at the end of the output. */
  | { kind: "scene"; id: string; output: LineOutput; sceneId: SceneId }
  | { kind: "draft"; id: "draft"; draft: Draft }
  | { kind: "empty"; id: "empty" };

export type ProjEdge = {
  id: string;
  source: string;
  /** Output point on the source node (blocks only; a draft has one point). */
  sourceHandle: string;
  target: string;
  kind: "link" | "stub" | "end" | "draft";
  /** The model output the link comes from (for a draft — the output it will connect to). */
  output?: LineOutput;
};

export type Projection = { nodes: ProjNode[]; edges: ProjEdge[] };

export const DRAFT_ID = "draft";

export function projectScene(scene: Scene, draft: Draft | null = null): Projection {
  const nodes: ProjNode[] = [];
  const edges: ProjEdge[] = [];
  const placed = new Set<BlockId>();
  const blockIds = Object.keys(scene.blocks);

  if (blockIds.length === 0) {
    if (draft) nodes.push({ kind: "draft", id: DRAFT_ID, draft });
    else nodes.push({ kind: "empty", id: "empty" });
    return { nodes, edges };
  }

  const draftKey = draft?.from ? outputKey(draft.from) : null;

  // Returns the target node and (for a new subtree) a function that expands it. We expand after
  // the edge is recorded, so edges come in the same walk order as nodes.
  const targetOf = (
    output: LineOutput,
    next: Next,
    reachable: boolean,
  ): { id: string; kind: ProjEdge["kind"]; expand?: () => void } => {
    const key = outputKey(output);
    if (next === null) {
      const id = `stub:${key}`;
      nodes.push({ kind: "stub", id, output, state: "open" });
      return { id, kind: "stub" };
    }
    if (next.type === "end") {
      const id = `end:${key}`;
      nodes.push({ kind: "stub", id, output, state: "end" });
      return { id, kind: "end" };
    }
    if (next.type === "scene") {
      const id = `scene:${key}`;
      nodes.push({ kind: "scene", id, output, sceneId: next.sceneId });
      return { id, kind: "end" };
    }
    const target = next.blockId;
    if (!placed.has(target)) {
      placed.add(target);
      return { id: target, kind: "link", expand: () => visit(target, reachable) };
    }
    // The block is already on the canvas (convergence or going back) — just one more line to it.
    return { id: target, kind: "link" };
  };

  const visit = (blockId: BlockId, reachable: boolean) => {
    const block = scene.blocks[blockId]!;
    nodes.push({ kind: "block", id: blockId, blockId, isStart: scene.startBlockId === blockId, reachable });
    for (const { output, next } of outputsOf(block)) {
      const key = outputKey(output);
      const sourceHandle = handleId(output);
      if (draft && draftKey === key) {
        // The draft goes between the output and what came next (on insert), or replaces the stub.
        nodes.push({ kind: "draft", id: DRAFT_ID, draft });
        edges.push({ id: `e:${key}`, source: blockId, sourceHandle, target: DRAFT_ID, kind: "draft", output });
        if (draft.insert && next !== null) {
          const t = targetOf(output, next, reachable);
          edges.push({ id: `e:draft:${key}`, source: DRAFT_ID, sourceHandle: "out", target: t.id, kind: t.kind === "stub" ? "stub" : "draft" });
          t.expand?.();
        }
        continue;
      }
      const t = targetOf(output, next, reachable);
      edges.push({ id: `e:${key}`, source: blockId, sourceHandle, target: t.id, kind: t.kind, output });
      t.expand?.();
    }
  };

  if (scene.startBlockId && scene.blocks[scene.startBlockId]) {
    placed.add(scene.startBlockId);
    visit(scene.startBlockId, true);
  }

  // Unreachable blocks: separate trees. Roots are those no other unreachable block leads into.
  const rest = () => blockIds.filter((id) => !placed.has(id)).sort();
  let remaining = rest();
  while (remaining.length > 0) {
    const targeted = new Set<BlockId>();
    for (const id of remaining) {
      for (const { next } of outputsOf(scene.blocks[id]!)) {
        if (next?.type === "block" && next.blockId !== id) targeted.add(next.blockId);
      }
    }
    // In a cycle every block has an input, so then just take the first.
    const root = remaining.find((id) => !targeted.has(id)) ?? remaining[0]!;
    placed.add(root);
    visit(root, false);
    remaining = rest();
  }

  if (draft && !draft.from) nodes.push({ kind: "draft", id: DRAFT_ID, draft });
  return { nodes, edges };
}

function outputsOf(block: Block): { output: LineOutput; next: Next }[] {
  return block.lines.map((l) => ({ output: { blockId: block.id, lineId: l.id }, next: l.next }));
}
