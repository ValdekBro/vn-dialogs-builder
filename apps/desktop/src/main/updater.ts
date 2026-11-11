import { app } from "electron";
import type { UpdateState } from "../shared/api";

/** Сторінка релізів — для «Що нового» і ручного завантаження. */
export const RELEASES_URL = "https://github.com/ValdekBro/vn-dialogs-builder/releases";

/** Як часто перевіряти, якщо застосунок довго відкритий. */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
/** Перша перевірка — трохи після запуску, щоб не гальмувати відкриття проєкту. */
const FIRST_CHECK_DELAY_MS = 5_000;

type Options = {
  /** Перед встановленням: дозберегти проєкт. */
  beforeInstall: () => Promise<void>;
  onState: (state: UpdateState) => void;
};

/**
 * Оновлення через GitHub Releases (ARCHITECTURE.md, «Оновлення»).
 * Перевіряє при запуску й кожні 4 години; сам нічого не завантажує —
 * лише після кнопки «Оновити»: завантажити → дозберегти → встановити й перезапустити.
 */
export class Updater {
  #state: UpdateState;
  #options: Options;
  #updater: typeof import("electron-updater").autoUpdater | null = null;
  #timer: NodeJS.Timeout | null = null;
  /** Перевірку натиснула людина: тоді й помилку, і «остання версія» показуємо. */
  #manual = false;

  constructor(options: Options) {
    this.#options = options;
    this.#state = !app.isPackaged
      ? { status: "unsupported", reason: "dev" }
      : process.platform !== "win32"
        ? { status: "unsupported", reason: "platform" }
        : { status: "idle" };
  }

  get state(): UpdateState {
    return this.#state;
  }

  async start(): Promise<void> {
    if (this.#state.status === "unsupported") return;
    const { autoUpdater } = await import("electron-updater");
    autoUpdater.autoDownload = false;
    // Якщо оновлення завантажилось, а встановити не встигли, — встановиться при виході.
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = console;
    autoUpdater.on("checking-for-update", () => this.#set({ status: "checking" }));
    autoUpdater.on("update-available", (info) => this.#set({ status: "available", version: info.version }));
    autoUpdater.on("update-not-available", () => this.#set(this.#manual ? { status: "latest" } : { status: "idle" }));
    autoUpdater.on("download-progress", (p) => {
      const version = "version" in this.#state ? (this.#state.version ?? "") : "";
      this.#set({ status: "downloading", version, percent: Math.round(p.percent) });
    });
    autoUpdater.on("update-downloaded", (info) => void this.#install(info.version));
    autoUpdater.on("error", (e) => {
      const version = "version" in this.#state ? this.#state.version : undefined;
      // Фонова перевірка без інтернету — не привід турбувати людину.
      const visible = this.#manual || this.#state.status === "downloading" || this.#state.status === "installing";
      this.#set(visible ? { status: "error", message: e?.message ?? String(e), version } : { status: "idle" });
    });
    this.#updater = autoUpdater;
    setTimeout(() => void this.check(false), FIRST_CHECK_DELAY_MS);
    this.#timer = setInterval(() => void this.check(false), CHECK_INTERVAL_MS);
  }

  async check(manual = true): Promise<void> {
    if (!this.#updater) return;
    const busy = this.#state.status === "downloading" || this.#state.status === "installing";
    if (busy) return;
    this.#manual = manual;
    try {
      await this.#updater.checkForUpdates();
    } catch {
      // Стан уже виставив обробник `error`.
    }
  }

  /** Кнопка «Оновити». */
  async install(): Promise<void> {
    if (!this.#updater || this.#state.status !== "available") return;
    this.#manual = true;
    this.#set({ status: "downloading", version: this.#state.version, percent: 0 });
    try {
      await this.#updater.downloadUpdate();
    } catch {
      // Стан уже виставив обробник `error`.
    }
  }

  async #install(version: string) {
    if (this.#state.status === "installing") return;
    this.#set({ status: "installing", version });
    try {
      await this.#options.beforeInstall();
    } catch (e) {
      console.error("Could not save before update", e);
    }
    // Тихе встановлення й автоматичний перезапуск нової версії.
    this.#updater?.quitAndInstall(true, true);
  }

  dispose() {
    if (this.#timer) clearInterval(this.#timer);
  }

  #set(state: UpdateState) {
    this.#state = state;
    this.#options.onState(state);
  }
}
