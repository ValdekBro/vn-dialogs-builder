import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ClaudeDesktopStatus } from "../../shared/api";
import { writeFileAtomic } from "../persistence/fs-atomic";
import { MCP_SERVER_NAME } from "./http";

/**
 * Підключення до застосунку Claude для комп'ютера (MCP.md, 2). Він запускає лише локальні
 * stdio-сервери, тож у його конфіг записуємо міст (src/main/mcp/bridge.ts): сам виконуваний
 * файл VNami в режимі Node. Інші записи конфігу не чіпаємо.
 */

export type StdioEntry = { command: string; args: string[]; env: Record<string, string> };

/** Де Claude тримає конфіг: macOS і Windows (на Linux застосунку Claude немає). */
export function claudeDesktopConfigPath(platform: NodeJS.Platform, home: string, appData: string): string | null {
  if (platform === "darwin") return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (platform === "win32") return join(appData, "Claude", "claude_desktop_config.json");
  return null;
}

/** Запис `vnami` для конфігу: виконуваний файл VNami як Node + скрипт мосту + шлях до налаштувань. */
export function bridgeEntry(execPath: string, bridgeScript: string, settingsPath: string): StdioEntry {
  return { command: execPath, args: [bridgeScript, settingsPath], env: { ELECTRON_RUN_AS_NODE: "1" } };
}

/** Чи встановлений Claude і чи вже є в ньому саме цей запис. */
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
 * Додає або оновлює `mcpServers.vnami`, зберігаючи решту конфігу як є.
 * Пошкоджений конфіг не перезаписуємо: краще помилка, ніж втрачені налаштування користувача.
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
