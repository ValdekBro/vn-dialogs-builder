import { ProjectEditor, type ChangeEvent, type ChangeSource, type Project } from "@vn/core";
import type { CommandName, HistoryState, ProjectSummary, SaveState, SessionEvent, SessionSnapshot } from "../../shared/api";
import type { ProjectRepository } from "../persistence/project-repository";
import type { SettingsStore } from "../persistence/settings";
import { COMMANDS, isCommandName } from "./commands";
import { AppError } from "./errors";

export type ProjectStoreOptions = {
  repo: ProjectRepository;
  settings: SettingsStore;
  /** Інтервал автозбереження, мс. 0 — без таймера (тести викликають `flush()` самі). */
  autosaveMs?: number;
};

type Listener = (event: SessionEvent) => void;

/**
 * Єдине джерело правди про відкритий проєкт (ARCHITECTURE.md, розділ 4).
 * Виконує команди людини й агента, веде спільну історію, розсилає патчі й автоматично зберігає.
 */
export class ProjectStore {
  #repo: ProjectRepository;
  #settings: SettingsStore;
  #editor: ProjectEditor | null = null;
  #unsubscribe: (() => void) | null = null;
  #version = 0;
  #dirty = false;
  #save: SaveState = "saved";
  #saving: Promise<void> | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #listeners = new Set<Listener>();

  constructor(options: ProjectStoreOptions) {
    this.#repo = options.repo;
    this.#settings = options.settings;
    const ms = options.autosaveMs ?? 1000;
    if (ms > 0) {
      this.#timer = setInterval(() => void this.flush(), ms);
      this.#timer.unref?.();
    }
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  get activeProject(): Project | null {
    return this.#editor?.project ?? null;
  }

  get isDirty(): boolean {
    return this.#dirty;
  }

  snapshot(): SessionSnapshot | null {
    if (!this.#editor) return null;
    return { project: this.#editor.project, version: this.#version, history: this.#history(), save: this.#save };
  }

  // ── Проєкти ───────────────────────────────────────────────

  listProjects(): Promise<ProjectSummary[]> {
    return this.#repo.list();
  }

  async createProject(name: string): Promise<ProjectSummary> {
    const project = await this.#repo.create(name);
    await this.#broadcastProjects();
    return summaryOf(project);
  }

  async openProject(id: string): Promise<SessionSnapshot> {
    if (this.#editor?.project.id === id) return this.snapshot()!;
    const project = await this.#repo.load(id);
    await this.#closeEditor();
    const editor = new ProjectEditor(project);
    this.#editor = editor;
    this.#version = 0;
    this.#dirty = false;
    this.#setSave("saved");
    this.#unsubscribe = editor.subscribe((e) => this.#onChange(e));
    await this.#settings.update({ lastProjectId: id });
    const snapshot = this.snapshot()!;
    this.#emit({ type: "opened", snapshot });
    return snapshot;
  }

  /** Відкриває проєкт, що був відкритий минулого разу. Якщо його вже немає або він не читається — нічого. */
  async openLastProject(): Promise<SessionSnapshot | null> {
    const id = this.#settings.value.lastProjectId;
    if (!id || !(await this.#repo.exists(id))) return null;
    try {
      return await this.openProject(id);
    } catch {
      return null;
    }
  }

  async closeProject(): Promise<void> {
    await this.#closeEditor();
    this.#emit({ type: "closed" });
  }

  async renameProject(id: string, name: string): Promise<void> {
    if (this.#editor?.project.id === id) this.execute("updateProject", { name }, "user");
    else await this.#repo.rename(id, name);
    await this.#broadcastProjects();
  }

  async duplicateProject(id: string): Promise<ProjectSummary> {
    if (this.#editor?.project.id === id) await this.flush();
    const copy = await this.#repo.duplicate(id);
    await this.#broadcastProjects();
    return summaryOf(copy);
  }

  async deleteProject(id: string): Promise<void> {
    if (this.#editor?.project.id === id) await this.closeProject();
    await this.#repo.delete(id);
    if (this.#settings.value.lastProjectId === id) await this.#settings.update({ lastProjectId: null });
    await this.#broadcastProjects();
  }

  // ── Зміни моделі ──────────────────────────────────────────

  execute(name: CommandName, args: unknown, source: ChangeSource): unknown {
    const editor = this.#requireEditor();
    if (!isCommandName(name)) throw new AppError("INVALID_ARGUMENT", `Unknown command: ${String(name)}`);
    return editor.run(COMMANDS[name], args, source);
  }

  undo(): string | null {
    return this.#requireEditor().undo()?.label ?? null;
  }

  redo(): string | null {
    return this.#requireEditor().redo()?.label ?? null;
  }

  // ── Збереження ────────────────────────────────────────────

  /** Записує файл, якщо є незбережені зміни. Безпечно викликати будь-коли й скільки завгодно. */
  async flush(): Promise<void> {
    while (this.#saving) await this.#saving;
    const editor = this.#editor;
    if (!editor || !this.#dirty) return;
    this.#dirty = false;
    this.#setSave("saving");
    this.#saving = this.#repo
      .save(editor.project)
      .then(() => this.#setSave(this.#dirty ? "dirty" : "saved"))
      .catch((e) => {
        this.#dirty = true;
        this.#setSave("error");
        console.error("Autosave failed", e);
      })
      .finally(() => {
        this.#saving = null;
      });
    await this.#saving;
  }

  /** Зупиняє автозбереження й дозберігає зміни (вихід із застосунку). */
  async dispose(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    await this.flush();
  }

  // ── Внутрішнє ─────────────────────────────────────────────

  #onChange(e: ChangeEvent) {
    if (e.type === "reset" || !e.entry) return;
    this.#version++;
    this.#dirty = true;
    this.#setSave("dirty");
    this.#emit({
      type: "changed",
      version: this.#version,
      kind: e.type,
      source: e.entry.source,
      label: e.entry.label,
      patches: e.patches,
      history: this.#history(),
    });
  }

  async #closeEditor() {
    if (!this.#editor) return;
    await this.flush();
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#editor = null;
  }

  #requireEditor(): ProjectEditor {
    if (!this.#editor) throw new AppError("NO_PROJECT_OPEN", "No project is open");
    return this.#editor;
  }

  #history(): HistoryState {
    const e = this.#editor;
    return {
      canUndo: e?.canUndo ?? false,
      canRedo: e?.canRedo ?? false,
      undoLabel: e?.undoLabel ?? null,
      redoLabel: e?.redoLabel ?? null,
    };
  }

  #setSave(save: SaveState) {
    if (this.#save === save) return;
    this.#save = save;
    this.#emit({ type: "save", save });
  }

  async #broadcastProjects() {
    this.#emit({ type: "projects", projects: await this.#repo.list() });
  }

  #emit(event: SessionEvent) {
    for (const l of this.#listeners) l(event);
  }
}

function summaryOf(p: Project): ProjectSummary {
  return { id: p.id, name: p.name, description: p.description, sceneCount: p.sceneOrder.length, updatedAt: Date.now() };
}
