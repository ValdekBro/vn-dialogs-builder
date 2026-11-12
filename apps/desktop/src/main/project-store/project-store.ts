import { existsSync } from "node:fs";
import {
  ExportBlockedError,
  ExportFormatError,
  ImportError,
  ProjectEditor,
  serializeExport,
  toExport,
  type ChangeEvent,
  type ChangeSource,
  type Project,
} from "@vn/core";
import type { CommandName, HistoryState, ProjectSummary, SaveState, SessionEvent, SessionSnapshot } from "../../shared/api";
import type { ProjectRepository } from "../persistence/project-repository";
import type { SettingsStore } from "../persistence/settings";
import { COMMANDS, isCommandName } from "./commands";
import { AppError } from "./errors";

export type ProjectStoreOptions = {
  repo: ProjectRepository;
  settings: SettingsStore;
  /** Autosave interval, ms. 0 — no timer (tests call `flush()` themselves). */
  autosaveMs?: number;
};

type Listener = (event: SessionEvent) => void;

/**
 * The single source of truth about the open project (ARCHITECTURE.md, section 4).
 * Runs human and agent commands, keeps the shared history, broadcasts patches and autosaves.
 */
export class ProjectStore {
  #repo: ProjectRepository;
  #settings: SettingsStore;
  #editor: ProjectEditor | null = null;
  #unsubscribe: (() => void) | null = null;
  /** Name, description and scene count of the open project as last broadcast in the project list. */
  #summaryKey = "";
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
    const project = this.#editor.project;
    return {
      project,
      lastSceneId: this.#settings.value.lastScenes[project.id] ?? null,
      version: this.#version,
      history: this.#history(),
      save: this.#save,
    };
  }

  // ── Projects ──────────────────────────────────────────────

  /** Projects on disk, with the open project's name, description and scene count taken from memory (it may not be saved yet). */
  async listProjects(): Promise<ProjectSummary[]> {
    const list = await this.#repo.list();
    const live = this.#editor?.project;
    if (!live) return list;
    return list.map((p) => (p.id === live.id ? { ...p, name: live.name, description: live.description, sceneCount: live.sceneOrder.length } : p));
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
    this.#summaryKey = summaryKey(project);
    this.#unsubscribe = editor.subscribe((e) => this.#onChange(e));
    await this.#settings.update({ lastProjectId: id });
    const snapshot = this.snapshot()!;
    this.#emit({ type: "opened", snapshot });
    return snapshot;
  }

  /** Opens the project that was open last time. If it is gone or unreadable, does nothing. */
  async openLastProject(): Promise<SessionSnapshot | null> {
    const id = this.#settings.value.lastProjectId;
    if (!id || !(await this.#repo.exists(id))) return null;
    try {
      return await this.openProject(id);
    } catch {
      return null;
    }
  }

  /** Remembers the scene the window shows in the open project (opened again on the next open). */
  async rememberScene(sceneId: string): Promise<void> {
    const project = this.#requireEditor().project;
    if (!project.scenes[sceneId] || this.#settings.value.lastScenes[project.id] === sceneId) return;
    await this.#settings.update({ lastScenes: { ...this.#settings.value.lastScenes, [project.id]: sceneId } });
  }

  async closeProject(): Promise<void> {
    await this.#closeEditor();
    this.#emit({ type: "closed" });
  }

  async renameProject(id: string, name: string): Promise<void> {
    // The open project goes through history; the change itself broadcasts the list.
    if (this.#editor?.project.id === id) this.execute("updateProject", { name }, "user");
    else {
      await this.#repo.rename(id, name);
      await this.#broadcastProjects();
    }
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
    if (id in this.#settings.value.lastScenes) {
      const { [id]: _gone, ...rest } = this.#settings.value.lastScenes;
      await this.#settings.update({ lastScenes: rest });
    }
    await this.#broadcastProjects();
  }

  // ── Export and import (SCHEMA.md, section 8) ──────────────

  /** The open project as export file text. Blocked while the project has errors (`EXPORT_BLOCKED`). */
  exportActive(appVersion: string): { name: string; text: string } {
    const project = this.#requireEditor().project;
    try {
      return { name: project.name, text: serializeExport(toExport(project, { appVersion })) };
    } catch (e) {
      if (e instanceof ExportBlockedError) {
        throw new AppError("EXPORT_BLOCKED", e.message, { errors: e.issues.length });
      }
      throw e;
    }
  }

  /** Creates a new project from export file text and opens it. */
  async importProject(text: string): Promise<SessionSnapshot> {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new AppError("IMPORT_NOT_JSON", "The file is not JSON");
    }
    let project: Project;
    try {
      project = await this.#repo.importExport(raw);
    } catch (e) {
      if (e instanceof ExportFormatError) {
        throw new AppError(e.kind === "too_new" ? "IMPORT_TOO_NEW" : "IMPORT_UNKNOWN_FORMAT", e.message);
      }
      if (e instanceof ImportError) throw new AppError("IMPORT_INVALID", e.message, e.details);
      throw e;
    }
    await this.#broadcastProjects();
    return this.openProject(project.id);
  }

  // ── Model changes ─────────────────────────────────────────

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

  // ── Saving ────────────────────────────────────────────────

  /** Writes the file if there are unsaved changes. Safe to call any time, any number of times. */
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

  /** Stops autosave and flushes changes (app quit). */
  async dispose(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    await this.flush();
  }

  // ── Internal ──────────────────────────────────────────────

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
    // A rename (by the user, the agent or undo) must reach the project list right away, not after autosave.
    const key = summaryKey(this.#editor?.project);
    if (key !== this.#summaryKey) {
      this.#summaryKey = key;
      void this.#broadcastProjects();
    }
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
    this.#emit({ type: "projects", projects: await this.listProjects() });
  }

  #emit(event: SessionEvent) {
    for (const l of this.#listeners) l(event);
  }
}

function summaryKey(p: Project | undefined): string {
  return p ? JSON.stringify([p.name, p.description, p.sceneOrder.length]) : "";
}

function summaryOf(p: Project): ProjectSummary {
  return { id: p.id, name: p.name, description: p.description, sceneCount: p.sceneOrder.length, updatedAt: Date.now() };
}

/** A file name from the project name: characters forbidden on Windows or macOS are replaced. */
export function exportFileName(projectName: string): string {
  const cleaned = projectName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  return cleaned.slice(0, 100) || "project";
}

/** Where the export and import dialogs start: the last export folder if it still exists, otherwise `fallback`. */
export function fileDialogDir(lastExportDir: string | null, fallback: string): string {
  return lastExportDir && existsSync(lastExportDir) ? lastExportDir : fallback;
}
