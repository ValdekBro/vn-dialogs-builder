import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { writeFileAtomic } from "./fs-atomic";

/** App settings (`settings.json` in storage). Not to be confused with project files. */
export const Settings = z.object({
  version: z.literal(1).default(1),
  /** The project to open on next launch. */
  lastProjectId: z.string().nullable().default(null),
  mcp: z
    .object({
      port: z.number().int().min(1).max(65535).default(47821),
      token: z.string().min(16).optional(),
    })
    .default({ port: 47821 }),
  /** "Confirm agent deletions" (MCP.md, 5.9). */
  confirmAgentDeletes: z.boolean().default(true),
  /** How many seconds an MCP call waits for human approval. */
  approvalTimeoutSec: z.number().int().min(5).max(3600).default(120),
});

export type Settings = z.infer<typeof Settings> & { mcp: { token: string } };

export class SettingsStore {
  #path: string;
  #value: Settings | null = null;

  constructor(path: string) {
    this.#path = path;
  }

  /** Reads settings. A missing or corrupted file gives the defaults. */
  async load(): Promise<Settings> {
    let raw: unknown = {};
    try {
      raw = JSON.parse(await readFile(this.#path, "utf8"));
    } catch {
      raw = {};
    }
    const parsed = Settings.safeParse(raw);
    const value = parsed.success ? parsed.data : Settings.parse({});
    const withToken: Settings = { ...value, mcp: { ...value.mcp, token: value.mcp.token ?? newToken() } };
    this.#value = withToken;
    if (!parsed.success || value.mcp.token === undefined) await this.#write();
    return withToken;
  }

  get value(): Settings {
    if (!this.#value) throw new Error("Settings are not loaded");
    return this.#value;
  }

  async update(patch: Partial<Omit<Settings, "version">>): Promise<Settings> {
    this.#value = { ...this.value, ...patch };
    await this.#write();
    return this.#value;
  }

  async #write() {
    await writeFileAtomic(this.#path, JSON.stringify(this.#value, null, 2) + "\n");
  }
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}
