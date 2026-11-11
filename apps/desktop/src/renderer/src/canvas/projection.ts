import type { Block, BlockId, Next, Output, Scene, SceneId } from "@vn/core";

/**
 * Проєкція графа сцени на вузли й зв'язки полотна (FLOWS.md, розділи 1–4, 8).
 *
 * Кожен блок малюється один раз. Зв'язок у блок, до якого вже веде інший зв'язок (сходження),
 * — така сама звичайна лінія. Непідключені виходи отримують «відросток» з `(+)`,
 * а виходи з кінцем сцени — маркер «КІНЕЦЬ». Порядок вузлів — обхід від старту,
 * щоб розкладка тримала гілки в порядку реплік.
 *
 * Чиста функція без React: її легко тестувати, а полотно лише малює результат.
 */

/** Вихід на полотні завжди точний: блок і репліка. */
export type LineOutput = Required<Output>;

/** Ключ виходу: `blk_…:ln_…`. */
export function outputKey(o: LineOutput): string {
  return `${o.blockId}:${o.lineId}`;
}

/** Id точки виходу (handle) на вузлі блоку — id репліки. */
export function handleId(o: LineOutput): string {
  return o.lineId;
}

export type Draft = {
  /** Вихід, до якого підключиться новий блок. Без нього чернетка стоїть окремо (перший блок сцени). */
  from?: LineOutput;
  /** Вставка між `from` і його старим продовженням. */
  insert?: boolean;
};

export type ProjNode =
  | { kind: "block"; id: string; blockId: BlockId; isStart: boolean; reachable: boolean }
  | { kind: "stub"; id: string; output: LineOutput; state: "open" | "end" }
  /** Перехід на початок іншої сцени — плашка-посилання на кінці виходу. */
  | { kind: "scene"; id: string; output: LineOutput; sceneId: SceneId }
  | { kind: "draft"; id: "draft"; draft: Draft }
  | { kind: "empty"; id: "empty" };

export type ProjEdge = {
  id: string;
  source: string;
  /** Точка виходу на вузлі-джерелі (лише для блоків; у чернетки одна точка). */
  sourceHandle: string;
  target: string;
  kind: "link" | "stub" | "end" | "draft";
  /** Вихід моделі, з якого йде зв'язок (для чернетки — вихід, до якого вона підключиться). */
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

  // Повертає вузол-ціль і (для нового піддерева) функцію, що його розгорне. Розгортаємо після того,
  // як записано ребро, щоб ребра йшли в тому ж порядку обходу, що й вузли.
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
    // Блок уже на полотні (сходження або повернення назад) — просто ще одна лінія до нього.
    return { id: target, kind: "link" };
  };

  const visit = (blockId: BlockId, reachable: boolean) => {
    const block = scene.blocks[blockId]!;
    nodes.push({ kind: "block", id: blockId, blockId, isStart: scene.startBlockId === blockId, reachable });
    for (const { output, next } of outputsOf(block)) {
      const key = outputKey(output);
      const sourceHandle = handleId(output);
      if (draft && draftKey === key) {
        // Чернетка стає між виходом і тим, що було далі (при вставці), або замість відростка.
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

  // Недосяжні блоки: окремі дерева. Коренями беремо ті, у які не веде жоден інший недосяжний блок.
  const rest = () => blockIds.filter((id) => !placed.has(id)).sort();
  let remaining = rest();
  while (remaining.length > 0) {
    const targeted = new Set<BlockId>();
    for (const id of remaining) {
      for (const { next } of outputsOf(scene.blocks[id]!)) {
        if (next?.type === "block" && next.blockId !== id) targeted.add(next.blockId);
      }
    }
    // У циклі кожен блок має вхід, тож тоді беремо просто перший.
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
