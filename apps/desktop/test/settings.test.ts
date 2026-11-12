import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsStore } from "../src/main/persistence/settings";

/** App settings (settings.json): the AI picked in the connect dialog is remembered for the whole app. */

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vn-settings-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("settings", () => {
  it("remembers the chosen AI across restarts, and forgets it on request", async () => {
    const path = join(dir, "settings.json");
    const first = new SettingsStore(path);
    expect((await first.load()).agentClient).toBeNull();
    await first.update({ agentClient: "claude-desktop" });

    const second = new SettingsStore(path);
    expect((await second.load()).agentClient).toBe("claude-desktop");
    await second.update({ agentClient: null });
    expect(JSON.parse(await readFile(path, "utf8")).agentClient).toBeNull();
  });

  it("keeps the MCP token when an older settings file has no agentClient", async () => {
    const path = join(dir, "settings.json");
    await writeFile(path, JSON.stringify({ version: 1, lastProjectId: null, mcp: { port: 47821, token: "old-token-0123456789abcdef" } }));
    const s = await new SettingsStore(path).load();
    expect(s.mcp.token).toBe("old-token-0123456789abcdef");
    expect(s.agentClient).toBeNull();
  });
});
