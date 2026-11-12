import type { ApiMethod, ApiMethods, ApiResult, SessionEvent } from "../shared/api";

/** What preload exposes to the window as `window.vn`. */
export type VnBridge = {
  invoke<M extends ApiMethod>(method: M, ...args: ApiMethods[M][0]): Promise<ApiResult<ApiMethods[M][1]>>;
  onEvent(listener: (event: SessionEvent) => void): () => void;
};

declare global {
  interface Window {
    vn: VnBridge;
  }
}
