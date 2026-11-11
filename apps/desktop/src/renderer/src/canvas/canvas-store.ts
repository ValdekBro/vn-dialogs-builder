import type { BlockId, LineId } from "@vn/core";
import { create } from "zustand";
import type { Draft } from "./projection";

/** Стан полотна, що не належить моделі: чернетка, редагування, режим з'єднання, фокус. */
export type CanvasState = {
  draft: Draft | null;
  /** Що зараз редагується прямо на блоці. */
  editing:
    | null
    | { kind: "line"; lineId: LineId }
    | { kind: "character"; blockId: BlockId }
    | { kind: "newLine"; blockId: BlockId };
  /** Вузол (блок або чернетка), до якого треба прокрутити полотно після наступної розкладки. */
  focus: { nodeId: string; flash: boolean } | null;
  /** Блок, що зараз коротко підсвічений (перехід за посиланням `↪`). */
  flash: BlockId | null;
  hoveredEdge: string | null;
};

export const useCanvas = create<CanvasState>(() => ({
  draft: null,
  editing: null,
  focus: null,
  flash: null,
  hoveredEdge: null,
}));

export function startDraft(draft: Draft) {
  useCanvas.setState({ draft, editing: null, focus: { nodeId: "draft", flash: false } });
}

export function cancelDraft() {
  useCanvas.setState({ draft: null });
}

export function focusBlock(nodeId: string, flash = false) {
  useCanvas.setState({ focus: { nodeId, flash } });
}

let edgeTimer: ReturnType<typeof setTimeout> | null = null;
/** Наведення на зв'язок: прибираємо з затримкою, щоб встигнути довести мишу до кнопок посередині. */
export function hoverEdge(id: string | null) {
  if (edgeTimer) clearTimeout(edgeTimer);
  edgeTimer = null;
  if (id !== null) useCanvas.setState({ hoveredEdge: id });
  else edgeTimer = setTimeout(() => useCanvas.setState({ hoveredEdge: null }), 200);
}

let flashTimer: ReturnType<typeof setTimeout> | null = null;
export function flashBlock(blockId: BlockId) {
  if (flashTimer) clearTimeout(flashTimer);
  useCanvas.setState({ flash: blockId });
  flashTimer = setTimeout(() => useCanvas.setState({ flash: null }), 1200);
}

export function resetCanvas() {
  useCanvas.setState({ draft: null, editing: null, focus: null, hoveredEdge: null });
}
