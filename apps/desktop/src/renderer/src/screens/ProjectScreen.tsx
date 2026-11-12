import type { Project } from "@vn/core";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Redo2, Undo2 } from "lucide-react";
import { AgentButton } from "../components/AgentButton";
import { call } from "../api";
import { Tip } from "../components/Tip";
import { showView, useApp, type ProjectView } from "../store/app-store";
import { attempt } from "../store/toast";
import { t } from "../strings/uk";
import { BuilderView } from "../views/BuilderView";
import { CharactersView } from "../views/CharactersView";
import { ProjectInfoView } from "../views/ProjectInfoView";

/** The open project: top bar and one of three sections. */
export function ProjectScreen() {
  const project = useApp((s) => s.project)!;
  const view = useApp((s) => s.view);
  useUndoHotkeys();

  return (
    <div className="flex h-full flex-col">
      <TopBar project={project} view={view} />
      {view === "builder" && <BuilderView project={project} />}
      {view === "characters" && <CharactersView project={project} />}
      {view === "project" && <ProjectInfoView project={project} />}
    </div>
  );
}

const VIEWS: { id: ProjectView; label: string }[] = [
  { id: "builder", label: t.views.builder },
  { id: "characters", label: t.views.characters },
  { id: "project", label: t.views.project },
];

function TopBar({ project, view }: { project: Project; view: ProjectView }) {
  const history = useApp((s) => s.history);
  const save = useApp((s) => s.save);
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3">
      <ProjectSwitcher project={project} />
      <nav aria-label={t.views.label} className="ml-2 flex rounded-lg bg-zinc-800 p-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-current={view === v.id ? "page" : undefined}
            onClick={() => showView(v.id)}
            className={`rounded-md px-3 py-1 text-sm ${view === v.id ? "bg-zinc-900 font-medium shadow-sm" : "text-zinc-400 hover:text-zinc-100"}`}
          >
            {v.label}
          </button>
        ))}
      </nav>
      <div className="flex-1" />
      <AgentButton />
      <span className={`mr-1 text-xs ${save === "error" ? "text-red-400" : "text-zinc-500"}`} aria-live="polite">
        {t.save[save]}
      </span>
      <ToolbarButton
        label={t.history.undo}
        title={t.history.undoWhat(history.undoLabel)}
        disabled={!history.canUndo}
        onClick={() => attempt(() => call("session.undo"))}
      >
        <Undo2 size={16} />
      </ToolbarButton>
      <ToolbarButton
        label={t.history.redo}
        title={t.history.redoWhat(history.redoLabel)}
        disabled={!history.canRedo}
        onClick={() => attempt(() => call("session.redo"))}
      >
        <Redo2 size={16} />
      </ToolbarButton>
    </header>
  );
}

function ToolbarButton(props: { label: string; title: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tip label={props.title} side="bottom">
      <button
        type="button"
        aria-label={props.label}
        disabled={props.disabled}
        onClick={props.onClick}
        className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
      >
        {props.children}
      </button>
    </Tip>
  );
}

/** Quick project switching from the top bar (FLOWS.md, 15). */
function ProjectSwitcher({ project }: { project: Project }) {
  const projects = useApp((s) => s.projects);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Tip label={t.projects.switchTo} side="bottom">
        <button
          type="button"
          aria-label={t.projects.switchTo}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex max-w-72 items-center gap-1 rounded-md px-2 py-1.5 font-medium hover:bg-zinc-800"
        >
          <span className="truncate">{project.name}</span>
          <ChevronDown size={14} className="text-zinc-500" />
        </button>
      </Tip>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-72 rounded-md border border-zinc-800 bg-zinc-900 py-1 shadow-lg">
          {projects
            .filter((p) => !p.problem)
            .map((p) => (
              <button
                key={p.id}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (p.id !== project.id) void attempt(() => call("projects.open", p.id));
                }}
                className={`block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-zinc-800 ${p.id === project.id ? "font-semibold" : ""}`}
              >
                {p.name}
              </button>
            ))}
          <div className="my-1 h-px bg-zinc-700" />
          <button
            role="menuitem"
            type="button"
            onClick={() => attempt(() => call("projects.close"))}
            className="block w-full px-3 py-1.5 text-left text-sm text-blue-400 hover:bg-zinc-800"
          >
            {t.projects.allProjects}
          </button>
        </div>
      )}
    </div>
  );
}

/** Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z. While focus is in a text field, the field's own undo applies. */
function useUndoHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        void attempt(() => call("session.undo"));
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        void attempt(() => call("session.redo"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
