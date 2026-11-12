import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { sequentialIds } from "@vn/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NOT_RUNNING, runBridge } from "../src/main/mcp/bridge";
import { bridgeEntry, claudeDesktopConfigPath, claudeDesktopStatus, ClaudeConfigError, installClaudeDesktop } from "../src/main/mcp/claude-desktop";
import { Approvals } from "../src/main/mcp/approvals";
import { McpHttpServer } from "../src/main/mcp/http";
import { ProjectRepository } from "../src/main/persistence/project-repository";
import { SettingsStore } from "../src/main/persistence/settings";
import { ProjectStore } from "../src/main/project-store/project-store";

/**
 * Застосунок Claude для комп'ютера (MCP.md, 2): міст stdio ↔ HTTP і запис у конфіг Claude.
 * Міст перевіряємо справжнім MCP-клієнтом, що говорить із ним рядками JSON, як Claude.
 */

const TOKEN = "test-token-0123456789abcdef";
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vn-claude-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Транспорт клієнта поверх пари потоків — те саме, що stdio-процес мосту для Claude. */
function pipeTransport(toBridge: PassThrough, fromBridge: PassThrough): Transport {
  let buf = "";
  const t: Transport = {
    async start() {
      fromBridge.on("data", (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (line.trim()) t.onmessage?.(JSON.parse(line) as JSONRPCMessage);
        }
      });
    },
    async send(msg) {
      toBridge.write(JSON.stringify(msg) + "\n");
    },
    async close() {
      toBridge.end();
      t.onclose?.();
    },
  };
  return t;
}

function startBridge(endpoint: () => { url: string; token: string }) {
  const input = new PassThrough();
  const output = new PassThrough();
  const done = runBridge({ input, output, endpoint });
  return { transport: pipeTransport(input, output), done };
}

describe("MCP bridge for the Claude app", () => {
  let server: McpHttpServer;
  let store: ProjectStore;

  beforeEach(async () => {
    const settings = new SettingsStore(join(dir, "settings.json"));
    await settings.load();
    const repo = new ProjectRepository({ dir: join(dir, "projects"), appVersion: "9.9.9", newId: sequentialIds() });
    store = new ProjectStore({ repo, settings, autosaveMs: 0 });
    const approvals = new Approvals({ enabled: () => true, timeoutSec: () => 1, onShow: () => {} });
    server = new McpHttpServer({ store, approvals, version: "9.9.9" });
    await server.start(0, TOKEN);
  });
  afterEach(async () => {
    await server.stop();
    await store.dispose();
  });

  it("forwards the whole session: initialize, tools, a write into the open project", async () => {
    const p = await store.createProject("Ранок у селі");
    await store.openProject(p.id);
    const { transport, done } = startBridge(() => ({ url: server.info.url, token: TOKEN }));
    const client = new Client({ name: "claude-desktop", version: "1.0.0" });
    await client.connect(transport);

    expect(client.getServerVersion()?.name).toBe("vnami");
    expect(client.getInstructions()).toContain("add_tree");
    expect((await client.listTools()).tools.map((t) => t.name)).toContain("add_chain");

    const sceneId = store.activeProject!.sceneOrder[0]!;
    const r = (await client.callTool({
      name: "add_chain",
      arguments: { sceneId, lines: [{ character: "Автор", text: "[Стук-стук у двері]" }], end: { type: "end" } },
    })) as unknown as { structuredContent: { blockIds: string[] } };
    expect(r.structuredContent.blockIds).toHaveLength(1);
    expect(Object.values(store.activeProject!.scenes[sceneId]!.blocks).map((b) => b.lines[0]!.text)).toContain("[Стук-стук у двері]");

    await client.close();
    await done;
  });

  it("when VNami is closed the agent gets a clear error instead of a hang", async () => {
    await server.stop();
    const { transport } = startBridge(() => ({ url: server.info.url, token: TOKEN }));
    const client = new Client({ name: "claude-desktop", version: "1.0.0" });
    await expect(client.connect(transport)).rejects.toThrow(NOT_RUNNING);
  });

  it("a wrong token is reported, not swallowed", async () => {
    const { transport } = startBridge(() => ({ url: server.info.url, token: "wrong-token-0123456789" }));
    const client = new Client({ name: "claude-desktop", version: "1.0.0" });
    await expect(client.connect(transport)).rejects.toThrow(/rejected the token/);
  });
});

describe("Claude app config", () => {
  const entry = bridgeEntry("/Applications/VNami.app/Contents/MacOS/VNami", "/x/mcp-bridge.js", "/x/settings.json");

  it("knows where Claude keeps its config on macOS and Windows", () => {
    expect(claudeDesktopConfigPath("darwin", "/Users/ann", "")).toBe("/Users/ann/Library/Application Support/Claude/claude_desktop_config.json");
    expect(claudeDesktopConfigPath("win32", "C:\\Users\\ann", "/appdata")).toBe(join("/appdata", "Claude", "claude_desktop_config.json"));
    expect(claudeDesktopConfigPath("linux", "/home/ann", "")).toBeNull();
  });

  it("adds vnami and keeps everything else in the user's config", async () => {
    const path = join(dir, "Claude", "claude_desktop_config.json");
    expect(await claudeDesktopStatus(path, entry)).toMatchObject({ found: false, connected: false });

    await installClaudeDesktop(path, entry); // ні файлу, ні папки ще немає
    await writeFile(
      path,
      JSON.stringify({ preferences: { quickEntryShortcut: "off" }, mcpServers: { other: { command: "x" }, vnami: { command: "old" } } }),
    );
    await installClaudeDesktop(path, entry);
    const config = JSON.parse(await readFile(path, "utf8"));
    expect(config).toEqual({ preferences: { quickEntryShortcut: "off" }, mcpServers: { other: { command: "x" }, vnami: entry } });
    expect(entry.env).toEqual({ ELECTRON_RUN_AS_NODE: "1" });
    expect(await claudeDesktopStatus(path, entry)).toMatchObject({ found: true, connected: true });
  });

  it("never overwrites a broken config", async () => {
    const path = join(dir, "claude_desktop_config.json");
    await writeFile(path, "{ broken");
    await expect(installClaudeDesktop(path, entry)).rejects.toBeInstanceOf(ClaudeConfigError);
    expect(await readFile(path, "utf8")).toBe("{ broken");
  });
});
