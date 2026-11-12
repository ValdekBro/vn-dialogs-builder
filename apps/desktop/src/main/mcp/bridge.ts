import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

/**
 * Міст stdio ↔ HTTP для клієнтів, що вміють запускати лише локальні stdio-сервери
 * (застосунок Claude для комп'ютера, MCP.md, 2). Клієнт запускає сам виконуваний файл VNami
 * в режимі Node (`ELECTRON_RUN_AS_NODE=1`) з цим скриптом; міст пересилає кожне JSON-RPC
 * повідомлення з stdin на HTTP-сервер застосунку, а відповідь пише в stdout.
 *
 * Порт і токен міст щоразу читає з `settings.json` застосунку, тож у конфігу клієнта
 * немає токена, а зміна порту чи токена не ламає підключення.
 */

type Json = Record<string, unknown>;
type Endpoint = { url: string; token: string };

export type BridgeOptions = {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  /** Звідки взяти адресу й токен; викликається на кожне повідомлення. */
  endpoint: () => Endpoint;
  fetch?: typeof fetch;
};

export const NOT_RUNNING =
  "VNami is not running. Ask the user to open the VNami app (and a project in it), then call the tool again.";

/** Адреса й токен з `settings.json` застосунку (src/main/persistence/settings.ts). */
export function endpointFromSettings(path: string): Endpoint {
  const s = JSON.parse(readFileSync(path, "utf8")) as { mcp?: { port?: number; token?: string } };
  return { url: `http://127.0.0.1:${s.mcp?.port ?? 47821}/mcp`, token: s.mcp?.token ?? "" };
}

/** Запускає міст; проміс завершується, коли stdin закрився і всі відповіді надіслано. */
export async function runBridge({ input, output, endpoint, fetch: doFetch = fetch }: BridgeOptions): Promise<void> {
  let protocolVersion: string | undefined;
  const pending = new Set<Promise<void>>();
  const write = (msg: unknown): void => void output.write(JSON.stringify(msg) + "\n");

  const fail = (msg: unknown, message: string) => {
    for (const m of Array.isArray(msg) ? msg : [msg]) {
      // Відповідь потрібна лише на запити (є id і method); на сповіщення — ні.
      const r = m as Json | null;
      if (r && typeof r === "object" && typeof r.method === "string" && "id" in r) {
        write({ jsonrpc: "2.0", id: r.id, error: { code: -32000, message } });
      }
    }
  };

  const forward = async (line: string): Promise<void> => {
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      return write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
    let res: Response;
    try {
      const { url, token } = endpoint();
      res = await doFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${token}`,
          ...(protocolVersion ? { "MCP-Protocol-Version": protocolVersion } : {}),
        },
        body: line,
      });
    } catch {
      return fail(msg, NOT_RUNNING);
    }
    if (res.status === 202) return; // сповіщення прийнято
    const text = await res.text();
    if (res.status === 401) return fail(msg, "VNami rejected the token. Reconnect VNami in Claude from the app's «Підключити AI-агента» dialog.");
    let replies: unknown[];
    try {
      replies = (res.headers.get("content-type") ?? "").includes("text/event-stream")
        ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5)))
        : [JSON.parse(text)];
    } catch {
      return fail(msg, `VNami MCP server error (HTTP ${res.status})`);
    }
    for (const reply of replies.flat()) {
      if (!reply || typeof reply !== "object" || !("jsonrpc" in reply)) {
        fail(msg, `VNami MCP server error (HTTP ${res.status})`);
        continue;
      }
      const version = ((reply as Json).result as Json | undefined)?.protocolVersion;
      if ((msg as Json).method === "initialize" && typeof version === "string") protocolVersion = version;
      write(reply);
    }
  };

  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    // Запити обробляються паралельно: довгий виклик (підтвердження видалення) не блокує інші.
    const p = forward(line).finally(() => pending.delete(p));
    pending.add(p);
  }
  await Promise.all(pending);
}
