import { CoreError, ProjectLoadError } from "@vn/core";
import type { ApiError } from "../../shared/api";

/** App error with a code the window (and MCP) understands. */
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

/** Turns any error into a plain structure that can pass through IPC. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof CoreError || e instanceof AppError) return { code: e.code, message: e.message, details: e.details };
  if (e instanceof ProjectLoadError) {
    return { code: `PROJECT_${e.kind.toUpperCase()}`, message: e.message };
  }
  if (e instanceof Error) return { code: "INTERNAL", message: e.message };
  return { code: "INTERNAL", message: String(e) };
}
