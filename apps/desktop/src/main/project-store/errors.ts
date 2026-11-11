import { CoreError, ProjectLoadError } from "@vn/core";
import type { ApiError } from "../../shared/api";

/** Помилка застосунку з кодом, який зрозуміє вікно (і пізніше MCP). */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Перетворює будь-яку помилку на просту структуру, що проходить через IPC. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof CoreError || e instanceof AppError) return { code: e.code, message: e.message, details: e.details };
  if (e instanceof ProjectLoadError) {
    return { code: `PROJECT_${e.kind.toUpperCase()}`, message: e.message };
  }
  if (e instanceof Error) return { code: "INTERNAL", message: e.message };
  return { code: "INTERNAL", message: String(e) };
}
