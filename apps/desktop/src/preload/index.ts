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
