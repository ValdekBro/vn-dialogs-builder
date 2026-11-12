import { contextBridge, ipcRenderer } from "electron";
import { IPC, type ApiMethod, type ApiMethods, type ApiResult, type SessionEvent } from "../shared/api";
import type { VnBridge } from "./api";

/**
 * A narrow safe API for the window (ARCHITECTURE.md, section 6).
 * The window has no access to Node or ipcRenderer directly — only to these two functions.
 */
const bridge: VnBridge = {
  async invoke<M extends ApiMethod>(method: M, ...args: ApiMethods[M][0]): Promise<ApiResult<ApiMethods[M][1]>> {
    return ipcRenderer.invoke(IPC.invoke, method, args);
  },
  onEvent(listener: (event: SessionEvent) => void) {
    const handler = (_: unknown, event: SessionEvent) => listener(event);
    ipcRenderer.on(IPC.event, handler);
    return () => {
      ipcRenderer.removeListener(IPC.event, handler);
    };
  },
};

contextBridge.exposeInMainWorld("vn", bridge);

// E2E test mode (TESTING.md, section 3): tests read the model the window works on.
if (process.argv.includes("--vn-e2e")) {
  contextBridge.exposeInMainWorld("__vnTest", {
    getProject: async () => {
      const result = (await ipcRenderer.invoke(IPC.invoke, "session.get", [])) as ApiResult<{ project: unknown } | null>;
      if (!result.ok) throw new Error(result.error.message);
      return result.value?.project ?? null;
    },
  });
}
