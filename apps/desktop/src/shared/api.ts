import type { ChangeSource, Project } from "@vn/core";
import type { Patch } from "immer";

/**
 * Контракт між головним процесом і вікном. Його використовують main (обробники IPC),
 * preload (міст) і renderer (виклики). Тут лише типи й назви каналів, без коду Electron.
 */

/** Картка проєкту на екрані «Проєкти». Будується скануванням теки `projects/`. */
export type ProjectSummary = {
  id: string;
  name: string;
  description: string;
  sceneCount: number;
  /** Час останньої зміни файлу, мс. */
  updatedAt: number;
  /** Файл не можна відкрити: створено новішою версією застосунку або файл пошкоджено. */
  problem?: "too_new" | "invalid";
};

export type HistoryState = {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
};

export type SaveState = "saved" | "dirty" | "saving" | "error";

/** Знімок відкритого проєкту для вікна. */
export type SessionSnapshot = {
  project: Project;
  /** Лічильник змін: кожна подія `changed` збільшує його на 1. Розрив означає, що вікно має перечитати знімок. */
  version: number;
  history: HistoryState;
  save: SaveState;
};

/**
 * Стан оновлення застосунку (ARCHITECTURE.md, «Оновлення»).
 * `unsupported` — у цій збірці оновлення не працюють (запуск з коду або не Windows).
 */
export type UpdateState =
  | { status: "unsupported"; reason: "dev" | "platform" }
  | { status: "idle" }
  | { status: "checking" }
  | { status: "latest" }
  | { status: "available"; version: string }
  | { status: "downloading"; version: string; percent: number }
  | { status: "installing"; version: string }
  | { status: "error"; message: string; version?: string };

export type AppInfo = { version: string; update: UpdateState; releasesUrl: string };

/** Події з головного процесу у вікно. */
export type SessionEvent =
  | { type: "opened"; snapshot: SessionSnapshot }
  | { type: "closed" }
  | {
      type: "changed";
      version: number;
      kind: "execute" | "undo" | "redo";
      source: ChangeSource;
      label: string;
      patches: Patch[];
      history: HistoryState;
    }
  | { type: "save"; save: SaveState }
  | { type: "projects"; projects: ProjectSummary[] }
  | { type: "update"; update: UpdateState };

/** Помилка, що пройшла через IPC. Коди ядра + власні коди застосунку. */
export type ApiError = { code: string; message: string; details?: unknown };

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };

/** Команди ядра, які вікну дозволено викликати (білий список). */
export const ALLOWED_COMMANDS = [
  "updateProject",
  "createCharacter",
  "updateCharacter",
  "deleteCharacter",
  "reorderCharacters",
  "createScene",
  "updateScene",
  "deleteScene",
  "duplicateScene",
  "reorderScenes",
  "addBlock",
  "updateBlock",
  "deleteBlocks",
  "addLine",
  "updateLine",
  "deleteLine",
  "reorderLines",
  "setNext",
  "addChain",
  "addTree",
  "pasteBlocks",
  "moveBlocks",
  "resetLayout",
] as const;

export type CommandName = (typeof ALLOWED_COMMANDS)[number];

/** Канали IPC. */
export const IPC = {
  invoke: "vn:invoke",
  event: "vn:event",
} as const;

/**
 * Методи, які вікно викликає через один канал `vn:invoke`.
 * Ключ — назва методу, значення — [аргументи, результат].
 */
export type ApiMethods = {
  "projects.list": [[], ProjectSummary[]];
  "projects.create": [[name: string], ProjectSummary];
  "projects.open": [[id: string], SessionSnapshot];
  "projects.close": [[], void];
  "projects.rename": [[id: string, name: string], void];
  "projects.duplicate": [[id: string], ProjectSummary];
  "projects.delete": [[id: string], void];
  "session.get": [[], SessionSnapshot | null];
  "session.execute": [[command: CommandName, args: unknown], unknown];
  "session.undo": [[], string | null];
  "session.redo": [[], string | null];
  "app.info": [[], AppInfo];
  /** Перевірити зараз (кнопка «Перевірити оновлення»). Результат приходить подією `update`. */
  "update.check": [[], void];
  /** Завантажити, встановити й перезапуститися — кнопка «Оновити». */
  "update.install": [[], void];
};

export type ApiMethod = keyof ApiMethods;
