import { applyPatches, enablePatches, produceWithPatches, type Patch } from "immer";
import type { Command, CommandContext } from "../commands/util";
import { randomId, type IdGenerator } from "../ids";
import type { Project } from "../schema/entities";
import { findInvariantViolations } from "../schema/invariants";

enablePatches();

/** Хто зробив зміну. Зміни агента підсвічуються в UI (MCP.md, принцип 4). */
export type ChangeSource = "user" | "agent";

export type HistoryEntry = {
  /** Наскрізний номер зміни. */
  seq: number;
  command: string;
  label: string;
  source: ChangeSource;
  patches: Patch[];
  inversePatches: Patch[];
  at: number;
};

export type ChangeEvent = {
  type: "execute" | "undo" | "redo" | "reset";
  /** Для execute/undo/redo — запис історії, якого стосується подія. */
  entry: HistoryEntry | null;
  /** Патчі, які треба застосувати до попереднього стану, щоб отримати поточний. */
  patches: Patch[];
  project: Project;
};

export type ChangeListener = (event: ChangeEvent) => void;

export class InvariantError extends Error {
  constructor(command: string, readonly violations: { path: (string | number)[]; message: string }[]) {
    super(`Command ${command} broke project invariants: ${violations.map((v) => v.message).join("; ")}`);
    this.name = "InvariantError";
  }
}

export type ProjectEditorOptions = {
  newId?: IdGenerator;
  /** Скільки кроків undo зберігати. */
  historyLimit?: number;
  /** Перевіряти інваріанти після кожної команди. Вимикати лише для вимірювань. */
  checkInvariants?: boolean;
  now?: () => number;
};

/**
 * Поточний проєкт + спільна для людини й агента історія undo/redo (ARCHITECTURE.md, 2.4).
 * Кожна команда — один крок історії. Невдала команда не змінює нічого.
 */
export class ProjectEditor {
  #project: Project;
  #undo: HistoryEntry[] = [];
  #redo: HistoryEntry[] = [];
  #listeners = new Set<ChangeListener>();
  #seq = 0;
  #ctx: CommandContext;
  #limit: number;
  #check: boolean;
  #now: () => number;

  constructor(project: Project, options: ProjectEditorOptions = {}) {
    this.#project = project;
    this.#ctx = { newId: options.newId ?? randomId };
    this.#limit = options.historyLimit ?? 500;
    this.#check = options.checkInvariants ?? true;
    this.#now = options.now ?? Date.now;
  }

  get project(): Project {
    return this.#project;
  }

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }

  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  /** Опис дії, яку скасує наступний undo. */
  get undoLabel(): string | null {
    return this.#undo.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.#redo.at(-1)?.label ?? null;
  }

  subscribe(listener: ChangeListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Виконує команду. Якщо вона нічого не змінила, у історію нічого не потрапляє. */
  run<A, R>(command: Command<A, R>, args: A, source: ChangeSource = "user"): R {
    let result!: R;
    const [next, patches, inversePatches] = produceWithPatches(this.#project, (draft) => {
      result = command.run(draft as Project, args, this.#ctx);
    });
    if (patches.length === 0) return result;
    if (this.#check) {
      const violations = findInvariantViolations(next);
      if (violations.length > 0) throw new InvariantError(command.name, violations);
    }
    const entry: HistoryEntry = {
      seq: ++this.#seq,
      command: command.name,
      label: command.label(args),
      source,
      patches,
      inversePatches,
      at: this.#now(),
    };
    this.#project = next;
    this.#undo.push(entry);
    if (this.#undo.length > this.#limit) this.#undo.shift();
    this.#redo = [];
    this.#emit({ type: "execute", entry, patches, project: next });
    return result;
  }

  undo(): HistoryEntry | null {
    const entry = this.#undo.pop();
    if (!entry) return null;
    this.#project = applyPatches(this.#project, entry.inversePatches);
    this.#redo.push(entry);
    this.#emit({ type: "undo", entry, patches: entry.inversePatches, project: this.#project });
    return entry;
  }

  redo(): HistoryEntry | null {
    const entry = this.#redo.pop();
    if (!entry) return null;
    this.#project = applyPatches(this.#project, entry.patches);
    this.#undo.push(entry);
    this.#emit({ type: "redo", entry, patches: entry.patches, project: this.#project });
    return entry;
  }

  /** Замінює проєкт і очищує історію (перемикання проєкту). */
  reset(project: Project): void {
    this.#project = project;
    this.#undo = [];
    this.#redo = [];
    this.#emit({ type: "reset", entry: null, patches: [{ op: "replace", path: [], value: project }], project });
  }

  #emit(event: ChangeEvent) {
    for (const listener of this.#listeners) listener(event);
  }
}
