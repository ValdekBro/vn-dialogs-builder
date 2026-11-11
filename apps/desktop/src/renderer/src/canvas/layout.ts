import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import type { Projection } from "./projection";

const elk = new ELK();

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type Positions = Map<string, Point>;

/**
 * Розкладка дерева зліва направо (ARCHITECTURE.md, 2.3). Порядок виходів фіксований,
 * тож гілки варіантів ідуть у тому ж порядку, що й варіанти в блоці, і стрілки не перехрещуються.
 *
 * Блоки, які користувач переставив вручну (`pinned`), стоять там, де їх поставили;
 * їхні службові вузли (`(+)`, «Кінець», перехід на сцену, чернетка) їдуть разом із ними.
 */
export async function layoutProjection(
  projection: Projection,
  sizes: Map<string, Size>,
  pinned: Map<string, Point> = new Map(),
): Promise<Positions> {
  // Порти кожного вузла в порядку виходів: ребра проєкції вже йдуть у цьому порядку.
  const ports = new Map<string, string[]>();
  for (const e of projection.edges) {
    const list = ports.get(e.source) ?? [];
    const port = `${e.source}::${e.sourceHandle}`;
    if (!list.includes(port)) list.push(port);
    ports.set(e.source, list);
  }

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "64",
      "elk.spacing.nodeNode": "28",
      "elk.spacing.componentComponent": "56",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      // Цикл рвемо обходом у глибину: назад вважаються лише справжні зв'язки назад по гілці,
      // а сходження (зв'язок у блок сусідньої гілки) лишається звичайною лінією вперед.
      "elk.layered.cycleBreaking.strategy": "DEPTH_FIRST",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
      "elk.separateConnectedComponents": "true",
    },
    children: projection.nodes.map((n) => {
      const size = sizes.get(n.id) ?? { width: 240, height: 80 };
      const nodePorts = ports.get(n.id) ?? [];
      return {
        id: n.id,
        width: size.width,
        height: size.height,
        layoutOptions: { "elk.portConstraints": "FIXED_ORDER" },
        ports: [
          // Індекси йдуть за годинниковою стрілкою: праворуч — згори вниз, ліворуч — після них.
          ...nodePorts.map((id, i) => ({
            id,
            layoutOptions: { "elk.port.side": "EAST", "elk.port.index": String(i) },
          })),
          { id: `${n.id}::in`, layoutOptions: { "elk.port.side": "WEST", "elk.port.index": String(nodePorts.length) } },
        ],
      };
    }),
    edges: projection.edges.map((e) => ({
      id: e.id,
      sources: [`${e.source}::${e.sourceHandle}`],
      targets: [`${e.target}::in`],
    })),
  };

  const result = await elk.layout(graph);
  const positions: Positions = new Map();
  for (const c of result.children ?? []) positions.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
  return applyPinned(projection, positions, pinned);
}

/** Ручні позиції блоків поверх автоматичної розкладки. Чистa функція — для тестів. */
export function applyPinned(projection: Projection, auto: Positions, pinned: Map<string, Point>): Positions {
  if (pinned.size === 0) return auto;
  const out: Positions = new Map(auto);
  const shift = new Map<string, Point>();
  for (const n of projection.nodes) {
    const p = pinned.get(n.id);
    const a = auto.get(n.id);
    if (n.kind !== "block" || !p || !a) continue;
    out.set(n.id, p);
    shift.set(n.id, { x: p.x - a.x, y: p.y - a.y });
  }
  // Службові вузли (не блоки) зсуваються так само, як блок, з якого в них веде зв'язок.
  // Ланцюжок «чернетка → (+)» — тому кілька проходів.
  const kind = new Map(projection.nodes.map((n) => [n.id, n.kind]));
  for (let changed = true; changed; ) {
    changed = false;
    for (const e of projection.edges) {
      if (kind.get(e.target) === "block" || shift.has(e.target)) continue;
      const d = shift.get(e.source);
      const a = auto.get(e.target);
      if (!d || !a) continue;
      shift.set(e.target, d);
      out.set(e.target, { x: a.x + d.x, y: a.y + d.y });
      changed = true;
    }
  }
  return out;
}
