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
// Інтерфейс лише в темній темі: системні елементи (меню, діалоги, скролбари) теж темні.
nativeTheme.themeSource = "dark";

// Тека даних можна підмінити змінною середовища (окрема тека для тестів і експериментів).
const userDataOverride = process.env.VN_USER_DATA_DIR;
if (userDataOverride) app.setPath("userData", userDataOverride);
else migrateLegacyDataDir();

/**
 * Застосунок раніше називався «VN Dialogs Builder». Його проєкти докопіюємо в теку VNami,
 * якщо їх там ще немає. Нічого не перезаписуємо й не видаляємо: стара тека лишається як резервна.
 * (Перейменувати теку цілком не можна: Electron створює нову теку ще до запуску нашого коду.)
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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.on("ready-to-show", () => win.show());
  // Зовнішні посилання відкриваються в браузері, а не у вікні застосунку.
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
  const dataDir = app.getPath("userData");
  const settings = new SettingsStore(join(dataDir, "settings.json"));
  await settings.load();
  const repo = new ProjectRepository({
    dir: join(dataDir, "projects"),
    appVersion: app.getVersion(),
    trash: (path) => shell.trashItem(path),
  });
  await repo.init();
  store = new ProjectStore({ repo, settings });
  const projectStore = store;
  const send = (event: SessionEvent) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.event, event);
  };
  const updater = new Updater({
    // Перед встановленням дозберігаємо проєкт; далі вихід уже нічого не чекає.
    beforeInstall: async () => {
      quitting = true;
      await projectStore.dispose();
    },
    onState: (update) => send({ type: "update", update }),
  });
  // MCP (MCP.md): агент працює з відкритим проєктом; видалення — лише після схвалення людиною.
  approvals = new Approvals({
    enabled: () => settings.value.confirmAgentDeletes,
    timeoutSec: () => settings.value.approvalTimeoutSec,
    onShow: (request) => {
      send({ type: "approval", request });
      // Запит має побачити людина, навіть якщо вікно згорнуте.
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
  await mcp.start(settings.value.mcp.port, settings.value.mcp.token);
  if (mcp.info.error) console.error("MCP server:", mcp.info.error);
  // Міст для застосунку Claude: скрипт лежить поза app.asar (asarUnpack в electron-builder.yml),
  // бо його запускає інший процес — VNami в режимі Node.
  const bridgeScript = join(__dirname, "mcp-bridge.js").replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
  const claude = {
    // VN_CLAUDE_CONFIG — лише для тестів, щоб не чіпати справжній конфіг Claude.
    configPath: process.env.VN_CLAUDE_CONFIG ?? claudeDesktopConfigPath(process.platform, app.getPath("home"), app.getPath("appData")),
    entry: bridgeEntry(process.execPath, bridgeScript, join(dataDir, "settings.json")),
  };
  registerIpc({ store, updater, mcp, approvals, claude }, () => mainWindow);
  await store.openLastProject();

  mainWindow = createWindow();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  void updater.start().catch((e) => console.error("Updater failed to start", e));
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

// Перед виходом дозберігаємо проєкт: autosave міг ще не встигнути.
app.on("before-quit", (event) => {
  if (quitting || !store) return;
  event.preventDefault();
  quitting = true;
  approvals?.cancelAll();
  void mcp?.stop();
  store.dispose().finally(() => app.quit());
});
