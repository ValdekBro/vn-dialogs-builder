import type { Block, Line } from "@vn/core";
import { Handle, Position, useConnection, type NodeProps } from "@xyflow/react";
import { linkTargets } from "@vn/core";
import { Flag, GripVertical, Play, Plus, Trash2, TriangleAlert, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { execute } from "../../api";
import { Tip } from "../../components/Tip";
import { useApp } from "../../store/app-store";
import { attempt } from "../../store/toast";
import { t } from "../../strings/uk";
import { moveBlocks, removeBlocks } from "../actions";
import { useCanvas } from "../canvas-store";
import { useAgent } from "../../store/agent-store";
import { startSimulation } from "../../simulation/sim-store";
import { CharacterPicker } from "../CharacterPicker";
import { useCanvasData } from "../context";
import type { ProjNode } from "../projection";
import { useAutoFocus } from "../useAutoFocus";

export const BLOCK_WIDTH = 260;

type BlockProj = Extract<ProjNode, { kind: "block" }>;

/**
 * A block on the canvas (FLOWS.md, 2, 6, 7): a character and their lines, each with its own output on the right.
 * One line is an ordinary dialogue step, several are a choice.
 */
export function BlockNode({ data, selected }: NodeProps) {
  const { node } = data as { node: BlockProj };
  const { scene, issuesByBlock } = useCanvasData();
  const block = scene.blocks[node.blockId];
  const character = useApp((s) => (block?.characterId ? s.project?.characters[block.characterId] : undefined));
  const editing = useCanvas((s) => s.editing);
  const flash = useCanvas((s) => s.flash === node.blockId);
  // The agent just changed the block — it glows; the agent asks to delete it — red frame (FLOWS.md, 14).
  const glowing = useAgent((s) => s.glowing.has(node.blockId));
  const doomed = useAgent((s) => !!s.approval?.blockIds.includes(node.blockId));
  // While dragging from an output, highlight the blocks it can be connected to.
  const dragFrom = useConnection((c) => (c.inProgress ? c.fromNode.id : null));
  if (!block) return null;
  const dropTarget = dragFrom !== null && linkTargets(scene, dragFrom).includes(block.id);

  // Dangling outputs are already visible by the red (+), so they do not colour the block frame.
  const issues = (issuesByBlock.get(block.id) ?? []).filter((i) => i.code !== "dangling_output");
  const isChoice = block.lines.length > 1;
  const pickingCharacter = editing?.kind === "character" && editing.blockId === block.id;
  const addingLine = editing?.kind === "newLine" && editing.blockId === block.id;

  const border = issues.length > 0 ? "border-red-500/80" : isChoice ? "border-violet-500/60" : "border-zinc-700";
  const ring = doomed
    ? "ring-2 ring-red-500 ring-offset-2 ring-offset-zinc-950 animate-pulse"
    : flash
      ? "ring-2 ring-amber-400"
      : glowing
        ? "ring-2 ring-emerald-400/80 shadow-lg shadow-emerald-500/20"
        : dropTarget ? "ring-2 ring-sky-400" : selected ? "ring-2 ring-blue-500" : "";

  return (
    <div
      data-testid={`block-${block.id}`}
      style={{ width: BLOCK_WIDTH }}
      className={`group relative rounded-lg border bg-zinc-900 text-sm shadow-md shadow-black/30 ${border} ${ring} ${node.reachable ? "" : "opacity-80"}`}
    >
      <Handle type="target" position={Position.Left} id="in" isConnectableStart={false} className="!z-10 !h-2 !w-2 !border-0 !bg-zinc-500" />
      <Toolbar block={block} isStart={node.isStart} />

      {/* The header is the drag handle: it can be grabbed anywhere except the name and badges (FLOWS.md, 8a). */}
      <div
        data-testid="drag-handle"
        className="vn-drag flex cursor-grab items-center gap-2 rounded-t-lg px-3 pb-1 pt-2 hover:bg-zinc-800/50 active:cursor-grabbing"
      >
        <Tip label={t.canvas.tip.drag}>
          <span className="-ml-1.5 -mr-1 flex shrink-0 text-zinc-600 group-hover:text-zinc-400">
            <GripVertical size={14} />
          </span>
        </Tip>
        <Tip label={t.canvas.tip.character}>
          <button
            type="button"
            className="nodrag -mx-1 flex min-w-0 items-center gap-1.5 rounded px-1 hover:bg-zinc-800"
            onClick={(e) => {
              e.stopPropagation();
              useCanvas.setState({ editing: { kind: "character", blockId: block.id } });
            }}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: character?.color ?? "transparent", border: character ? "none" : "1px dashed #ef4444" }}
            />
            <span className={`truncate font-medium ${character ? "" : "italic text-red-400"}`}>{character?.name ?? t.canvas.noCharacter}</span>
          </button>
        </Tip>
        <span className="flex-1" />
        {node.isStart && (
          <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 text-[11px] text-emerald-300">
            <Flag size={10} /> {t.canvas.start}
          </span>
        )}
        {issues.length > 0 && (
          <Tip label={issues.map((i) => i.message).join(" · ")}>
            <span className="text-red-400">
              <TriangleAlert size={14} />
            </span>
          </Tip>
        )}
      </div>
      {pickingCharacter && (
        <div className="absolute left-2 top-8 z-10 w-56 rounded-md border border-zinc-700 bg-zinc-900 p-2 shadow-xl">
          <CharacterPicker
            current={block.characterId}
            onCancel={() => useCanvas.setState({ editing: null })}
            onPick={async (picked) => {
              useCanvas.setState({ editing: null });
              const characterId = await picked;
              if (characterId) void attempt(() => execute("updateBlock", { blockId: block.id, characterId }));
            }}
          />
        </div>
      )}

      <div className="pb-1.5 pt-1">
        {block.lines.map((line) => (
          <LineRow key={line.id} block={block} line={line} isChoice={isChoice} />
        ))}
        {addingLine && <NewLineInput blockId={block.id} index={block.lines.length + 1} />}
      </div>

      {!addingLine && (
        <Tip label={t.canvas.tip.addLine} side="bottom">
          <button
            type="button"
            className="nodrag absolute -bottom-3 left-1/2 hidden h-6 -translate-x-1/2 items-center gap-1 rounded-full border border-zinc-600 bg-zinc-800 px-2 text-xs text-zinc-300 hover:border-violet-400 hover:text-white group-hover:flex"
            onClick={(e) => {
              e.stopPropagation();
              useCanvas.setState({ editing: { kind: "newLine", blockId: block.id } });
            }}
          >
            <Plus size={12} /> {t.canvas.addLine}
          </button>
        </Tip>
      )}
    </div>
  );
}

function Toolbar({ block, isStart }: { block: Block; isStart: boolean }) {
  const btn = "nodrag flex h-7 w-7 items-center justify-center rounded text-zinc-300 hover:bg-zinc-700 hover:text-white";
  return (
    <div className="absolute -top-9 right-0 hidden gap-0.5 rounded-md border border-zinc-700 bg-zinc-800 p-0.5 shadow-lg group-hover:flex">
      <Tip label={t.canvas.tip.play}>
        <button
          type="button"
          aria-label={t.canvas.tip.play}
          className={`${btn} hover:!text-emerald-400`}
          onClick={(e) => {
            e.stopPropagation();
            const sceneId = useApp.getState().sceneId;
            if (sceneId) startSimulation(sceneId, block.id);
          }}
        >
          <Play size={14} />
        </button>
      </Tip>
      {!isStart && (
        <Tip label={t.canvas.tip.makeStart}>
          <button
            type="button"
            className={btn}
            onClick={(e) => {
              e.stopPropagation();
              const sceneId = useApp.getState().sceneId;
              void attempt(() => execute("updateScene", { sceneId, startBlockId: block.id }));
            }}
          >
            <Flag size={14} />
          </button>
        </Tip>
      )}
      {block.pos && (
        <Tip label={t.canvas.tip.unpin}>
          <button
            type="button"
            className={btn}
            onClick={(e) => {
              e.stopPropagation();
              void moveBlocks([{ blockId: block.id, pos: null }]);
            }}
          >
            <Undo2 size={14} />
          </button>
        </Tip>
      )}
      <Tip label={t.canvas.tip.remove}>
        <button
          type="button"
          className={`${btn} hover:!bg-red-600`}
          onClick={(e) => {
            e.stopPropagation();
            void removeBlocks([block.id]);
          }}
        >
          <Trash2 size={14} />
        </button>
      </Tip>
    </div>
  );
}

function LineRow({ block, line, isChoice }: { block: Block; line: Line; isChoice: boolean }) {
  const editing = useCanvas((s) => s.editing?.kind === "line" && s.editing.lineId === line.id);
  const dangling = useCanvasData().issuesByOutput.get(`${block.id}:${line.id}`)?.some((i) => i.code === "dangling_output");
  const empty = line.text.trim() === "";

  return (
    <div className={`group/line relative flex items-start gap-2 px-3 py-1 ${isChoice ? "border-t border-zinc-800/80" : ""}`}>
      {isChoice && <span className="mt-0.5 text-violet-400">◇</span>}
      {editing ? (
        <TextEditor
          initial={line.text}
          onDone={(text) => {
            useCanvas.setState({ editing: null });
            if (text !== null && text !== line.text) void attempt(() => execute("updateLine", { lineId: line.id, text }));
          }}
        />
      ) : (
        <div
          onDoubleClick={(e) => {
            e.stopPropagation();
            useCanvas.setState({ editing: { kind: "line", lineId: line.id } });
          }}
          title={line.text || undefined}
          className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${isChoice ? "line-clamp-2" : "line-clamp-4"} ${empty ? "italic text-red-400/80" : "text-zinc-200"}`}
        >
          {empty ? t.canvas.emptyText : line.text}
        </div>
      )}
      {isChoice && !editing && (
        <Tip label={t.canvas.tip.removeLine}>
          <button
            type="button"
            className="nodrag mt-0.5 hidden h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-red-600 hover:text-white group-hover/line:flex"
            onClick={(e) => {
              e.stopPropagation();
              void attempt(() => execute("deleteLine", { lineId: line.id }));
            }}
          >
            <X size={12} />
          </button>
        </Tip>
      )}
      <Handle
        type="source"
        position={Position.Right}
        id={line.id}
        className={`!h-2.5 !w-2.5 !border-0 ${dangling ? "!bg-red-400" : isChoice ? "!bg-violet-400" : "!bg-zinc-400"}`}
      />
    </div>
  );
}

/** Input for a new option line: Enter adds it and starts the next one, Enter on empty or Esc — done. */
function NewLineInput({ blockId, index }: { blockId: string; index: number }) {
  const [value, setValue] = useState("");
  const ref = useAutoFocus<HTMLInputElement>();
  const done = useRef(false);
  const close = () => {
    done.current = true;
    useCanvas.setState({ editing: null });
  };
  return (
    <div className="flex items-center gap-2 border-t border-zinc-800/80 px-3 py-1">
      <span className="text-violet-400/60">◇</span>
      <input
        ref={ref}
        value={value}
        placeholder={t.canvas.choicePlaceholder(index)}
        onChange={(e) => setValue(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            if (value.trim() === "") return close();
            void attempt(() => execute("addLine", { blockId, text: value.trim() }));
            setValue("");
          } else if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
        onBlur={() => {
          if (done.current) return;
          if (value.trim()) void attempt(() => execute("addLine", { blockId, text: value.trim() }));
          close();
        }}
        className="nodrag min-w-0 flex-1 rounded border border-blue-500 bg-zinc-950 px-1.5 py-0.5 text-sm outline-none"
      />
    </div>
  );
}

/** Multiline line-text input: Enter saves, Shift+Enter inserts a newline, Esc cancels. */
export function TextEditor(props: { initial: string; placeholder?: string; onDone: (text: string | null) => void }) {
  const [value, setValue] = useState(props.initial);
  const ref = useAutoFocus<HTMLTextAreaElement>();
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, ref]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      placeholder={props.placeholder}
      onChange={(e) => setValue(e.target.value)}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          done.current = true;
          props.onDone(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          done.current = true;
          props.onDone(null);
        }
      }}
      onBlur={() => {
        if (done.current) return;
        done.current = true;
        props.onDone(value);
      }}
      className="nodrag nowheel min-w-0 flex-1 resize-none overflow-hidden rounded border border-blue-500 bg-zinc-950 px-1.5 py-1 text-sm outline-none"
    />
  );
}
