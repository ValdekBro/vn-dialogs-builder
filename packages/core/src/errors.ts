/**
 * Core error codes. They match the MCP error codes (MCP.md, section 7),
 * so the MCP layer passes them to the agent unchanged.
 * Messages are in English: agents and developers read them.
 */
export type CoreErrorCode = "NOT_FOUND" | "INVALID_ARGUMENT" | "CROSS_SCENE" | "FORBIDDEN";

export class CoreError extends Error {
  readonly code: CoreErrorCode;
  readonly details: unknown;

  constructor(code: CoreErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "CoreError";
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what: string, id: string) => new CoreError("NOT_FOUND", `${what} not found: ${id}`, { id });

export const invalid = (message: string, details?: unknown) => new CoreError("INVALID_ARGUMENT", message, details);
