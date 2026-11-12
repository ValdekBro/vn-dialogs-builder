import * as core from "@vn/core";
import type { Command } from "@vn/core";
import { ALLOWED_COMMANDS, type CommandName } from "../../shared/api";

/** Registry of core commands by name: the window (and MCP) call them only through this allowlist. */
export const COMMANDS: Record<CommandName, Command<any, unknown>> = Object.fromEntries(
  ALLOWED_COMMANDS.map((name) => {
    const cmd = (core as unknown as Record<string, Command<any, unknown>>)[name];
    if (!cmd || typeof cmd.run !== "function") throw new Error(`Unknown core command: ${name}`);
    return [name, cmd];
  }),
) as Record<CommandName, Command<any, unknown>>;

export function isCommandName(name: unknown): name is CommandName {
  return typeof name === "string" && (ALLOWED_COMMANDS as readonly string[]).includes(name);
}
