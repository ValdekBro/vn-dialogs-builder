import type { BlockId, LineId } from "@vn/core";
import { create } from "zustand";
import type { Draft } from "./projection";

/** Canvas state that is not part of the model: draft, editing, connect mode, focus. */
export type CanvasState = {
  draft: Draft | null;
  /** What is being edited right on the block. */
  editing:
    | null
    | { kind: "line"; lineId: LineId }
    | { kind: "character"; blockId: BlockId }
    | { kind: "newLine"; blockId: BlockId };
  /** The node (block or draft) to scroll the canvas to after the next layout. */
  focus: { nodeId: string; flash: boolean } | null;
  /** The block that is briefly highlighted (following a `↪` reference). */
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
/** Link hover: cleared with a delay so the mouse has time to reach the buttons in the middle. */
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
