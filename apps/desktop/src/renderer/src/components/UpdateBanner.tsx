import { Download, X } from "lucide-react";
import { dismissUpdate, installUpdate, useUpdate } from "../store/update-store";
import { t } from "../strings/uk";
import { Tip } from "./Tip";

/**
 * Плашка оновлення (ARCHITECTURE.md, «Оновлення»): «Доступна версія X · Що нового · Оновити».
 * Після «Оновити» — прогрес завантаження, далі застосунок сам зберігає проєкт і перезапускається.
 */
export function UpdateBanner() {
  const { update, dismissed, releasesUrl } = useUpdate();
  const version = "version" in update ? update.version : undefined;
  const show =
    update.status === "downloading" ||
    update.status === "installing" ||
    (update.status === "available" && dismissed !== update.version) ||
    (update.status === "error" && !!version && dismissed !== version);
  if (!show) return null;

  const notesUrl = version ? `${releasesUrl}/tag/v${version}` : releasesUrl;

  return (
    <div
      role="status"
      data-testid="update-banner"
      className="fixed right-4 top-20 z-50 w-80 rounded-lg border border-blue-500/40 bg-zinc-900 p-3 text-sm shadow-xl shadow-black/40"
    >
      {update.status === "available" && (
        <>
          <div className="flex items-start gap-2">
            <Download size={16} className="mt-0.5 shrink-0 text-blue-400" />
            <div className="flex-1">
              <div className="font-medium text-zinc-100">{t.update.available(update.version)}</div>
              <a href={notesUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300">
                {t.update.whatsNew}
              </a>
            </div>
            <Tip label={t.update.later}>
              <button type="button" onClick={dismissUpdate} className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
                <X size={14} />
              </button>
            </Tip>
          </div>
          <button
            type="button"
            onClick={installUpdate}
            className="mt-3 w-full rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700"
          >
            {t.update.install}
          </button>
        </>
      )}
      {update.status === "downloading" && (
        <>
          <div className="text-zinc-200">{t.update.downloading(update.version, update.percent)}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full bg-blue-500 transition-[width]" style={{ width: `${update.percent}%` }} />
          </div>
        </>
      )}
      {update.status === "installing" && <div className="text-zinc-200">{t.update.installing}</div>}
      {update.status === "error" && (
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <div className="text-red-300">{t.update.failed}</div>
            <a href={notesUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300">
              {t.update.manual}
            </a>
          </div>
          <button type="button" onClick={dismissUpdate} className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
