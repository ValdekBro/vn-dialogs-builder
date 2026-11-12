import { sceneIssues, type Project } from "@vn/core";
import { useMemo, useState } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { call, execute } from "../api";
import { Tip } from "../components/Tip";
import { SceneCanvas } from "../canvas/SceneCanvas";
import { InlineEdit } from "../components/InlineEdit";
import { selectScene, useApp } from "../store/app-store";
import { attempt, showToast } from "../store/toast";
import { reorderedScenes, sceneDeleteImpact } from "./scene-list";
import { t } from "../strings/uk";

/**
 * The dialogue builder: only scenes and the canvas. Characters and project info are separate sections,
 * so they do not take space next to the canvas.
 */
export function BuilderView({ project }: { project: Project }) {
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-zinc-800 bg-zinc-900 p-3">
        <ScenesPanel project={project} />
      </aside>
      <main className="relative min-w-0 flex-1">
        <SceneView project={project} />
      </main>
    </div>
  );
}

function ScenesPanel({ project }: { project: Project }) {
  const sceneId = useApp((s) => s.sceneId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ target: string; after: boolean } | null>(null);

  const duplicate = (id: string) =>
    attempt(async () => {
      const { sceneId: copy } = await execute<{ sceneId: string }>("duplicateScene", { sceneId: id });
      selectScene(copy);
    });

  /** An empty scene goes at once; one with blocks or jumps into it asks first. Either way it can be undone. */
  const remove = async (id: string) => {
    const scene = project.scenes[id]!;
    const { blocks, jumpsIn } = sceneDeleteImpact(project, id);
    if ((blocks > 0 || jumpsIn > 0) && !window.confirm(t.scenes.deleteConfirm(scene.name, blocks, jumpsIn))) return;
    const ok = await attempt(() => execute("deleteScene", { sceneId: id }));
    if (ok === undefined) return;
    showToast(t.scenes.deleted(scene.name), "info", 6000, { label: t.canvas.undo, run: () => void attempt(() => call("session.undo")) });
  };

  const add = () =>
    attempt(async () => {
      const { sceneId: id } = await execute<{ sceneId: string }>("createScene", {
        name: t.scenes.defaultName(project.sceneOrder.length + 1),
      });
      selectScene(id);
      setRenaming(id);
    });

  return (
    <section>
      <div className="mb-1 flex items-center justify-between px-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{t.scenes.title}</h2>
        <Tip label={t.scenes.add}>
          <button type="button" onClick={add} className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
            <Plus size={14} />
          </button>
        </Tip>
      </div>
      {project.sceneOrder.length === 0 && <p className="px-2 text-sm text-zinc-400">{t.scenes.empty}</p>}
      <ul onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDrop(null)}>
        {project.sceneOrder.map((id) => {
          const scene = project.scenes[id]!;
          const active = id === sceneId;
          const dropLine = drop?.target === id ? (drop.after ? "shadow-[0_2px_0_0_#3b82f6]" : "shadow-[0_-2px_0_0_#3b82f6]") : "";
          return (
            <li
              key={id}
              data-testid={`scene-${id}`}
              draggable={renaming !== id}
              onDragStart={(e) => {
                setDragging(id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", id);
              }}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setDrop({ target: id, after: e.clientY > r.top + r.height / 2 });
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging && drop) {
                  const sceneIds = reorderedScenes(project.sceneOrder, dragging, drop.target, drop.after);
                  if (sceneIds) void attempt(() => execute("reorderScenes", { sceneIds }));
                }
                setDragging(null);
                setDrop(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDrop(null);
              }}
              className={`group relative rounded-md ${dropLine} ${dragging === id ? "opacity-40" : ""}`}
            >
              {renaming === id ? (
                <InlineEdit
                  value={scene.name}
                  required
                  autoFocus
                  ariaLabel={t.scenes.title}
                  className="w-full text-sm"
                  onCommit={(name) => {
                    setRenaming(null);
                    void attempt(() => execute("updateScene", { sceneId: id, name }));
                  }}
                  onCancel={() => setRenaming(null)}
                />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => selectScene(id)}
                    onDoubleClick={() => setRenaming(id)}
                    aria-current={active}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm ${active ? "bg-blue-500/15 font-medium text-blue-300" : "hover:bg-zinc-800"}`}
                  >
                    <span className="truncate">{scene.name}</span>
                    <span className="group-hover:invisible">
                      <SceneBadge scene={scene} />
                    </span>
                  </button>
                  {/* Actions appear on hover over the badge. `invisible`, so hidden buttons do not catch clicks. */}
                  <span className="invisible absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 rounded-md bg-zinc-800 group-hover:visible">
                    <RowAction label={t.scenes.rename} onClick={() => setRenaming(id)}>
                      <Pencil size={12} />
                    </RowAction>
                    <RowAction label={t.scenes.duplicate} onClick={() => duplicate(id)}>
                      <Copy size={12} />
                    </RowAction>
                    <RowAction label={t.scenes.remove} onClick={() => remove(id)} danger>
                      <Trash2 size={12} />
                    </RowAction>
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {project.sceneOrder.length > 1 && <p className="mt-2 px-2 text-[11px] text-zinc-500">{t.scenes.dragHint}</p>}
    </section>
  );
}

/** Scene canvas with the name and description on top (FLOWS.md, 11). */
function SceneView({ project }: { project: Project }) {
  const sceneId = useApp((s) => s.sceneId);
  const scene = sceneId ? project.scenes[sceneId] : undefined;
  if (!scene) return null;

  return (
    <div className="absolute inset-0">
      <SceneCanvas scene={scene} />
      <div className="pointer-events-none absolute left-4 top-3 w-[min(36rem,60%)]">
        <div className="pointer-events-auto flex flex-col">
          <InlineEdit
            key={`${scene.id}:name`}
            value={scene.name}
            required
            ariaLabel={t.scenes.name}
            className="-mx-1.5 w-full text-lg font-semibold"
            onCommit={(name) => attempt(() => execute("updateScene", { sceneId: scene.id, name }))}
          />
          <InlineEdit
            key={`${scene.id}:description`}
            value={scene.description}
            multiline
            rows={1}
            placeholder={t.scenes.descriptionPlaceholder}
            ariaLabel={t.scenes.description}
            className="-mx-1.5 w-full resize-none text-sm text-zinc-400"
            onCommit={(description) => attempt(() => execute("updateScene", { sceneId: scene.id, description }))}
          />
        </div>
      </div>
    </div>
  );
}

function RowAction({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <Tip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={`flex h-6 w-6 items-center justify-center rounded text-zinc-400 ${danger ? "hover:bg-red-600 hover:text-white" : "hover:bg-zinc-700 hover:text-white"}`}
      >
        {children}
      </button>
    </Tip>
  );
}

/** Number of errors in the scene (red) or of blocks (grey). */
function SceneBadge({ scene }: { scene: Project["scenes"][string] }) {
  const project = useApp((s) => s.project)!;
  const errors = useMemo(() => sceneIssues(scene, project).filter((i) => i.severity === "error").length, [scene, project]);
  if (errors > 0) {
    return (
      <span title={t.scenes.errors(errors)} className="rounded bg-red-500/15 px-1.5 text-xs text-red-300">
        {errors}
      </span>
    );
  }
  return <span className="text-xs text-zinc-500">{Object.keys(scene.blocks).length}</span>;
}
