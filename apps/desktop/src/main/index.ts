import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, nativeTheme, shell } from "electron";
import { registerIpc } from "./ipc/handlers";
import { ProjectRepository } from "./persistence/project-repository";
import { SettingsStore } from "./persistence/settings";
import { ProjectStore } from "./project-store/project-store";
import { Updater } from "./updater";
import { IPC, type SessionEvent } from "../shared/api";
import { Approvals } from "./mcp/approvals";
import { McpHttpServer } from "./mcp/http";
import { bridgeEntry, claudeDesktopConfigPath } from "./mcp/claude-desktop";

app.setName("VNami");
// The UI is dark-only: system elements (menus, dialogs, scrollbars) are dark too.
nativeTheme.themeSource = "dark";

/** Test mode for E2E (TESTING.md, section 3). */
const e2e = process.env.VN_E2E === "1";

// The data folder can be overridden with an environment variable (a separate folder for tests and experiments).
const userDataOverride = process.env.VN_USER_DATA_DIR;
if (userDataOverride) app.setPath("userData", userDataOverride);
else migrateLegacyDataDir();

/**
 * The app used to be called "VN Dialogs Builder". Its projects are copied into the VNami folder
 * if they are not there yet. Nothing is overwritten or deleted: the old folder stays as a backup.
 * (The folder cannot simply be renamed: Electron creates the new folder before our code runs.)
 */
function migrateLegacyDataDir() {
  const legacyProjects = join(app.getPath("appData"), "VN Dialogs Builder", "projects");
  if (!existsSync(legacyProjects)) return;
  const projects = join(app.getPath("userData"), "projects");
  try {
    mkdirSync(projects, { recursive: true });
    for (const file of readdirSync(legacyProjects)) {
      if (!/^prj_[A-Za-z0-9_-]{10}\.json$/.test(file)) continue;
      const target = join(projects, file);
      if (!existsSync(target)) copyFileSync(join(legacyProjects, file), target);
    }
  } catch (e) {
    console.error("Could not copy legacy projects", e);
  }
}

let mainWindow: BrowserWindow | null = null;
let store: ProjectStore | null = null;
let approvals: Approvals | null = null;
let mcp: McpHttpServer | null = null;
let quitting = false;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "VNami",
    backgroundColor: "#09090b",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      additionalArguments: e2e ? ["--vn-e2e"] : [],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // VN_E2E_HIDDEN: background E2E runs; the window renders fully but is not shown.
  if (!(e2e && process.env.VN_E2E_HIDDEN === "1")) win.on("ready-to-show", () => win.show());
  // No transitions in tests, so clicks land where the element ends up. Showcase recordings keep them.
  if (e2e && process.env.VN_E2E_ANIMATIONS !== "1") win.webContents.on("did-finish-load", () => void win.webContents.insertCSS("*,*::before,*::after{transition:none!important;animation:none!important}"));
  // External links open in the browser, not in the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event) => event.preventDefault());

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl);
  else void win.loadFile(join(__dirname, "../renderer/index.html"));
  return win;
}

async function bootstrap() {
  // In development the Dock shows Electron's icon; the packaged app takes build/icon.icns.
  if (!app.isPackaged && process.platform === "darwin") app.dock?.setIcon(join(__dirname, "../../build/icon.png"));
  const dataDir = app.getPath("userData");
  const settings = new SettingsStore(join(dataDir, "settings.json"));
  await settings.load();
  const repo = new ProjectRepository({
    dir: join(dataDir, "projects"),
    appVersion: app.getVersion(),
    trash: (path) => shell.trashItem(path),
  });
  await repo.init();
  // In tests autosave runs right after a change, so a restart finds everything on disk.
  store = new ProjectStore({ repo, settings, autosaveMs: e2e ? 50 : undefined });
  const projectStore = store;
  const send = (event: SessionEvent) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.event, event);
  };
  const updater = new Updater({
    // Before installing, flush the project; after that quitting waits for nothing.
    beforeInstall: async () => {
      quitting = true;
      await projectStore.dispose();
    },
    onState: (update) => send({ type: "update", update }),
  });
  // MCP (MCP.md): the agent works on the open project; deletions only after human approval.
  approvals = new Approvals({
    enabled: () => settings.value.confirmAgentDeletes,
    timeoutSec: () => (e2e && process.env.VN_E2E_APPROVAL_SEC ? Number(process.env.VN_E2E_APPROVAL_SEC) : settings.value.approvalTimeoutSec),
    onShow: (request) => {
      send({ type: "approval", request });
      // The human must see the request even if the window is minimized.
      if (request && mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.flashFrame(true);
      }
    },
  });
  mcp = new McpHttpServer({
    store,
    approvals,
    version: app.getVersion(),
    onActivity: (tool) => send({ type: "agent", activity: { tool, at: Date.now() } }),
    onStatus: (info) => send({ type: "mcp", mcp: info }),
  });
  // Tests run in parallel, so each app takes a random free port; the test reads it from __vnE2E.
  await mcp.start(e2e ? 0 : settings.value.mcp.port, settings.value.mcp.token);
  if (e2e) (globalThis as { __vnE2E?: unknown }).__vnE2E = { mcp: () => mcp?.info };
  if (mcp.info.error) console.error("MCP server:", mcp.info.error);
  // Bridge for the Claude app: the script lives outside app.asar (asarUnpack in electron-builder.yml),
  // because another process runs it — VNami in Node mode.
  const bridgeScript = join(__dirname, "mcp-bridge.js").replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
  const claude = {
    // VN_CLAUDE_CONFIG — tests only, so the real Claude config is never touched.
    configPath: process.env.VN_CLAUDE_CONFIG ?? claudeDesktopConfigPath(process.platform, app.getPath("home"), app.getPath("appData")),
    entry: bridgeEntry(process.execPath, bridgeScript, join(dataDir, "settings.json")),
  };
  registerIpc({ store, updater, mcp, approvals, settings, claude }, () => mainWindow);
  await store.openLastProject();

  mainWindow = createWindow();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  if (!e2e) void updater.start().catch((e) => console.error("Updater failed to start", e));
}

app.whenReady().then(bootstrap, (e) => {
  console.error(e);
  app.quit();
});

app.on("activate", () => {
  if (store && BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Flush the project before quitting: autosave may not have run yet.
app.on("before-quit", (event) => {
  if (quitting || !store) return;
  event.preventDefault();
  quitting = true;
  approvals?.cancelAll();
  void mcp?.stop();
  store.dispose().finally(() => app.quit());
});
