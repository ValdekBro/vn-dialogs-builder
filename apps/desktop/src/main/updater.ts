import { app, shell } from "electron";
import type { UpdateState } from "../shared/api";

/** Releases page — for "What's new" and manual download. */
export const RELEASES_URL = "https://github.com/ValdekBro/vn-dialogs-builder/releases";

/** How often to check if the app stays open for a long time. */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
/** The first check comes a little after launch, so it does not slow down opening the project. */
const FIRST_CHECK_DELAY_MS = 5_000;

type Options = {
  /** Before installing: flush the project. */
  beforeInstall: () => Promise<void>;
  onState: (state: UpdateState) => void;
};

/**
 * Updates via GitHub Releases (ARCHITECTURE.md, "Updates").
 * Checks on launch and every 4 hours; downloads nothing by itself —
 * only after the "Update" button: download → flush → install and restart.
 * On macOS — check only: the "Download" button opens the release page (see `downloadOnly`).
 */
export class Updater {
  #state: UpdateState;
  #options: Options;
  #updater: typeof import("electron-updater").autoUpdater | null = null;
  #timer: NodeJS.Timeout | null = null;
  /** The person pressed the check button: then both an error and "latest version" are shown. */
  #manual = false;
  /**
   * macOS without a Developer ID: checking works, installing does not (Squirrel.Mac requires the same
   * developer signature). So "Update" opens the release page with the .dmg.
   */
  readonly downloadOnly = process.platform === "darwin";

  constructor(options: Options) {
    this.#options = options;
    this.#state = !app.isPackaged
      ? { status: "unsupported", reason: "dev" }
      : process.platform !== "win32" && process.platform !== "darwin"
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
    // If the update was downloaded but not installed yet, it installs on quit.
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = console;
    autoUpdater.on("checking-for-update", () => this.#set({ status: "checking" }));
    autoUpdater.on("update-available", (info) =>
      this.#set(this.downloadOnly ? { status: "available", version: info.version, manual: true } : { status: "available", version: info.version }),
    );
    autoUpdater.on("update-not-available", () => this.#set(this.#manual ? { status: "latest" } : { status: "idle" }));
    autoUpdater.on("download-progress", (p) => {
      const version = "version" in this.#state ? (this.#state.version ?? "") : "";
      this.#set({ status: "downloading", version, percent: Math.round(p.percent) });
    });
    autoUpdater.on("update-downloaded", (info) => void this.#install(info.version));
    autoUpdater.on("error", (e) => {
      const version = "version" in this.#state ? this.#state.version : undefined;
      // A background check without internet is no reason to bother the person.
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
      // The `error` handler has already set the state.
    }
  }

  /** The "Update" button. */
  async install(): Promise<void> {
    if (!this.#updater || this.#state.status !== "available") return;
    if (this.downloadOnly) {
      await shell.openExternal(`${RELEASES_URL}/tag/v${this.#state.version}`);
      return;
    }
    this.#manual = true;
    this.#set({ status: "downloading", version: this.#state.version, percent: 0 });
    try {
      await this.#updater.downloadUpdate();
    } catch {
      // The `error` handler has already set the state.
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
    // Silent install and automatic restart into the new version.
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
