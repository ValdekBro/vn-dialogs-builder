import { linkTargets, sceneIssues, type Scene } from "@vn/core";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, Maximize, Minus, Plus } from "lucide-react";
import { Tip } from "../components/Tip";
import { useApp } from "../store/app-store";
import { t } from "../strings/uk";
import { moveBlocks, removeBlocks, resetLayout, setOutputNext } from "./actions";
import { cancelDraft, resetCanvas, startDraft, useCanvas, hoverEdge } from "./canvas-store";
import { CanvasContext, indexIssues } from "./context";
import { applyPinned, layoutProjection, type Point, type Positions, type Size } from "./layout";
import { LinkEdge, type EdgeData } from "./LinkEdge";
import { BlockNode } from "./nodes/BlockNode";
import { DraftNode, EmptyNode, SceneLinkNode, StubNode } from "./nodes/OtherNodes";
import { projectScene, type LineOutput, type ProjNode } from "./projection";

const nodeTypes = { block: BlockNode, draft: DraftNode, stub: StubNode, scene: SceneLinkNode, empty: EmptyNode };
const edgeTypes = { vn: LinkEdge };
const ANIMATION_MS = 220;

export function SceneCanvas({ scene }: { scene: Scene }) {
  return (
    <ReactFlowProvider>
      <CanvasInner scene={scene} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ scene }: { scene: Scene }) {
  const rf = useReactFlow();
  const draft = useCanvas((s) => s.draft);
  const focus = useCanvas((s) => s.focus);
  const containerRef = useRef<HTMLDivElement>(null);

  const projection = useMemo(() => projectScene(scene, draft), [scene, draft]);
  const project = useApp((s) => s.project)!;
  const issues = useMemo(() => indexIssues(sceneIssues(scene, project)), [scene, project]);
  const canvasData = useMemo(() => ({ scene, ...issues }), [scene, issues]);

  // React Flow measures node sizes; without them the layout is inaccurate, so we wait for all of them.
  const sizes = useRef(new Map<string, Size>());
  const [sizesVersion, setSizesVersion] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { shown, final, target, place } = useAnimatedPositions();
  // Blocks moved manually (FLOWS.md, 8a), and the ones being dragged right now.
  const pinned = useMemo(() => {
    const map = new Map<string, Point>();
    for (const b of Object.values(scene.blocks)) if (b.pos) map.set(b.id, b.pos);
    return map;
  }, [scene]);
  const [dragging, setDragging] = useState<Map<string, Point>>(new Map());
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;
  const fittedScene = useRef<string | null>(null);

  // New scene — new canvas.
  useEffect(() => {
    resetCanvas();
    setSelected(new Set());
  }, [scene.id]);

  // Layout after every change of structure or sizes.
  useEffect(() => {
    const allMeasured = projection.nodes.every((n) => sizes.current.has(n.id));
    if (!allMeasured) return;
    let cancelled = false;
    void layoutProjection(projection, sizes.current, pinned).then((positions) => {
      if (!cancelled) target(positions);
    });
    return () => {
      cancelled = true;
    };
  }, [projection, sizesVersion, target, pinned]);

  // First showing of a scene fits everything; after that, scroll to a new or selected node if it is off screen.
  useEffect(() => {
    if (final.size === 0) return;
    if (fittedScene.current !== scene.id && projection.nodes.every((n) => final.has(n.id))) {
      fittedScene.current = scene.id;
      void rf.fitView({ padding: 0.2, maxZoom: 1 });
      return;
    }
    if (!focus) return;
    const pos = final.get(focus.nodeId);
    const size = sizes.current.get(focus.nodeId);
    if (!pos || !size) return;
    useCanvas.setState({ focus: null });
    const el = containerRef.current;
    const vp = rf.getViewport();
    const cx = pos.x + size.width / 2;
    const cy = pos.y + size.height / 2;
    const sx = cx * vp.zoom + vp.x;
    const sy = cy * vp.zoom + vp.y;
    const margin = 80;
    const visible = el && sx > margin && sy > margin && sx < el.clientWidth - margin && sy < el.clientHeight - margin;
    if (!visible || focus.flash) void rf.setCenter(cx, cy, { zoom: vp.zoom, duration: 300 });
  }, [final, focus, rf, scene.id, projection]);

  // While dragging, a block's service nodes ((+), "End", jump) move with it.
  const visible = useMemo(() => (dragging.size > 0 ? applyPinned(projection, shown, dragging) : shown), [projection, shown, dragging]);

  const nodes: Node[] = useMemo(
    () =>
      projection.nodes.map((n) => {
        const pos = visible.get(n.id);
        const size = sizes.current.get(n.id);
        return {
          id: n.id,
          // Measured sizes are handed back to React Flow: without them it hides the node again until re-measured,
          // and the input on the node loses focus.
          measured: size,
          type: n.kind,
          data: { node: n },
          position: pos ?? { x: 0, y: 0 },
          // Until a node is laid out it is invisible but measured. Every node has buttons,
          // so all of them need clicks (otherwise React Flow disables them for non-selectable nodes).
          style: pos ? { pointerEvents: "all" } : { opacity: 0, pointerEvents: "none" },
          selectable: n.kind === "block",
          selected: selected.has(n.id),
          // A block is dragged only by the ⋮⋮ handle in its header, so it does not get in the way of text editing.
          draggable: n.kind === "block",
          dragHandle: ".vn-drag",
          connectable: n.kind === "block",
          zIndex: n.kind === "draft" ? 10 : undefined,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projection, visible, selected, sizesVersion],
  );

  const edges: Edge[] = useMemo(
    () =>
      projection.edges.map((e) => {
        // A back link (target left of the source) runs through the tree — draw it above the blocks
        // so it can be hovered and disconnected.
        const from = final.get(e.source);
        const to = final.get(e.target);
        const back = !!from && !!to && to.x <= from.x;
        return {
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle,
          target: e.target,
          targetHandle: "in",
          type: "vn",
          selectable: false,
          zIndex: back ? 1000 : undefined,
          data: { kind: e.kind, output: e.output, back } satisfies EdgeData,
        };
      }),
    [projection, final],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    let resized = false;
    let selection: Set<string> | null = null;
    let dragged: Map<string, Point> | null = null;
    for (const c of changes) {
      if (c.type === "dimensions" && c.dimensions) {
        const prev = sizes.current.get(c.id);
        const next = { width: c.dimensions.width, height: c.dimensions.height };
        if (!prev || Math.abs(prev.width - next.width) > 0.5 || Math.abs(prev.height - next.height) > 0.5) {
          sizes.current.set(c.id, next);
          resized = true;
        }
      } else if (c.type === "position" && c.position && c.dragging) {
        dragged ??= new Map(draggingRef.current);
        dragged.set(c.id, c.position);
      } else if (c.type === "select") {
        selection ??= new Set(selectedRef.current);
        if (c.selected) selection.add(c.id);
        else selection.delete(c.id);
      }
    }
    if (resized) setSizesVersion((v) => v + 1);
    if (selection) setSelected(selection);
    if (dragged) setDragging(dragged);
  }, []);

  // On release the blocks stay where they were put, and the position is saved in the project.
  const onNodeDragStop = useCallback(() => {
    const moved = draggingRef.current;
    if (moved.size === 0) return;
    place(applyPinned(projection, shownRef.current, moved));
    setDragging(new Map());
    void moveBlocks([...moved].map(([blockId, pos]) => ({ blockId, pos })));
  }, [projection, place]);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Delete removes the selected blocks; Esc cancels the draft.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "Escape") {
        if (useCanvas.getState().draft) cancelDraft();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const ids = [...selectedRef.current].filter((id) => scene.blocks[id]);
        if (ids.length > 0) {
          e.preventDefault();
          void removeBlocks(ids);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scene]);

  // Dragging from an output (FLOWS.md, 3, 8): onto a block — connect to it (convergence and cycles are allowed),
  // onto empty space — create a new block.
  const outputOf = (source: string, handle: string | null | undefined): LineOutput | null => {
    const block = scene.blocks[source];
    if (!block || !handle || !block.lines.some((l) => l.id === handle)) return null;
    return { blockId: source, lineId: handle };
  };
  const isValid = (c: Connection | Edge) => {
    const from = outputOf(c.source, c.sourceHandle);
    return !!from && !!scene.blocks[c.target] && linkTargets(scene, from.blockId).includes(c.target);
  };
  const onConnect = (c: Connection) => {
    const from = outputOf(c.source, c.sourceHandle);
    if (from && isValid(c)) void setOutputNext(from, { type: "block", blockId: c.target });
  };
  const onConnectEnd = (e: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode) return;
    const from = outputOf(state.fromNode.id, state.fromHandle?.id);
    if (!from) return;
    // Released on the block itself rather than its input point — connect as well.
    const point = "changedTouches" in e ? e.changedTouches[0]! : e;
    const nodeEl = document.elementFromPoint(point.clientX, point.clientY)?.closest(".react-flow__node");
    const targetId = nodeEl?.getAttribute("data-id");
    if (targetId && scene.blocks[targetId]) {
      if (linkTargets(scene, from.blockId).includes(targetId)) void setOutputNext(from, { type: "block", blockId: targetId });
      return;
    }
    if (!nodeEl) startDraft({ from });
  };

  return (
    <CanvasContext.Provider value={canvasData}>
      <div ref={containerRef} className="vn-canvas relative h-full w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgeMouseEnter={(_, e) => hoverEdge(e.id)}
          onEdgeMouseLeave={() => hoverEdge(null)}
          onPaneClick={() => useCanvas.setState({ editing: null })}
          deleteKeyCode={null}
          // React Flow keyboard navigation swallows Enter/space in node inputs, and ours comes after the MVP.
          disableKeyboardA11y
          selectionKeyCode={null}
          panActivationKeyCode={null}
          multiSelectionKeyCode={["Meta", "Control", "Shift"]}
          nodesDraggable
          onNodeDragStop={onNodeDragStop}
          nodesConnectable
          connectionRadius={60}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          isValidConnection={(c) => isValid(c)}
          selectionOnDrag={false}
          panOnScroll
          zoomOnDoubleClick={false}
          minZoom={0.2}
          maxZoom={2}
          colorMode="dark"
          attributionPosition="top-right"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
          <ZoomControls onAutoLayout={pinned.size > 0 ? () => void resetLayout(scene.id) : undefined} />
          {/*
            Minimap: the currently visible part is lighter with a blue frame; the rest is dimmed.
            Blocks stand out from the background, a choice is violet, the start is green, unfinished outputs are red.
          */}
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            bgColor="#27272a"
            maskColor="rgba(9, 9, 11, 0.6)"
            maskStrokeColor="#60a5fa"
            maskStrokeWidth={2}
            nodeBorderRadius={3}
            nodeColor={(n) => minimapColor((n.data as { node: ProjNode }).node, scene)}
            className="!rounded-md !border !border-zinc-700 overflow-hidden"
          />
        </ReactFlow>
      </div>
    </CanvasContext.Provider>
  );
}

/** Zoom and "fit all" with tooltips (instead of the standard React Flow buttons). */
function ZoomControls({ onAutoLayout }: { onAutoLayout?: () => void }) {
  const rf = useReactFlow();
  const btn = "flex h-8 w-8 items-center justify-center text-zinc-300 hover:bg-zinc-700 hover:text-white";
  return (
    <Panel position="bottom-left" className="flex flex-col overflow-hidden rounded-md border border-zinc-700 bg-zinc-800 shadow-lg">
      <Tip label={t.canvas.tip.zoomIn} side="right">
        <button type="button" className={btn} onClick={() => void rf.zoomIn({ duration: 150 })}>
          <Plus size={16} />
        </button>
      </Tip>
      <Tip label={t.canvas.tip.zoomOut} side="right">
        <button type="button" className={btn} onClick={() => void rf.zoomOut({ duration: 150 })}>
          <Minus size={16} />
        </button>
      </Tip>
      <Tip label={t.canvas.tip.fit} side="right">
        <button type="button" className={btn} onClick={() => void rf.fitView({ padding: 0.2, maxZoom: 1, duration: 250 })}>
          <Maximize size={14} />
        </button>
      </Tip>
      {onAutoLayout && (
        <Tip label={t.canvas.tip.autoLayout} side="right">
          <button type="button" className={`${btn} border-t border-zinc-700`} onClick={onAutoLayout}>
            <LayoutGrid size={14} />
          </button>
        </Tip>
      )}
    </Panel>
  );
}

function minimapColor(n: ProjNode, scene: Scene): string {
  if (n.kind === "block") {
    if (n.isStart) return "#34d399";
    return (scene.blocks[n.blockId]?.lines.length ?? 1) > 1 ? "#a78bfa" : "#a1a1aa";
  }
  if (n.kind === "draft") return "#3b82f6";
  if (n.kind === "stub") return n.state === "open" ? "#f87171" : "#71717a";
  if (n.kind === "scene") return "#38bdf8";
  return "#71717a";
}

/**
 * Node positions with a smooth transition: a new layout does not jump but glides into place (FLOWS.md, principle 6).
 * We animate the positions themselves (not CSS) so links move together with the nodes.
 */
function useAnimatedPositions() {
  const [shown, setShown] = useState<Positions>(new Map());
  const [final, setFinal] = useState<Positions>(new Map());
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const frame = useRef<number | null>(null);

  const target = useCallback((next: Positions) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    setFinal(next);
    const from = shownRef.current;
    const moving = [...next].some(([id, p]) => {
      const f = from.get(id);
      return f && (Math.abs(f.x - p.x) > 1 || Math.abs(f.y - p.y) > 1);
    });
    if (!moving || from.size === 0) {
      setShown(next);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ANIMATION_MS);
      const ease = 1 - Math.pow(1 - k, 3);
      const frameMap: Positions = new Map();
      for (const [id, p] of next) {
        const f = from.get(id);
        frameMap.set(id, f ? { x: f.x + (p.x - f.x) * ease, y: f.y + (p.y - f.y) * ease } : p);
      }
      setShown(frameMap);
      frame.current = k < 1 ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);
  }, []);

  /** Place nodes immediately, without animation (after dragging). */
  const place = useCallback((next: Positions) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setShown(next);
  }, []);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  return { shown, final, target, place };
}
