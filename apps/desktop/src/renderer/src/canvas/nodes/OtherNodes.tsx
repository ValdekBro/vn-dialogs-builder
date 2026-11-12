import type { CharacterId } from "@vn/core";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ArrowRightFromLine, Link2, Plus, Square, X } from "lucide-react";
import { linkTargets } from "@vn/core";
import { useEffect, useRef, useState } from "react";
import { execute } from "../../api";
import { Tip } from "../../components/Tip";
import { selectScene, useApp } from "../../store/app-store";
import { attempt } from "../../store/toast";
import { t } from "../../strings/uk";
import { saveDraft, setOutputNext } from "../actions";
import { cancelDraft, startDraft } from "../canvas-store";
import { CharacterPicker } from "../CharacterPicker";
import { useCanvasData } from "../context";
import type { LineOutput, ProjNode } from "../projection";
import { useAutoFocus } from "../useAutoFocus";
import { BLOCK_WIDTH } from "./BlockNode";

type Data<K extends ProjNode["kind"]> = { node: Extract<ProjNode, { kind: K }> };
const nodeOf = <K extends ProjNode["kind"]>(props: NodeProps) => (props.data as Data<K>).node;

const hiddenTarget = <Handle type="target" position={Position.Left} id="in" isConnectable={false} className="!opacity-0" />;

const roundBtn =
  "nodrag flex h-7 w-7 items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-zinc-300 hover:border-blue-400 hover:text-white";

/**
 * A dangling output (FLOWS.md, 3): `(+)` — a new block; next to it, "Finish": jump to the start
 * of another scene (or create a new one) or mark the end of the story.
 * The extra button is part of the node (just invisible until hover), so the cursor reaches it easily.
 */
export function StubNode(props: NodeProps) {
  const node = nodeOf<"stub">(props);
  const [menu, setMenu] = useState(false);
  if (node.state === "end") {
    return (
      <div className="relative">
        {hiddenTarget}
        <Tip label={t.canvas.tip.removeEnd}>
          <button
            type="button"
            onClick={() => void setOutputNext(node.output, null)}
            className="nodrag group/end flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] font-semibold tracking-wide text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
          >
            <Square size={9} className="fill-current group-hover/end:hidden" />
            <X size={11} className="hidden group-hover/end:block" />
            {t.canvas.endLabel}
          </button>
        </Tip>
      </div>
    );
  }
  return (
    <div className="group relative flex items-center gap-1.5">
      {hiddenTarget}
      <Tip label={t.canvas.tip.newBlock}>
        <button
          type="button"
          data-testid={`add-${node.output.lineId}`}
          onClick={() => startDraft({ from: node.output })}
          className="nodrag flex h-8 w-8 items-center justify-center rounded-full border border-red-400/70 bg-zinc-900 text-red-300 hover:border-blue-400 hover:bg-blue-600 hover:text-white"
        >
          <Plus size={16} strokeWidth={2.5} />
        </button>
      </Tip>
      <div className={`flex gap-1 ${menu ? "visible" : "invisible group-hover:visible"}`}>
        <Tip label={t.canvas.tip.finish}>
          <button type="button" aria-expanded={menu} className={roundBtn} onClick={() => setMenu((v) => !v)}>
            <ArrowRightFromLine size={14} />
          </button>
        </Tip>
      </div>
      {menu && <FinishMenu output={node.output} onClose={() => setMenu(false)} />}
    </div>
  );
}

/**
 * The "Finish" menu: jump to the start of another scene, create a new scene and jump into it,
 * or mark the end of the story.
 */
function FinishMenu({ output, onClose }: { output: LineOutput; onClose: () => void }) {
  const { scene } = useCanvasData();
  const project = useApp((s) => s.project)!;
  const ref = useRef<HTMLDivElement>(null);
  const others = project.sceneOrder.filter((id) => id !== scene.id).map((id) => project.scenes[id]!);
  // Blocks this output can be connected to (any block of the scene, including ones higher up the branch).
  const targets = linkTargets(scene, output.blockId).map((id) => scene.blocks[id]!);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const goTo = (sceneId: string) => {
    onClose();
    void setOutputNext(output, { type: "scene", sceneId });
  };
  const item = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-700";

  return (
    <div
      ref={ref}
      role="menu"
      className="nodrag nowheel absolute left-10 top-9 z-20 w-64 rounded-md border border-zinc-700 bg-zinc-800 p-1 shadow-xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {targets.length > 0 && (
        <>
          <div className="px-2 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.canvas.finish.link}</div>
          <div className="max-h-40 overflow-y-auto">
            {targets.map((b) => {
              const who = b.characterId ? project.characters[b.characterId] : undefined;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="menuitem"
                  className={item}
                  onClick={() => {
                    onClose();
                    void setOutputNext(output, { type: "block", blockId: b.id });
                  }}
                >
                  <Link2 size={13} className="shrink-0 text-zinc-400" />
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: who?.color ?? "#71717a" }} />
                  <span className="truncate">
                    {who?.name ?? t.canvas.noCharacter}: {b.lines.map((l) => l.text).join(" / ")}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="my-1 h-px bg-zinc-700" />
        </>
      )}
      <div className="px-2 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.canvas.finish.toScene}</div>
      {others.length === 0 && <div className="px-2 py-1 text-xs text-zinc-500">{t.canvas.finish.noScenes}</div>}
      <div className="max-h-56 overflow-y-auto">
        {others.map((s) => (
          <button key={s.id} type="button" role="menuitem" className={item} onClick={() => goTo(s.id)}>
            <ArrowRightFromLine size={13} className="shrink-0 text-sky-400" />
            <span className="truncate">{s.name}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        role="menuitem"
        className={`${item} text-blue-300`}
        onClick={async () => {
          const created = await attempt(() =>
            execute<{ sceneId: string }>("createScene", { name: t.scenes.defaultName(project.sceneOrder.length + 1) }),
          );
          if (created) goTo(created.sceneId);
        }}
      >
        <Plus size={13} className="shrink-0" /> {t.canvas.finish.newScene}
      </button>
      <div className="my-1 h-px bg-zinc-700" />
      <button
        type="button"
        role="menuitem"
        className={`${item} text-zinc-300`}
        onClick={() => {
          onClose();
          void setOutputNext(output, { type: "end" });
        }}
      >
        <Square size={11} className="shrink-0 fill-current" /> {t.canvas.finish.end}
      </button>
    </div>
  );
}

/** A jump to the start of another scene: a link badge. Click opens that scene, × removes the jump. */
export function SceneLinkNode(props: NodeProps) {
  const node = nodeOf<"scene">(props);
  const target = useApp((s) => s.project?.scenes[node.sceneId]);
  const name = target?.name ?? node.sceneId;
  return (
    <div className="group relative flex items-center gap-1">
      {hiddenTarget}
      <Tip label={t.canvas.tip.openScene(name)}>
        <button
          type="button"
          onClick={() => selectScene(node.sceneId)}
          className="nodrag flex max-w-60 items-center gap-1.5 rounded-md border border-sky-700/70 bg-sky-950/60 px-2 py-1 text-xs text-sky-200 hover:border-sky-400 hover:text-white"
        >
          <ArrowRightFromLine size={12} className="shrink-0" />
          <span className="truncate">
            {t.canvas.finish.label}: {name}
          </span>
        </button>
      </Tip>
      <Tip label={t.canvas.tip.removeTransition}>
        <button
          type="button"
          onClick={() => void setOutputNext(node.output, null)}
          className="nodrag invisible flex h-6 w-6 items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-zinc-300 group-hover:visible hover:border-red-400 hover:bg-red-600 hover:text-white"
        >
          <X size={12} />
        </button>
      </Tip>
    </div>
  );
}

/** Empty scene: a big button in the centre (FLOWS.md, 4). */
export function EmptyNode() {
  return (
    <button
      type="button"
      onClick={() => startDraft({})}
      className="nodrag flex items-center gap-3 rounded-xl border-2 border-dashed border-zinc-700 px-8 py-6 text-lg text-zinc-300 hover:border-blue-500 hover:text-white"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white">
        <Plus size={20} strokeWidth={2.5} />
      </span>
      {t.canvas.addFirst}
    </button>
  );
}

/**
 * Draft of a new block in place of the future block (FLOWS.md, 4):
 * first the character, then the line text. The "Option" button adds another line — the block becomes a choice.
 * Enter saves, Esc cancels.
 */
export function DraftNode(props: NodeProps) {
  const node = nodeOf<"draft">(props);
  const { scene } = useCanvasData();
  // The selected character: id (or a promise while a new character is being created) and the name to show right away.
  const [picked, setPicked] = useState<{ id: Promise<CharacterId | undefined>; name: string } | null>(null);
  const [lines, setLines] = useState<string[]>([""]);
  const color = useApp((s) => {
    const name = picked?.name;
    return name ? Object.values(s.project?.characters ?? {}).find((c) => c.name === name)?.color : undefined;
  });
  const isChoice = lines.length > 1;

  const save = async (values: string[]) => {
    const filled = values.map((v) => v.trim()).filter((v) => v !== "");
    if (filled.length === 0 || !picked) return cancelDraft();
    const characterId = await picked.id;
    void saveDraft(scene.id, node.draft, { characterId: characterId ?? null, lines: filled });
  };

  return (
    <div
      style={{ width: BLOCK_WIDTH }}
      className={`nodrag nowheel relative rounded-lg border-2 border-dashed bg-zinc-900 p-2 text-sm shadow-lg shadow-black/40 ${isChoice ? "border-violet-500/70" : "border-blue-500/70"}`}
    >
      {hiddenTarget}
      <Handle type="source" position={Position.Right} id="out" isConnectable={false} className="!opacity-0" />

      {picked === null ? (
        <>
          <div className="mb-1 text-xs text-zinc-400">{t.canvas.pickCharacter}</div>
          <CharacterPicker onPick={(id, name) => setPicked({ id: Promise.resolve(id), name })} onCancel={cancelDraft} />
        </>
      ) : (
        <>
          <Tip label={t.canvas.tip.character}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPicked(null)}
              className="mb-1 flex items-center gap-1.5 rounded px-1 text-sm font-medium hover:bg-zinc-800"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: color ?? "#71717a" }} />
              {picked.name}
            </button>
          </Tip>
          <div className="flex flex-col gap-1">
            {lines.map((value, i) => (
              <DraftLine
                key={i}
                value={value}
                isChoice={isChoice}
                placeholder={isChoice ? t.canvas.choicePlaceholder(i + 1) : t.canvas.linePlaceholder}
                autoFocus={i === lines.length - 1}
                onChange={(v) => setLines((ls) => ls.map((x, j) => (j === i ? v : x)))}
                onSubmit={() => void save(lines)}
                onCancel={cancelDraft}
              />
            ))}
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <Tip label={t.canvas.tip.addLineDraft} side="bottom">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setLines((ls) => [...ls, ""])}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-violet-300"
              >
                <Plus size={12} /> {t.canvas.addLine}
              </button>
            </Tip>
          </div>
          <div className="mt-1 text-[10px] text-zinc-500">{t.canvas.draftHint}</div>
        </>
      )}
    </div>
  );
}

function DraftLine(props: {
  value: string;
  isChoice: boolean;
  placeholder: string;
  autoFocus: boolean;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const ref = useAutoFocus<HTMLTextAreaElement>();
  return (
    <div className="flex items-start gap-1.5">
      {props.isChoice && <span className="mt-1 text-violet-400">◇</span>}
      <textarea
        ref={props.autoFocus ? ref : undefined}
        rows={1}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => {
          props.onChange(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            props.onSubmit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            props.onCancel();
          }
        }}
        className="nodrag nowheel min-w-0 flex-1 resize-none overflow-hidden rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-sm outline-none focus:border-blue-500"
      />
    </div>
  );
}
