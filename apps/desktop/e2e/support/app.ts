import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { _electron, test as base, type ElectronApplication, type Page, type TestInfo } from "@playwright/test";
import { serializeProject, type Project } from "@vn/core";
import type { McpInfo } from "../../src/shared/api";
import { t } from "../../src/renderer/src/strings/uk";

/**
 * Launching the real app for E2E (TESTING.md, sections 2–4).
 * Every launch gets a clean temp data folder; the Claude config path always points into it,
 * so a test can never touch the real configs on this machine.
 */

const APP_DIR = resolve(__dirname, "../..");

export type LaunchOptions = {
  /** Projects put into the data folder before launch. The first one opens on start. */
  seed?: Project[];
  /** Seconds the agent waits for deletion approval (to test `timeout`). */
  approvalSec?: number;
};

export class VnApp {
  private constructor(
    readonly electron: ElectronApplication,
    readonly page: Page,
    readonly dataDir: string,
    private readonly options: LaunchOptions,
    private readonly log: string[],
  ) {}

  static async launch(dataDir: string, options: LaunchOptions = {}, log: string[] = []): Promise<VnApp> {
    const electron = await _electron.launch({
      args: [APP_DIR],
      cwd: APP_DIR,
      env: {
        ...process.env,
        VN_E2E: "1",
        VN_USER_DATA_DIR: dataDir,
        VN_CLAUDE_CONFIG: join(dataDir, "claude_desktop_config.json"),
        ...(options.approvalSec ? { VN_E2E_APPROVAL_SEC: String(options.approvalSec) } : {}),
      },
    });
    electron.process().stdout?.on("data", (d) => log.push(String(d)));
    electron.process().stderr?.on("data", (d) => log.push(String(d)));
    const page = await electron.firstWindow();
    page.on("console", (m) => log.push(`[renderer:${m.type()}] ${m.text()}`));
    page.on("pageerror", (e) => log.push(`[pageerror] ${e.message}`));
    return new VnApp(electron, page, dataDir, options, log);
  }

  /** Close and reopen with the same data folder (autosave and "open the last project" checks). */
  async restart(): Promise<VnApp> {
    await this.close();
    return VnApp.launch(this.dataDir, this.options, this.log);
  }

  async close() {
    await this.electron.close();
  }

  /** The model the window works on (`window.__vnTest`, test mode only). */
  async project(): Promise<Project> {
    const project = await this.page.evaluate(() => (window as unknown as { __vnTest: { getProject(): Promise<unknown> } }).__vnTest.getProject());
    if (!project) throw new Error("No project is open");
    return project as Project;
  }

  /** A real MCP client connected to this app's server (random port in test mode). */
  async connectAgent(): Promise<Agent> {
    const info = (await this.electron.evaluate(() => (globalThis as unknown as { __vnE2E: { mcp(): unknown } }).__vnE2E.mcp())) as McpInfo;
    const client = new Client({ name: "e2e-agent", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(info.url), { requestInit: { headers: { Authorization: `Bearer ${info.token}` } } }),
    );
    return new Agent(client);
  }

  /** The next "Save as" returns this path instead of showing the system window. */
  async stubSaveDialog(filePath: string) {
    await this.electron.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog;
    }, filePath);
  }

  /** The next "Open" returns this file instead of showing the system window. */
  async stubOpenDialog(filePath: string) {
    await this.electron.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog;
    }, filePath);
  }

  // ── Page objects (FLOWS.md sections) ──────────────────────

  get canvas() {
    const page = this.page;
    return {
      block: (blockId: string) => page.getByTestId(`block-${blockId}`),
      /** A block by a piece of its text. */
      blockWithText: (text: string) => page.locator('[data-testid^="block-"]').filter({ hasText: text }),
      /** `(+)` on a line's unconnected output. */
      addAfter: (lineId: string) => page.getByTestId(`add-${lineId}`),
      addFirst: () => page.getByRole("button", { name: t.canvas.addFirst }),
    };
  }

  /** The new block draft: character, then text, Enter. */
  get draft() {
    const page = this.page;
    return {
      pickCharacter: async (name: string) => {
        await page.getByRole("textbox", { name: t.canvas.pickCharacter }).fill(name);
        await page.getByRole("option", { name, exact: true }).or(page.getByRole("option", { name: t.canvas.createCharacter(name) })).first().click();
      },
      /** The draft's text field (several in a choice). */
      line: (index = 0) => page.locator(".react-flow__node textarea").nth(index),
      addOption: () => page.getByRole("button", { name: t.canvas.tip.addLineDraft }),
    };
  }

  get topBar() {
    const page = this.page;
    return {
      undo: () => page.getByRole("banner").getByRole("button", { name: t.history.undo, exact: true }),
      redo: () => page.getByRole("banner").getByRole("button", { name: t.history.redo, exact: true }),
      saved: () => page.getByText(t.save.saved, { exact: true }),
      view: (label: string) => page.getByRole("navigation", { name: t.views.label }).getByRole("button", { name: label }),
      switcher: () => page.getByRole("button", { name: t.projects.switchTo }),
      exportButton: () => page.getByTestId("export-button"),
    };
  }

  toast(text: string) {
    return this.page.getByText(text);
  }
}

/** An MCP agent: tool calls with parsed JSON results. */
export class Agent {
  constructor(readonly client: Client) {}

  async call<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const result = await this.client.callTool({ name, arguments: args });
    const r = result as { isError?: boolean; content: { type: string; text: string }[]; structuredContent?: unknown };
    if (r.isError) throw new Error(`${name} failed: ${r.content[0]?.text}`);
    return r.structuredContent as T;
  }

  async close() {
    await this.client.close();
  }
}

type Fixtures = {
  /** Launch options for the `vn` fixture: `test.use({ launch: { seed: [prologue()] } })`. */
  launch: LaunchOptions;
  vn: VnApp;
};

/** `test` with a ready app. The data folder and the main-process log are attached to failed tests. */
export const test = base.extend<Fixtures>({
  launch: [{}, { option: true }],
  vn: async ({ launch }, use, testInfo) => {
    const dataDir = await mkdtemp(join(tmpdir(), "vn-e2e-"));
    if (launch.seed?.length) await seedProjects(dataDir, launch.seed);
    const log: string[] = [];
    let app = await VnApp.launch(dataDir, launch, log);
    // restart() replaces the app, so the fixture closes whatever is current at the end.
    const track = (a: VnApp) => {
      const restart = a.restart.bind(a);
      a.restart = async () => {
        app = track(await restart());
        return app;
      };
      return a;
    };
    await use(track(app));
    await app.close().catch(() => {});
    await attachLog(testInfo, log);
    await rm(dataDir, { recursive: true, force: true });
  },
});

export { expect } from "@playwright/test";

async function seedProjects(dataDir: string, projects: Project[]) {
  const dir = join(dataDir, "projects");
  await mkdir(dir, { recursive: true });
  for (const p of projects) await writeFile(join(dir, `${p.id}.json`), serializeProject(p), "utf8");
  await writeFile(join(dataDir, "settings.json"), JSON.stringify({ version: 1, lastProjectId: projects[0]!.id }), "utf8");
}

async function attachLog(testInfo: TestInfo, log: string[]) {
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach("main-process.log", { body: log.join(""), contentType: "text/plain" });
  }
}
