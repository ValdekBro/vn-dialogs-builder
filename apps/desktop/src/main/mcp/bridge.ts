import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

/**
 * stdio ↔ HTTP bridge for clients that can only launch local stdio servers
 * (the Claude desktop app, MCP.md, 2). The client runs the VNami executable itself
 * in Node mode (`ELECTRON_RUN_AS_NODE=1`) with this script; the bridge forwards every JSON-RPC
 * message from stdin to the app's HTTP server and writes the reply to stdout.
 *
 * The bridge reads the port and token from the app's `settings.json` every time, so the client
 * config holds no token, and changing the port or token does not break the connection.
 */

type Json = Record<string, unknown>;
type Endpoint = { url: string; token: string };

export type BridgeOptions = {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  /** Where to get the URL and token; called for every message. */
  endpoint: () => Endpoint;
  fetch?: typeof fetch;
};

export const NOT_RUNNING =
  "VNami is not running. Ask the user to open the VNami app (and a project in it), then call the tool again.";

/** URL and token from the app's `settings.json` (src/main/persistence/settings.ts). */
export function endpointFromSettings(path: string): Endpoint {
  const s = JSON.parse(readFileSync(path, "utf8")) as { mcp?: { port?: number; token?: string } };
  return { url: `http://127.0.0.1:${s.mcp?.port ?? 47821}/mcp`, token: s.mcp?.token ?? "" };
}

/** Runs the bridge; the promise resolves once stdin is closed and every reply is sent. */
export async function runBridge({ input, output, endpoint, fetch: doFetch = fetch }: BridgeOptions): Promise<void> {
  let protocolVersion: string | undefined;
  const pending = new Set<Promise<void>>();
  const write = (msg: unknown): void => void output.write(JSON.stringify(msg) + "\n");

  const fail = (msg: unknown, message: string) => {
    for (const m of Array.isArray(msg) ? msg : [msg]) {
      // Only requests (with id and method) need a reply; notifications do not.
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
    if (res.status === 202) return; // notification accepted
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
    // Requests are handled in parallel: a long call (deletion approval) does not block others.
    const p = forward(line).finally(() => pending.delete(p));
    pending.add(p);
  }
  await Promise.all(pending);
}
