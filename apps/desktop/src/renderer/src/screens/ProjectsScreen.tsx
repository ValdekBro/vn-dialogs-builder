import { useState } from "react";
import type { ProjectSummary } from "../../../shared/api";
import { Bot, Copy, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { openAgentDialog } from "../store/agent-store";
import { checkForUpdates, useUpdate } from "../store/update-store";
import { call } from "../api";
import { Tip } from "../components/Tip";
import { InlineEdit } from "../components/InlineEdit";
import { useApp } from "../store/app-store";
import { attempt } from "../store/toast";
import { t } from "../strings/uk";

/** Екран «Проєкти» (FLOWS.md, розділ 15). */
export function ProjectsScreen() {
  const projects = useApp((s) => s.projects);
  const [creating, setCreating] = useState(false);

  const create = (name: string) =>
    attempt(async () => {
      const summary = await call("projects.create", name);
      setCreating(false);
      await call("projects.open", summary.id);
    });

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col px-8 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t.projects.title}</h1>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {t.projects.create}
          </button>
        )}
      </header>

      {creating && <NewProjectForm onCreate={create} onCancel={() => setCreating(false)} />}

      {projects.length === 0 && !creating ? (
        <p className="mt-16 text-center text-zinc-400">{t.projects.empty}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </ul>
      )}
      <AppFooter />
    </div>
  );
}

/** Версія застосунку й ручна перевірка оновлень. */
function AppFooter() {
  const appVersion = useUpdate((s) => s.appVersion);
  const checking = useUpdate((s) => s.checking);
  return (
    <footer className="mt-auto flex items-center justify-center gap-3 pt-10 text-xs text-zinc-500">
      <button type="button" onClick={() => openAgentDialog()} className="inline-flex items-center gap-1 hover:text-zinc-200">
        <Bot size={12} /> {t.agent.title}
      </button>
      <span>·</span>
      <span>{t.update.version(appVersion)}</span>
      <span>·</span>
      <button
        type="button"
        disabled={checking}
        onClick={() => void attempt(checkForUpdates)}
        className="inline-flex items-center gap-1 hover:text-zinc-200 disabled:opacity-60"
      >
        <RefreshCw size={12} className={checking ? "animate-spin" : ""} />
        {checking ? t.update.checking : t.update.check}
      </button>
    </footer>
  );
}

function NewProjectForm({ onCreate, onCancel }: { onCreate: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  return (
    <form
      className="mb-6 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onCreate(name.trim());
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        placeholder={t.projects.namePlaceholder}
        aria-label={t.projects.namePlaceholder}
        className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-blue-500"
      />
      <button
        type="submit"
        disabled={!name.trim()}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {t.projects.createConfirm}
      </button>
      <button type="button" onClick={onCancel} className="rounded-md px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-200">
        {t.projects.cancel}
      </button>
    </form>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const [renaming, setRenaming] = useState(false);
  const blocked = project.problem !== undefined;

  const open = () => !blocked && !renaming && attempt(() => call("projects.open", project.id));
  const rename = (name: string) =>
    attempt(async () => {
      setRenaming(false);
      await call("projects.rename", project.id, name);
    });
  const remove = () => {
    if (window.confirm(t.projects.deleteConfirm(project.name))) void attempt(() => call("projects.delete", project.id));
  };

  return (
    <li
      data-testid={`project-${project.id}`}
      className={`group flex flex-col rounded-lg border bg-zinc-900 p-4 shadow-sm ${blocked ? "border-red-900" : "cursor-pointer border-zinc-800 hover:border-blue-500"}`}
      onClick={open}
    >
      {renaming ? (
        <InlineEdit
          value={project.name}
          onCommit={rename}
          onCancel={() => setRenaming(false)}
          required
          autoFocus
          className="text-lg font-medium"
          ariaLabel={t.projects.rename}
        />
      ) : (
        <h2 className="truncate text-lg font-medium">{project.name}</h2>
      )}
      {project.description && <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{project.description}</p>}
      {blocked && (
        <p className="mt-2 text-sm text-red-400">{project.problem === "too_new" ? t.projects.tooNew : t.projects.invalid}</p>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs text-zinc-400">
        <span className="min-w-0 truncate">
          {t.projects.scenes(project.sceneCount)} · {t.projects.updated(project.updatedAt)}
        </span>
        {/* Дії з'являються при наведенні. `invisible` (а не прозорість), щоб приховані кнопки не перехоплювали кліки. */}
        <span className="invisible flex shrink-0 gap-0.5 group-hover:visible" onClick={(e) => e.stopPropagation()}>
          {!blocked && (
            <>
              <CardAction label={t.projects.rename} icon={<Pencil size={14} />} onClick={() => setRenaming(true)} />
              <CardAction
                label={t.projects.duplicate}
                icon={<Copy size={14} />}
                onClick={() => attempt(() => call("projects.duplicate", project.id))}
              />
            </>
          )}
          <CardAction label={t.projects.delete} icon={<Trash2 size={14} />} onClick={remove} danger />
        </span>
      </div>
    </li>
  );
}

function CardAction({ label, icon, onClick, danger }: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <Tip label={label}>
      <button
        type="button"
        onClick={onClick}
        className={`flex h-7 w-7 items-center justify-center rounded ${danger ? "text-zinc-400 hover:bg-red-600 hover:text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
      >
        {icon}
      </button>
    </Tip>
  );
}
