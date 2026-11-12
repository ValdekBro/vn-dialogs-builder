import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ClaudeDesktopStatus } from "../../shared/api";
import { writeFileAtomic } from "../persistence/fs-atomic";
import { MCP_SERVER_NAME } from "./http";

/**
 * Connecting to the Claude desktop app (MCP.md, 2). It only launches local
 * stdio servers, so we write the bridge into its config (src/main/mcp/bridge.ts): the VNami
 * executable itself in Node mode. Other config entries are left alone.
 */

export type StdioEntry = { command: string; args: string[]; env: Record<string, string> };

/** Where Claude keeps its config: macOS and Windows (there is no Claude app on Linux). */
export function claudeDesktopConfigPath(platform: NodeJS.Platform, home: string, appData: string): string | null {
  if (platform === "darwin") return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (platform === "win32") return join(appData, "Claude", "claude_desktop_config.json");
  return null;
}

/** The `vnami` config entry: the VNami executable as Node + the bridge script + the settings path. */
export function bridgeEntry(execPath: string, bridgeScript: string, settingsPath: string): StdioEntry {
  return { command: execPath, args: [bridgeScript, settingsPath], env: { ELECTRON_RUN_AS_NODE: "1" } };
}

/** Whether Claude is installed and already has exactly this entry. */
export async function claudeDesktopStatus(configPath: string | null, entry: StdioEntry): Promise<ClaudeDesktopStatus> {
  if (!configPath) return { supported: false, found: false, connected: false, configPath: null, entry };
  const found = await exists(dirname(configPath));
  let connected = false;
  try {
    const config = JSON.parse(await readFile(configPath, "utf8")) as { mcpServers?: Record<string, unknown> };
    connected = JSON.stringify(config.mcpServers?.[MCP_SERVER_NAME]) === JSON.stringify(entry);
  } catch {
    connected = false;
  }
  return { supported: true, found, connected, configPath, entry };
}

export class ClaudeConfigError extends Error {}

/**
 * Adds or updates `mcpServers.vnami`, keeping the rest of the config as is.
 * A broken config is never overwritten: an error is better than losing the user's settings.
 */
export async function installClaudeDesktop(configPath: string, entry: StdioEntry): Promise<void> {
  let config: Record<string, unknown> = {};
  let raw: string | null = null;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (raw !== null && raw.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ClaudeConfigError(`Файл ${configPath} пошкоджений (не JSON). Виправте його або додайте запис вручну.`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ClaudeConfigError(`Файл ${configPath} має незнайомий формат. Додайте запис вручну.`);
    }
    config = parsed as Record<string, unknown>;
  }
  const servers = config.mcpServers && typeof config.mcpServers === "object" ? (config.mcpServers as Record<string, unknown>) : {};
  config.mcpServers = { ...servers, [MCP_SERVER_NAME]: entry };
  await mkdir(dirname(configPath), { recursive: true });
  await writeFileAtomic(configPath, JSON.stringify(config, null, 2) + "\n");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
