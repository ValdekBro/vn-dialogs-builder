import type { ApiError, ApiMethod, ApiMethods, CommandName } from "../../shared/api";

/** Помилка виклику головного процесу з кодом (NOT_FOUND, INVALID_ARGUMENT, ...). */
export class ApiCallError extends Error {
  readonly code: string;
  readonly details: unknown;
  constructor(error: ApiError) {
    super(error.message);
    this.name = "ApiCallError";
    this.code = error.code;
    this.details = error.details;
  }
}

/** Виклик методу головного процесу. Помилка перетворюється назад на виняток. */
export async function call<M extends ApiMethod>(method: M, ...args: ApiMethods[M][0]): Promise<ApiMethods[M][1]> {
  const result = await window.vn.invoke(method, ...args);
  if (!result.ok) throw new ApiCallError(result.error);
  return result.value;
}

/** Виконати команду ядра над відкритим проєктом. */
export function execute<R = unknown>(command: CommandName, args: unknown): Promise<R> {
  return call("session.execute", command, args) as Promise<R>;
}
