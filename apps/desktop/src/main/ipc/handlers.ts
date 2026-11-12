import { ipcMain, type BrowserWindow } from "electron";
import { IPC, type ApiMethod, type ApiMethods, type ApiResult } from "../../shared/api";
import type { ProjectStore } from "../project-store/project-store";
import { RELEASES_URL, type Updater } from "../updater";
import type { Approvals } from "../mcp/approvals";
import type { McpHttpServer } from "../mcp/http";
import { claudeDesktopStatus, installClaudeDesktop, type StdioEntry } from "../mcp/claude-desktop";
import { app } from "electron";
import { AppError, toApiError } from "../project-store/errors";

type Handlers = { [M in ApiMethod]: (...args: ApiMethods[M][0]) => ApiMethods[M][1] | Promise<ApiMethods[M][1]> };

/**
 * Міст main ↔ renderer. Один канал `vn:invoke` з назвою методу; помилки повертаються як дані,
 * бо Electron передає через `invoke` лише текст помилки й губить її код.
 */
export type IpcDeps = {
  store: ProjectStore;
  updater: Updater;
  mcp: McpHttpServer;
  approvals: Approvals;
  /** Конфіг застосунку Claude і запис мосту для нього (src/main/mcp/claude-desktop.ts). */
  claude: { configPath: string | null; entry: StdioEntry };
};

export function registerIpc({ store, updater, mcp, approvals, claude }: IpcDeps, getWindow: () => BrowserWindow | null): () => void {
  const handlers: Handlers = {
    "projects.list": () => store.listProjects(),
    "projects.create": (name) => store.createProject(name),
    "projects.open": (id) => store.openProject(id),
    "projects.close": () => store.closeProject(),
    "projects.rename": (id, name) => store.renameProject(id, name),
    "projects.duplicate": (id) => store.duplicateProject(id),
    "projects.delete": (id) => store.deleteProject(id),
    "session.get": () => store.snapshot(),
    "session.execute": (command, args) => store.execute(command, args, "user"),
    "session.undo": () => store.undo(),
    "session.redo": () => store.redo(),
    "app.info": () => ({ version: app.getVersion(), update: updater.state, releasesUrl: RELEASES_URL }),
    "update.check": () => updater.check(true),
    "update.install": () => updater.install(),
    "mcp.info": () => mcp.info,
    "claude.status": () => claudeDesktopStatus(claude.configPath, claude.entry),
    "claude.install": async () => {
      if (!claude.configPath) throw new AppError("UNSUPPORTED", "Застосунок Claude для комп'ютера є лише на macOS і Windows");
      await installClaudeDesktop(claude.configPath, claude.entry);
      return claudeDesktopStatus(claude.configPath, claude.entry);
    },
    "approval.current": () => approvals.current,
    "approval.respond": (id, approved) => approvals.respond(id, approved),
  };

  ipcMain.handle(IPC.invoke, async (_event, method: unknown, args: unknown): Promise<ApiResult<unknown>> => {
    try {
      if (typeof method !== "string" || !(method in handlers)) {
        throw new AppError("INVALID_ARGUMENT", `Unknown method: ${String(method)}`);
      }
      if (!Array.isArray(args)) throw new AppError("INVALID_ARGUMENT", "Arguments must be an array");
      const fn = handlers[method as ApiMethod] as (...a: unknown[]) => unknown;
      return { ok: true, value: await fn(...args) };
    } catch (e) {
      return { ok: false, error: toApiError(e) };
    }
  });

  const unsubscribe = store.subscribe((event) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(IPC.event, event);
  });

  return () => {
    ipcMain.removeHandler(IPC.invoke);
    unsubscribe();
  };
}
