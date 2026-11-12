import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { Plus, X } from "lucide-react";
import { Tip } from "../components/Tip";
import { t } from "../strings/uk";
import { setOutputNext } from "./actions";
import { hoverEdge, startDraft, useCanvas } from "./canvas-store";
import type { LineOutput, ProjEdge } from "./projection";

export type EdgeData = { kind: ProjEdge["kind"]; output?: LineOutput; back?: boolean };

const STROKE: Record<ProjEdge["kind"], { color: string; dash?: string }> = {
  link: { color: "#71717a" },
  stub: { color: "#f87171", dash: "4 4" },
  end: { color: "#52525b" },
  draft: { color: "#3b82f6", dash: "5 4" },
};

/**
 * A link. Hovering a link between blocks shows, in the middle,
 * `(+)` — insert a block between them — and `×` — disconnect (FLOWS.md, 5, 8).
 */
export function LinkEdge(props: EdgeProps) {
  const data = props.data as EdgeData;
  const hovered = useCanvas((s) => s.hoveredEdge === props.id);
  const [path, labelX, labelY] = getBezierPath(props);
  const style = STROKE[data.kind];
  const interactive = data.kind === "link" && data.output;

  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={{
          stroke: hovered && interactive ? "#a1a1aa" : style.color,
          strokeWidth: 1.5,
          // A back link runs over the blocks — dashed, so it is not confused with the blocks beneath.
          strokeDasharray: data.back ? "6 4" : style.dash,
        }}
        interactionWidth={interactive ? 20 : 0}
      />
      {interactive && hovered && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute flex gap-1"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
            onMouseEnter={() => hoverEdge(props.id)}
            onMouseLeave={() => hoverEdge(null)}
          >
            <Tip label={t.canvas.tip.insert}>
              <button
                type="button"
                onClick={() => startDraft({ from: data.output!, insert: true })}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-zinc-200 hover:border-blue-400 hover:bg-blue-600 hover:text-white"
              >
                <Plus size={14} strokeWidth={2.5} />
              </button>
            </Tip>
            <Tip label={t.canvas.tip.disconnect}>
              <button
                type="button"
                onClick={() => void setOutputNext(data.output!, null)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-zinc-200 hover:border-red-400 hover:bg-red-600 hover:text-white"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </Tip>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
