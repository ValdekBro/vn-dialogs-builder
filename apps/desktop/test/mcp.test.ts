import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { sequentialIds } from "@vn/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ApprovalRequest } from "../src/shared/api";
import { Approvals } from "../src/main/mcp/approvals";
import { McpHttpServer } from "../src/main/mcp/http";
import { ProjectRepository } from "../src/main/persistence/project-repository";
import { SettingsStore } from "../src/main/persistence/settings";
import { ProjectStore } from "../src/main/project-store/project-store";

/**
 * The MCP server with a real MCP client over HTTP (TESTING.md): an agent writes the «Ранок у селі» scene,
 * reads it, edits, and deletes with human approval.
 */

const TOKEN = "test-token-0123456789abcdef";
const TEXT = {
  knock: "[Стук-стук у двері]",
  dad: "Ти вже прокинулася? Відра з водою порожні. Сходи по воду.",
  wake: "Ох... Так, уже прокинулася. Зараз зберуся й піду.",
  benIntro: "[Бен — мисливець]",
  ben: "Привіт, ГГ! З самого ранку вже на ногах, хехе. Відра не надто важкі? Може, допомогти донести?",
  accept: "О, Бене, доброго ранку! Та ні, не надто важкі. Але якщо ти так хочеш допомогти, візьми одне відро.",
  decline: "Доброго ранку, Бене! Дякую, але я сама впораюся.",
  well: "[До криниці стежка йде повз старий млин]",
};

let dir: string;
let server: McpHttpServer;
let store: ProjectStore;
let approvals: Approvals;
let shown: (ApprovalRequest | null)[];
let confirm: boolean;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vn-mcp-"));
  const settings = new SettingsStore(join(dir, "settings.json"));
  await settings.load();
  const repo = new ProjectRepository({ dir: join(dir, "projects"), appVersion: "9.9.9", newId: sequentialIds() });
  store = new ProjectStore({ repo, settings, autosaveMs: 0 });
  shown = [];
  confirm = true;
  approvals = new Approvals({ enabled: () => confirm, timeoutSec: () => 1, onShow: (r) => shown.push(r) });
  server = new McpHttpServer({ store, approvals, version: "9.9.9" });
  await server.start(0, TOKEN); // 0 — a free port
});

afterEach(async () => {
  await server.stop();
  await store.dispose();
  await rm(dir, { recursive: true, force: true });
});

async function connect(token = TOKEN) {
  const client = new Client({ name: "test-agent", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(server.info.url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
  );
  return client;
}

async function call<T = any>(client: Client, name: string, args: Record<string, unknown> = {}) {
  const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; structuredContent?: T; content: { text: string }[] };
  if (r.isError) throw new Error(r.content[0]!.text);
  return r.structuredContent as T;
}

async function callError(client: Client, name: string, args: Record<string, unknown> = {}) {
  const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
  expect(r.isError).toBe(true);
  return JSON.parse(r.content[0]!.text) as { code: string; message: string };
}

async function openProject() {
  const p = await store.createProject("Ранок у селі");
  await store.openProject(p.id);
  return store.activeProject!.sceneOrder[0]!;
}

describe("MCP server", () => {
  it("rejects requests without the right token and listens only on 127.0.0.1", async () => {
    expect(server.info.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    expect(server.info.command).toBe(`claude mcp add --transport http vnami ${server.info.url} --header "Authorization: Bearer ${TOKEN}"`);
    const res = await fetch(server.info.url, { method: "POST", headers: { Authorization: "Bearer wrong" }, body: "{}" });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe("UNAUTHORIZED");
    await expect(connect("wrong-token")).rejects.toThrow();
  });

  it("explains the model in the instructions and lists every tool from MCP.md", async () => {
    const client = await connect();
    expect(client.getInstructions()).toContain("add_tree");
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "list_projects", "get_project", "list_characters", "get_character", "list_scenes", "get_scene", "get_block",
        "find_blocks", "list_issues", "update_project", "create_character", "update_character", "delete_character",
        "create_scene", "update_scene", "delete_scene", "duplicate_scene", "add_block", "update_block", "delete_blocks",
        "add_line", "update_line", "delete_line", "reorder_lines", "set_next", "add_chain", "add_tree", "undo", "redo",
      ].sort(),
    );
  });

  it("without an open project only list_projects works", async () => {
    await store.createProject("Ранок у селі");
    const client = await connect();
    expect((await call(client, "list_projects")).projects).toEqual([expect.objectContaining({ name: "Ранок у селі", isActive: false })]);
    expect((await callError(client, "get_project")).code).toBe("NO_PROJECT_OPEN");
  });

  it("an agent writes the «Ранок» scene: chain, branching tree with convergence, outline, issues", async () => {
    const sceneId = await openProject();
    const client = await connect();
    await call(client, "update_project", { description: "Село біля лісу. ГГ живе з татком." });
    await call(client, "create_character", { name: "Татко", speechStyle: "Буркотливий, але турботливий" });
    await call(client, "create_character", { name: "ГГ" });
    await call(client, "create_character", { name: "Бен", description: "Мисливець" });

    const chain = await call(client, "add_chain", {
      sceneId,
      lines: [
        { character: "Автор", text: TEXT.knock },
        { character: "Татко", text: TEXT.dad },
        { character: "ГГ", text: TEXT.wake },
      ],
    });
    expect(chain.blockIds).toHaveLength(3);
    expect(chain.issues.errors).toBe(1); // the chain's tail is not connected yet

    const tree = await call(client, "add_tree", {
      sceneId,
      from: { blockId: chain.blockIds[2] },
      root: {
        character: "Автор",
        text: TEXT.benIntro,
        next: {
          character: "Бен",
          text: TEXT.ben,
          next: {
            label: "answer",
            character: "ГГ",
            lines: [
              { text: TEXT.accept, next: { label: "well", character: "Автор", text: TEXT.well, next: { end: true } } },
              { text: TEXT.decline, next: { ref: "well" } },
            ],
          },
        },
      },
    });
    expect(tree.issues).toEqual({ errors: 0, warnings: 0 });

    const { outline } = await call(client, "get_scene", { sceneId });
    expect(outline).toContain(`Татко: ${TEXT.dad}`);
    expect(outline).toContain("ГГ, вибір:");
    expect(outline).toContain(`↪ ${tree.blockIds.well}`);
    expect(outline).toContain("■ КІНЕЦЬ");

    // Agent changes are marked source: "agent", one undo step per call.
    const found = await call(client, "find_blocks", { query: "відра", character: "Бен" });
    expect(found.results).toHaveLength(1);
    const ben = await call(client, "get_block", { blockId: found.results[0].block.id });
    expect(ben.incoming).toHaveLength(1);
    expect((await call(client, "undo")).undone).toBe("Додати гілку");
    expect((await call(client, "redo")).redone).toBe("Додати гілку");
  });

  it("character by name: unknown and ambiguous names give INVALID_ARGUMENT with candidates", async () => {
    const sceneId = await openProject();
    const client = await connect();
    const err = await callError(client, "add_block", { sceneId, character: "Бен", text: TEXT.ben });
    expect(err.code).toBe("INVALID_ARGUMENT");
    expect(err.message).toContain("Unknown character");
    expect((await callError(client, "delete_character", { character: "Автор" })).code).toBe("FORBIDDEN");
  });

  it("deletions wait for the human: approved, rejected, timeout", async () => {
    const sceneId = await openProject();
    const client = await connect();
    const { blockIds } = await call(client, "add_chain", {
      sceneId,
      lines: [
        { character: "Автор", text: TEXT.knock },
        { character: "Автор", text: TEXT.well },
      ],
      end: { type: "end" },
    });

    // The human rejects.
    const rejected = call(client, "delete_blocks", { blockIds: [blockIds[1]], reason: "Зайвий опис" });
    await waitFor(() => shown.at(-1));
    const req = shown.at(-1)!;
    expect(req).toMatchObject({ tool: "delete_blocks", reason: "Зайвий опис", sceneId, blockIds: [blockIds[1]] });
    expect(req.items[0]).toContain(TEXT.well);
    approvals.respond(req.id, false);
    expect(await rejected).toEqual({ status: "rejected" });
    expect(store.activeProject!.scenes[sceneId]!.blocks[blockIds[1]]).toBeDefined();

    // The human approves.
    const approved = call(client, "delete_blocks", { blockIds: [blockIds[1]] });
    await waitFor(() => shown.at(-1));
    approvals.respond(shown.at(-1)!.id, true);
    const res = await approved;
    expect(res).toMatchObject({ status: "approved", deletedIds: [blockIds[1]] });
    expect(res.danglingOutputs).toHaveLength(1);
    expect(res.issues.errors).toBe(1);

    // The human did not answer (1 s timeout in the test).
    const line = await call(client, "add_line", { blockId: blockIds[0], text: "Ще варіант" });
    const t = await call(client, "delete_line", { lineId: line.lines[1].id });
    expect(t).toEqual({ status: "timeout" });
    expect(shown.at(-1)).toBeNull();
  });

  it("update_block that drops lines asks first; without dropped lines it applies at once", async () => {
    const sceneId = await openProject();
    const client = await connect();
    const block = await call(client, "add_block", {
      sceneId,
      character: "Автор",
      lines: [{ text: TEXT.accept }, { text: TEXT.decline }],
    });
    // Renaming an option — applied at once.
    const edited = await call(client, "update_block", {
      blockId: block.id,
      lines: [{ id: block.lines[0].id, text: TEXT.accept }, { id: block.lines[1].id, text: "Ні, дякую." }],
    });
    expect(edited.lines[1].text).toBe("Ні, дякую.");
    expect(shown).toHaveLength(0);

    // Removing an option — with approval; disabled approval skips the request.
    confirm = false;
    const dropped = await call(client, "update_block", { blockId: block.id, lines: [{ id: block.lines[0].id, text: TEXT.accept }] });
    expect(dropped).toMatchObject({ status: "approved", lines: [{ text: TEXT.accept }] });
  });
});

async function waitFor<T>(fn: () => T, ms = 2000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}
