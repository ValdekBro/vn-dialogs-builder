import { create } from "zustand";
import type { SessionEvent, UpdateState } from "../../../shared/api";
import { call } from "../api";
import { showToast } from "./toast";
import { t } from "../strings/uk";

type UpdateStore = {
  appVersion: string;
  releasesUrl: string;
  update: UpdateState;
  /** The version whose banner the person closed: not reminded again until the next launch. */
  dismissed: string | null;
  /** The person pressed "Check for updates" and is waiting for an answer. */
  checking: boolean;
};

export const useUpdate = create<UpdateStore>(() => ({
  appVersion: "",
  releasesUrl: "",
  update: { status: "idle" },
  dismissed: null,
  checking: false,
}));

function onEvent(event: SessionEvent) {
  if (event.type !== "update") return;
  const { checking } = useUpdate.getState();
  useUpdate.setState({ update: event.update });
  if (!checking) return;
  // Answer to a manual check: "latest version" or an error — as a toast; a new version — as a banner.
  if (event.update.status === "checking") return;
  useUpdate.setState({ checking: false, dismissed: null });
  if (event.update.status === "latest" || event.update.status === "idle") showToast(t.update.latest(useUpdate.getState().appVersion), "info");
  if (event.update.status === "error") showToast(t.update.checkFailed, "error", 6000);
}

let started = false;

export async function startUpdateStore() {
  if (started) return;
  started = true;
  window.vn.onEvent(onEvent);
  const info = await call("app.info");
  useUpdate.setState({ appVersion: info.version, releasesUrl: info.releasesUrl, update: info.update });
}

export async function checkForUpdates() {
  const { update } = useUpdate.getState();
  if (update.status === "unsupported") {
    showToast(update.reason === "dev" ? t.update.unsupportedDev : t.update.unsupportedPlatform, "info", 6000);
    return;
  }
  if (update.status === "downloading" || update.status === "installing") return;
  useUpdate.setState({ checking: true });
  await call("update.check");
}

export function installUpdate() {
  void call("update.install");
}

export function dismissUpdate() {
  const { update } = useUpdate.getState();
  useUpdate.setState({ dismissed: "version" in update ? (update.version ?? null) : null });
}
