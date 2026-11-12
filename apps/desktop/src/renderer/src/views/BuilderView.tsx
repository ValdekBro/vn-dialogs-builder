import { sceneIssues, type Project } from "@vn/core";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { execute } from "../api";
import { Tip } from "../components/Tip";
import { SceneCanvas } from "../canvas/SceneCanvas";
import { InlineEdit } from "../components/InlineEdit";
import { selectScene, useApp } from "../store/app-store";
import { attempt } from "../store/toast";
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
      <ul>
        {project.sceneOrder.map((id) => {
          const scene = project.scenes[id]!;
          const active = id === sceneId;
          return (
            <li key={id} data-testid={`scene-${id}`}>
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
                <button
                  type="button"
                  onClick={() => selectScene(id)}
                  onDoubleClick={() => setRenaming(id)}
                  aria-current={active}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${active ? "bg-blue-500/15 font-medium text-blue-300" : "hover:bg-zinc-800"}`}
                >
                  <span className="truncate">{scene.name}</span>
                  <SceneBadge scene={scene} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
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
