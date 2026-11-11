/**
 * Коди помилок ядра. Вони збігаються з кодами помилок MCP (MCP.md, розділ 7),
 * тож MCP-шар передає їх агенту без перекладу.
 * Повідомлення англійською: їх читають агенти й розробники.
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
