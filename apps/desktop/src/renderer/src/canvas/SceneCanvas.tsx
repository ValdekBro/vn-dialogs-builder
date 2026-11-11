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

  // Розміри вузлів вимірює React Flow; без них розкладка неточна, тож чекаємо на всі.
  const sizes = useRef(new Map<string, Size>());
  const [sizesVersion, setSizesVersion] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { shown, final, target, place } = useAnimatedPositions();
  // Блоки, переставлені вручну (FLOWS.md, 8a), і ті, що тягнуть просто зараз.
  const pinned = useMemo(() => {
    const map = new Map<string, Point>();
    for (const b of Object.values(scene.blocks)) if (b.pos) map.set(b.id, b.pos);
    return map;
  }, [scene]);
  const [dragging, setDragging] = useState<Map<string, Point>>(new Map());
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;
  const fittedScene = useRef<string | null>(null);

  // Нова сцена — нове полотно.
  useEffect(() => {
    resetCanvas();
    setSelected(new Set());
  }, [scene.id]);

  // Розкладка після кожної зміни структури або розмірів.
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

  // Перший показ сцени — вмістити все; далі — прокрутка до нового або вибраного вузла, якщо він поза екраном.
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

  // Під час перетягування службові вузли блоку ((+), «Кінець», перехід) їдуть разом із ним.
  const visible = useMemo(() => (dragging.size > 0 ? applyPinned(projection, shown, dragging) : shown), [projection, shown, dragging]);

  const nodes: Node[] = useMemo(
    () =>
      projection.nodes.map((n) => {
        const pos = visible.get(n.id);
        const size = sizes.current.get(n.id);
        return {
          id: n.id,
          // Виміряні розміри повертаємо React Flow: без них він знову ховає вузол до повторного виміру,
          // і поле вводу на вузлі втрачає фокус.
          measured: size,
          type: n.kind,
          data: { node: n },
          position: pos ?? { x: 0, y: 0 },
          // Доки вузол не розкладено, він невидимий, але вимірюється. Кнопки є на всіх вузлах,
          // тож кліки потрібні всім (React Flow інакше вимикає їх для вузлів, які не можна вибрати).
          style: pos ? { pointerEvents: "all" } : { opacity: 0, pointerEvents: "none" },
          selectable: n.kind === "block",
          selected: selected.has(n.id),
          // Блок тягнуть лише за ручку ⋮⋮ у заголовку, щоб не заважати редагуванню тексту.
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
        // Зв'язок назад (ціль ліворуч від джерела) іде крізь дерево — малюємо його над блоками,
        // щоб на нього можна було навести й відключити.
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

  // Відпустили — блоки лишаються там, де їх поставили, і позиція зберігається в проєкті.
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

  // Delete видаляє вибрані блоки; Esc скасовує чернетку.
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

  // Перетягування від виходу (FLOWS.md, 3, 8): на блок — з'єднати з ним (сходження й цикли дозволені),
  // на порожнє місце — створити новий блок.
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
    // Відпустили на самому блоці, а не на його точці входу — теж з'єднуємо.
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
          // Клавіатурна навігація React Flow перехоплює Enter/пробіл у полях на вузлах, а свою ми робимо після MVP.
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
            Мінікарта: видима зараз частина — світліша, з синьою рамкою; решта притемнена.
            Блоки помітні на тлі, вибір — фіолетовий, старт — зелений, незавершені виходи — червоні.
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

/** Зум і «вмістити все» з підказками (замість стандартних кнопок React Flow). */
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
 * Позиції вузлів з плавним переходом: нова розкладка не стрибає, а «доїжджає» (FLOWS.md, принцип 6).
 * Анімуємо самі позиції (а не CSS), щоб зв'язки рухалися разом із вузлами.
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

  /** Поставити вузли одразу, без анімації (після перетягування). */
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
