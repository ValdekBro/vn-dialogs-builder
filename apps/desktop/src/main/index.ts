import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, nativeTheme, shell } from "electron";
import { registerIpc } from "./ipc/handlers";
import { ProjectRepository } from "./persistence/project-repository";
import { SettingsStore } from "./persistence/settings";
import { ProjectStore } from "./project-store/project-store";
import { Updater } from "./updater";
import { IPC } from "../shared/api";

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
  const updater = new Updater({
    // Перед встановленням дозберігаємо проєкт; далі вихід уже нічого не чекає.
    beforeInstall: async () => {
      quitting = true;
      await projectStore.dispose();
    },
    onState: (update) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.event, { type: "update", update });
    },
  });
  registerIpc(store, updater, () => mainWindow);
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
  store.dispose().finally(() => app.quit());
});
