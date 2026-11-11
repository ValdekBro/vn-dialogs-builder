import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateState } from "../src/shared/api";

const electron = vi.hoisted(() => ({ app: { isPackaged: true } }));
vi.mock("electron", () => electron);

const fake = vi.hoisted(() => ({ autoUpdater: null as any }));
vi.mock("electron-updater", () => fake);

function makeAutoUpdater() {
  const u = new EventEmitter() as any;
  u.checkForUpdates = vi.fn(async () => {
    u.emit("checking-for-update");
    u.emit(u.nextCheck === "available" ? "update-available" : "update-not-available", { version: "0.2.0" });
  });
  u.downloadUpdate = vi.fn(async () => {
    u.emit("download-progress", { percent: 42.4 });
    u.emit("update-downloaded", { version: "0.2.0" });
  });
  u.quitAndInstall = vi.fn();
  return u;
}

const realPlatform = process.platform;
const setPlatform = (p: string) => Object.defineProperty(process, "platform", { value: p });

describe("Updater", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    electron.app.isPackaged = true;
    setPlatform("win32");
    fake.autoUpdater = makeAutoUpdater();
  });
  afterEach(() => {
    vi.useRealTimers();
    setPlatform(realPlatform);
  });

  async function make() {
    const { Updater } = await import("../src/main/updater");
    const states: UpdateState[] = [];
    const saved: string[] = [];
    const updater = new Updater({
      beforeInstall: async () => void saved.push("saved"),
      onState: (s) => states.push(s),
    });
    return { updater, states, saved };
  }

  it("is unsupported when running from source or not on Windows", async () => {
    electron.app.isPackaged = false;
    expect((await make()).updater.state).toEqual({ status: "unsupported", reason: "dev" });
    electron.app.isPackaged = true;
    setPlatform("darwin");
    expect((await make()).updater.state).toEqual({ status: "unsupported", reason: "platform" });
  });

  it("checks after launch and every 4 hours, without downloading anything by itself", async () => {
    fake.autoUpdater.nextCheck = "available";
    const { updater, states } = await make();
    await updater.start();
    expect(fake.autoUpdater.autoDownload).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fake.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual({ status: "available", version: "0.2.0" });
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(fake.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(fake.autoUpdater.downloadUpdate).not.toHaveBeenCalled();
  });

  it("«Оновити»: downloads, saves the project, then installs silently and restarts", async () => {
    fake.autoUpdater.nextCheck = "available";
    const { updater, states, saved } = await make();
    await updater.start();
    await updater.check(false);
    await updater.install();
    await vi.waitFor(() => expect(fake.autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true));
    expect(saved).toEqual(["saved"]);
    expect(states.map((s) => s.status)).toEqual(["checking", "available", "downloading", "downloading", "installing"]);
    expect(states[3]).toEqual({ status: "downloading", version: "0.2.0", percent: 42 });
  });

  it("a manual check reports «latest»; a background check stays quiet, even on network errors", async () => {
    const { updater, states } = await make();
    await updater.start();
    await updater.check(false);
    expect(states.at(-1)).toEqual({ status: "idle" });
    await updater.check(true);
    expect(states.at(-1)).toEqual({ status: "latest" });

    fake.autoUpdater.checkForUpdates.mockImplementationOnce(async () => {
      fake.autoUpdater.emit("error", new Error("net::ERR_INTERNET_DISCONNECTED"));
      throw new Error("net::ERR_INTERNET_DISCONNECTED");
    });
    await updater.check(false);
    expect(states.at(-1)).toEqual({ status: "idle" });
  });
});
