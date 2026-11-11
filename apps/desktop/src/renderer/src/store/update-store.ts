import { create } from "zustand";
import type { SessionEvent, UpdateState } from "../../../shared/api";
import { call } from "../api";
import { showToast } from "./toast";
import { t } from "../strings/uk";

type UpdateStore = {
  appVersion: string;
  releasesUrl: string;
  update: UpdateState;
  /** Версія, плашку якої людина закрила: про неї більше не нагадуємо до наступного запуску. */
  dismissed: string | null;
  /** Людина натиснула «Перевірити оновлення» й чекає на відповідь. */
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
  // Відповідь на ручну перевірку: «остання версія» або помилка — тостом; нова версія — плашкою.
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
