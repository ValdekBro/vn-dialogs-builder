import { contextBridge, ipcRenderer } from "electron";
import { IPC, type ApiMethod, type ApiMethods, type ApiResult, type SessionEvent } from "../shared/api";
import type { VnBridge } from "./api";

/**
 * Вузький безпечний API для вікна (ARCHITECTURE.md, розділ 6).
 * Вікно не має доступу ні до Node, ні до ipcRenderer напряму — лише до цих двох функцій.
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
