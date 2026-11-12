import { projectIssues, type Issue, type Project } from "@vn/core";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import { revealBlock } from "../canvas/canvas-store";
import { useApp } from "../store/app-store";
import { t } from "../strings/uk";
import { Tip } from "./Tip";

type Scope = "scene" | "project";

/** Panel state lives outside the component, so other buttons (the blocked export) can open it. */
const usePanel = create<{ open: boolean; scope: Scope }>(() => ({ open: false, scope: "scene" }));
const setOpen = (open: boolean) => usePanel.setState({ open });
const setScope = (scope: Scope) => usePanel.setState({ scope });

/** Opens the issues list for the whole project. */
export function openProjectIssues() {
  usePanel.setState({ open: true, scope: "project" });
}

/**
 * The `⚠ N` counter in the top bar (FLOWS.md, 12): the project's error count. A click opens the list —
 * the current scene's issues, with a switch to the whole project. A click on an issue opens its block in the builder.
 */
export function IssuesButton({ project }: { project: Project }) {
  const sceneId = useApp((s) => s.sceneId);
  const { open, scope } = usePanel();
  const root = useRef<HTMLDivElement>(null);
  const all = useMemo(() => projectIssues(project), [project]);
  const errors = all.filter((i) => i.severity === "error").length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    // Opening starts with the current scene, or the whole project if this scene is clean.
    if (!open) setScope(all.some((i) => i.sceneId === sceneId) ? "scene" : "project");
    setOpen(!open);
  };
  const shown = scope === "scene" ? all.filter((i) => i.sceneId === sceneId) : all;

  return (
    <div ref={root} className="relative">
      <Tip label={errors > 0 ? t.issues.tip(errors) : t.issues.none} side="bottom">
        <button
          type="button"
          data-testid="issues-button"
          aria-label={t.issues.title}
          aria-expanded={open}
          onClick={toggle}
          className={`flex h-8 items-center gap-1.5 rounded-md px-2 text-sm ${errors > 0 ? "text-red-300 hover:bg-red-500/15" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"}`}
        >
          {errors > 0 ? <TriangleAlert size={15} /> : <CircleCheck size={15} />}
          <span className="tabular-nums">{errors}</span>
        </button>
      </Tip>
      {open && (
        <div data-testid="issues-panel" className="absolute right-0 top-10 z-40 w-[26rem] rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
            <h2 className="flex-1 text-sm font-medium">{t.issues.title}</h2>
            <div role="group" className="flex rounded-md bg-zinc-800 p-0.5 text-xs">
              {(["scene", "project"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={scope === s}
                  onClick={() => setScope(s)}
                  className={`rounded px-2 py-0.5 ${scope === s ? "bg-zinc-900 font-medium text-white" : "text-zinc-400 hover:text-zinc-100"}`}
                >
                  {s === "scene" ? t.issues.scene : t.issues.project(all.length)}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="flex items-center gap-2 px-3 py-6 text-sm text-zinc-400">
              <CircleCheck size={16} className="text-emerald-400" />
              {scope === "scene" ? t.issues.sceneClean : t.issues.none}
            </p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {shown.map((issue, i) => (
                <li key={`${issue.code}:${issue.sceneId}:${issue.blockId ?? ""}:${issue.lineId ?? ""}:${i}`}>
                  <IssueRow
                    issue={issue}
                    project={project}
                    showScene={scope === "project"}
                    onOpen={() => {
                      setOpen(false);
                      revealBlock(issue.sceneId, issue.blockId);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue, project, showScene, onOpen }: { issue: Issue; project: Project; showScene: boolean; onOpen: () => void }) {
  const scene = project.scenes[issue.sceneId];
  const block = issue.blockId ? scene?.blocks[issue.blockId] : undefined;
  const character = block?.characterId ? project.characters[block.characterId] : undefined;
  const line = issue.lineId ? block?.lines.find((l) => l.id === issue.lineId) : block?.lines[0];
  return (
    <button type="button" onClick={onOpen} data-testid="issue-row" className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-zinc-800">
      <TriangleAlert size={14} className="mt-0.5 shrink-0 text-red-400" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-zinc-100">{issue.message}</span>
        <span className="block truncate text-xs text-zinc-500">
          {showScene && scene ? `${scene.name} · ` : ""}
          {block ? (
            <>
              <span style={{ color: character?.color }}>{character?.name ?? t.canvas.noCharacter}</span>
              {line?.text.trim() ? `: ${line.text}` : ""}
            </>
          ) : (
            t.issues.wholeScene
          )}
        </span>
      </span>
    </button>
  );
}
