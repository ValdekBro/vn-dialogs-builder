import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import type { Projection } from "./projection";

const elk = new ELK();

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type Positions = Map<string, Point>;

/**
 * Left-to-right tree layout (ARCHITECTURE.md, 2.3). The output order is fixed,
 * so choice branches go in the same order as the options in the block, and arrows do not cross.
 *
 * Blocks the user moved manually (`pinned`) stay where they were put;
 * their service nodes (`(+)`, "End", scene jump, draft) move with them.
 */
export async function layoutProjection(
  projection: Projection,
  sizes: Map<string, Size>,
  pinned: Map<string, Point> = new Map(),
): Promise<Positions> {
  // Ports of each node in output order: projection edges already come in this order.
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
      // Cycles are broken by a depth-first walk: only real back links along a branch count as backward,
      // while convergence (a link into a block of a neighbouring branch) stays an ordinary forward line.
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
          // Indices go clockwise: right side top to bottom, left side after them.
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

/** Manual block positions on top of the automatic layout. A pure function — for tests. */
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
  // Service nodes (not blocks) shift the same way as the block their link comes from.
  // The chain "draft → (+)" needs several passes.
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
