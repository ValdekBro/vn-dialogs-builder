import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpInfo } from "../../shared/api";
import { registerTools, SERVER_INSTRUCTIONS, type ToolContext } from "./tools";

export const MCP_SERVER_NAME = "vnami";

/** Готова команда підключення для Claude Code (MCP.md, 2). */
export function connectCommand(url: string, token: string): string {
  return `claude mcp add --transport http ${MCP_SERVER_NAME} ${url} --header "Authorization: Bearer ${token}"`;
}

type Options = ToolContext & { version: string; onStatus?: (info: McpInfo) => void };

/**
 * MCP-сервер застосунку (MCP.md, 2): Streamable HTTP на `127.0.0.1:<port>/mcp`,
 * доступ за токеном у заголовку `Authorization: Bearer`. Без сесій: кожен запит —
 * новий екземпляр сервера над тим самим ProjectStore, тож стан живе лише в застосунку.
 */
export class McpHttpServer {
  #options: Options;
  #http: Server | null = null;
  #port = 0;
  #token = "";
  #error: string | null = null;

  constructor(options: Options) {
    this.#options = options;
  }

  get info(): McpInfo {
    const url = `http://127.0.0.1:${this.#port}/mcp`;
    return {
      running: this.#http !== null,
      url,
      port: this.#port,
      token: this.#token,
      command: connectCommand(url, this.#token),
      error: this.#error,
    };
  }

  async start(port: number, token: string): Promise<void> {
    await this.stop();
    this.#port = port;
    this.#token = token;
    const http = createServer((req, res) => void this.#handle(req, res));
    try {
      await new Promise<void>((resolve, reject) => {
        http.once("error", reject);
        // Лише локально: ззовні комп'ютера сервер недоступний (ARCHITECTURE.md, 6).
        http.listen(port, "127.0.0.1", () => {
          http.off("error", reject);
          resolve();
        });
      });
      this.#port = (http.address() as { port: number }).port;
      this.#http = http;
      this.#error = null;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      this.#error = code === "EADDRINUSE" ? `Порт ${port} зайнятий іншою програмою` : String((e as Error).message ?? e);
    }
    this.#options.onStatus?.(this.info);
  }

  async stop(): Promise<void> {
    const http = this.#http;
    if (!http) return;
    this.#http = null;
    await new Promise<void>((resolve) => http.close(() => resolve()));
    http.closeAllConnections?.();
  }

  async #handle(req: IncomingMessage, res: ServerResponse) {
    const path = (req.url ?? "").split("?")[0];
    if (path !== "/mcp") return send(res, 404, { error: "Not found. The MCP endpoint is /mcp" });
    // Захист від DNS rebinding: приймаємо лише локальні Host.
    const host = (req.headers.host ?? "").replace(/:\d+$/, "");
    if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) return send(res, 403, { error: "Forbidden host" });
    if (!this.#authorized(req.headers.authorization)) {
      return send(res, 401, { code: "UNAUTHORIZED", message: "Missing or wrong token. Copy the connect command from VNami." });
    }
    if (req.method !== "POST") {
      // Без сесій немає потоку подій сервера (GET) і завершення сесії (DELETE).
      return send(res, 405, { error: "Method not allowed" }, { Allow: "POST" });
    }
    const server = new McpServer({ name: MCP_SERVER_NAME, version: this.#options.version }, { instructions: SERVER_INSTRUCTIONS });
    registerTools(server, this.#options);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (e) {
      console.error("MCP request failed", e);
      if (!res.headersSent) send(res, 500, { error: "Internal error" });
    }
  }

  #authorized(header: string | undefined): boolean {
    const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
    if (!m) return false;
    const a = Buffer.from(m[1]!.trim());
    const b = Buffer.from(this.#token);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}
