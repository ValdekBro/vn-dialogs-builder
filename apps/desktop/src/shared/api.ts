import type { ChangeSource, Project } from "@vn/core";
import type { Patch } from "immer";

/**
 * Contract between the main process and the window. Used by main (IPC handlers),
 * preload (the bridge) and renderer (calls). Only types and channel names here, no Electron code.
 */

/** Project card on the "Projects" screen. Built by scanning the `projects/` folder. */
export type ProjectSummary = {
  id: string;
  name: string;
  description: string;
  sceneCount: number;
  /** File modification time, ms. */
  updatedAt: number;
  /** The file cannot be opened: created by a newer app version, or corrupted. */
  problem?: "too_new" | "invalid";
};

export type HistoryState = {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
};

export type SaveState = "saved" | "dirty" | "saving" | "error";

/** Snapshot of the open project for the window. */
export type SessionSnapshot = {
  project: Project;
  /** Change counter: every `changed` event increments it by 1. A gap means the window must reload the snapshot. */
  version: number;
  history: HistoryState;
  save: SaveState;
};

/**
 * App update state (ARCHITECTURE.md, "Updates").
 * `unsupported` — updates do not work in this build (running from source, or Linux).
 */
export type UpdateState =
  | { status: "unsupported"; reason: "dev" | "platform" }
  | { status: "idle" }
  | { status: "checking" }
  | { status: "latest" }
  /** `manual` — the app cannot install by itself (macOS without Developer ID): the button opens the release page. */
  | { status: "available"; version: string; manual?: boolean }
  | { status: "downloading"; version: string; percent: number }
  | { status: "installing"; version: string }
  | { status: "error"; message: string; version?: string };

/**
 * An agent deletion request waiting for the human's decision (MCP.md, 5.9).
 * `items` — what exactly disappears (in plain language), `blockIds` — what to highlight on the canvas.
 */
export type ApprovalRequest = {
  id: string;
  tool: string;
  title: string;
  items: string[];
  reason: string | null;
  sceneId: string | null;
  blockIds: string[];
  /** When the request expires by itself, ms since epoch. */
  expiresAt: number;
};

/** MCP server state for the "Connect an agent" hint (MCP.md, 2). */
export type McpInfo = {
  running: boolean;
  url: string;
  port: number;
  token: string;
  /** Ready-made command for Claude Code. */
  command: string;
  error: string | null;
};

/**
 * Connecting to the Claude desktop app (MCP.md, 2): it only supports local
 * stdio servers, so VNami writes a bridge into its config (`entry`).
 */
export type ClaudeDesktopStatus = {
  /** The Claude app exists on this OS (macOS, Windows). */
  supported: boolean;
  /** Claude is installed (its settings folder exists). */
  found: boolean;
  /** Claude's config already has exactly this `vnami` entry. */
  connected: boolean;
  configPath: string | null;
  entry: { command: string; args: string[]; env: Record<string, string> };
};

/**
 * Which AI the person connects (the "Connect an AI agent" dialog asks once and remembers it app-wide,
 * in settings.json). `null` — not chosen yet.
 */
export const AGENT_CLIENTS = ["claude-desktop", "claude-code", "cursor", "other"] as const;
export type AgentClient = (typeof AGENT_CLIENTS)[number];

/** The agent's last action — for the top bar indicator. */
export type AgentActivity = { tool: string; at: number };

export type AppInfo = { version: string; update: UpdateState; releasesUrl: string };

/** Events from the main process to the window. */
export type SessionEvent =
  | { type: "opened"; snapshot: SessionSnapshot }
  | { type: "closed" }
  | {
      type: "changed";
      version: number;
      kind: "execute" | "undo" | "redo";
      source: ChangeSource;
      label: string;
      patches: Patch[];
      history: HistoryState;
    }
  | { type: "save"; save: SaveState }
  | { type: "projects"; projects: ProjectSummary[] }
  | { type: "update"; update: UpdateState }
  | { type: "approval"; request: ApprovalRequest | null }
  | { type: "agent"; activity: AgentActivity }
  | { type: "mcp"; mcp: McpInfo };

/** An error that passed through IPC. Core codes + the app's own codes. */
export type ApiError = { code: string; message: string; details?: unknown };

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };

/** Core commands the window may call (allowlist). */
export const ALLOWED_COMMANDS = [
  "updateProject",
  "createCharacter",
  "updateCharacter",
  "deleteCharacter",
  "reorderCharacters",
  "createScene",
  "updateScene",
  "deleteScene",
  "duplicateScene",
  "reorderScenes",
  "addBlock",
  "updateBlock",
  "deleteBlocks",
  "addLine",
  "updateLine",
  "deleteLine",
  "reorderLines",
  "setNext",
  "addChain",
  "addTree",
  "pasteBlocks",
  "moveBlocks",
  "resetLayout",
] as const;

export type CommandName = (typeof ALLOWED_COMMANDS)[number];

/** IPC channels. */
export const IPC = {
  invoke: "vn:invoke",
  event: "vn:event",
} as const;

/**
 * Methods the window calls through the single `vn:invoke` channel.
 * Key — method name, value — [arguments, result].
 */
export type ApiMethods = {
  "projects.list": [[], ProjectSummary[]];
  "projects.create": [[name: string], ProjectSummary];
  "projects.open": [[id: string], SessionSnapshot];
  "projects.close": [[], void];
  "projects.rename": [[id: string, name: string], void];
  "projects.duplicate": [[id: string], ProjectSummary];
  "projects.delete": [[id: string], void];
  "session.get": [[], SessionSnapshot | null];
  "session.execute": [[command: CommandName, args: unknown], unknown];
  "session.undo": [[], string | null];
  "session.redo": [[], string | null];
  "app.info": [[], AppInfo];
  /** Check now (the "Check for updates" button). The result arrives as an `update` event. */
  "update.check": [[], void];
  /** Download, install and restart — the "Update" button. */
  "update.install": [[], void];
  "mcp.info": [[], McpInfo];
  "claude.status": [[], ClaudeDesktopStatus];
  /** The AI chosen in the connect dialog. */
  "agent.client": [[], AgentClient | null];
  "agent.setClient": [[client: AgentClient | null], void];
  /** Write VNami into the Claude app config (the "Connect to Claude" button). */
  "claude.install": [[], ClaudeDesktopStatus];
  /** The current approval request (if the window opened while it was waiting). */
  "approval.current": [[], ApprovalRequest | null];
  "approval.respond": [[id: string, approved: boolean], void];
};

export type ApiMethod = keyof ApiMethods;
