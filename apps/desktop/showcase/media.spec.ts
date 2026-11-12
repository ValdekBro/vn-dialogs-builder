import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { _electron, test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { serializeProject, type Project } from "@vn/core";
import type { McpInfo } from "../src/shared/api";
import { t } from "../src/renderer/src/strings/uk";
import { demoProject, fairTree } from "./demo";

/**
 * Records the README media from the real app into docs/media (needs ffmpeg for GIFs).
 * Each showcase launches the app on a fresh copy of the demo project in a temp folder.
 */

const APP_DIR = resolve(__dirname, "..");
const MEDIA = resolve(__dirname, "../../../docs/media");
/** The website (site/, GitHub Pages) gets sharper MP4 videos with poster images. */
const SITE_MEDIA = resolve(__dirname, "../../../site/media");
const SIZE = { width: 1200, height: 760 };
/** The UI is drawn a bit larger than on screen, so text stays readable in a README-sized GIF. */
const ZOOM = 1.15;

type Session = { app: ElectronApplication; page: Page; dataDir: string; framesDir: string };

/**
 * Playwright's video recording does not work with current Electron, so the main process
 * captures the window itself: a PNG frame every ~80 ms, named by its time. `finish` turns them into a GIF.
 */
async function startRecording(s: Session) {
  await mkdir(s.framesDir, { recursive: true });
  await s.app.evaluate(({ BrowserWindow }, dir) => {
    const fs = process.mainModule!.require("node:fs") as typeof import("node:fs");
    const win = BrowserWindow.getAllWindows()[0]!;
    const g = globalThis as unknown as { __rec?: { stop: boolean } };
    const rec = { stop: false };
    g.__rec = rec;
    const t0 = Date.now();
    const loop = async () => {
      while (!rec.stop) {
        const at = Date.now() - t0;
        const image = await win.webContents.capturePage();
        fs.writeFileSync(`${dir}/${String(at).padStart(7, "0")}.png`, image.toPNG());
        await new Promise((r) => setTimeout(r, Math.max(0, 80 - (Date.now() - t0 - at))));
      }
    };
    void loop();
  }, s.framesDir);
}

async function launch(project: Project): Promise<Session> {
  const dataDir = await mkdtemp(join(tmpdir(), "vn-showcase-"));
  await mkdir(join(dataDir, "projects"));
  await writeFile(join(dataDir, "projects", `${project.id}.json`), serializeProject(project));
  await writeFile(join(dataDir, "settings.json"), JSON.stringify({ version: 1, lastProjectId: project.id }));
  const app = await _electron.launch({
    args: [APP_DIR],
    cwd: APP_DIR,
    env: {
      ...process.env,
      VN_E2E: "1",
      VN_E2E_ANIMATIONS: "1",
      VN_E2E_HIDDEN: "1",
      VN_USER_DATA_DIR: dataDir,
      VN_CLAUDE_CONFIG: join(dataDir, "claude_desktop_config.json"),
    },
  });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }, { size, zoom }) => {
    const win = BrowserWindow.getAllWindows()[0]!;
    win.setContentSize(size.width, size.height);
    win.webContents.setZoomFactor(zoom);
  }, { size: SIZE, zoom: ZOOM });
  await page.waitForTimeout(800);
  return { app, page, dataDir, framesDir: join(dataDir, "frames") };
}

/** Stops recording, closes the app and turns the frames into a GIF (each frame lasts until the next one). */
async function finish(s: Session, gif?: string) {
  if (gif) {
    await s.app.evaluate(() => {
      (globalThis as unknown as { __rec: { stop: boolean } }).__rec.stop = true;
    });
    await new Promise((r) => setTimeout(r, 300));
  }
  await s.app.close();
  if (gif) {
    const frames = (await readdir(s.framesDir)).filter((f) => f.endsWith(".png")).sort();
    const at = frames.map((f) => Number(f.slice(0, -4)));
    const list = frames.map((f, i) => `file '${join(s.framesDir, f)}'\nduration ${((at[i + 1] ?? at[i]! + 1500) - at[i]!) / 1000}`).join("\n");
    const listFile = join(s.framesDir, "frames.txt");
    await writeFile(listFile, `${list}\nfile '${join(s.framesDir, frames.at(-1)!)}'\n`);
    const filters =
      "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle";
    const ffmpeg = (...args: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile, ...args]);
    ffmpeg("-vf", filters, "-loop", "0", join(MEDIA, `${gif}.gif`));
    // H.264 at 30 fps (frames repeat to fill gaps), even dimensions, playable everywhere and quick to start.
    ffmpeg("-vf", "fps=30,scale=1600:-2:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", join(SITE_MEDIA, `${gif}.mp4`));
    // Poster: the last frame (the finished result), shown before the video loads.
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(s.framesDir, frames.at(-1)!), "-vf", "scale=1600:-2", "-q:v", "4", join(SITE_MEDIA, `${gif}.jpg`)]);
  }
  await rm(s.dataDir, { recursive: true, force: true });
}

/** A window screenshot taken by the main process (Playwright's screenshot ignores the zoom factor). */
async function shot(s: Session, name: string) {
  const png = await s.app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0]!.webContents.capturePage()).toPNG().toString("base64"));
  await writeFile(join(MEDIA, `${name}.png`), Buffer.from(png, "base64"));
}

async function agentFor(app: ElectronApplication) {
  const info = (await app.evaluate(() => (globalThis as unknown as { __vnE2E: { mcp(): unknown } }).__vnE2E.mcp())) as McpInfo;
  const client = new Client({ name: "showcase-agent", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(info.url), { requestInit: { headers: { Authorization: `Bearer ${info.token}` } } }));
  const call = async <T>(name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })).structuredContent as T;
  return { client, call };
}

test.beforeAll(async () => {
  await mkdir(MEDIA, { recursive: true });
  await mkdir(SITE_MEDIA, { recursive: true });
});

test("screenshots", async () => {
  const project = demoProject();
  const s = await launch(project);
  const { page } = s;
  // «Біля криниці» fits the frame at full size: a choice and jumps to the next scene.
  await page.getByTestId(`scene-${project.sceneOrder[1]}`).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: t.canvas.tip.fit }).click();
  await page.waitForTimeout(600);
  await shot(s, "canvas");

  await page.getByRole("navigation", { name: t.views.label }).getByRole("button", { name: t.views.characters }).click();
  await page.getByText("Татко").first().click();
  await page.waitForTimeout(400);
  await shot(s, "characters");

  await page.getByTestId("agent-button").click();
  await page.getByRole("button", { name: new RegExp(t.agent.pick.claude) }).first().click();
  await page.getByRole("button", { name: new RegExp(t.agent.pick.claudeDesktop) }).first().click();
  await page.waitForTimeout(400);
  await shot(s, "agent-connect");
  await finish(s);
});

test("building a dialogue", async () => {
  const s = await launch(demoProject());
  const { page } = s;
  await page.getByRole("button", { name: t.scenes.add }).click();
  await page.keyboard.type("Вечір");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: t.canvas.addFirst })).toBeVisible();
  await startRecording(s);
  await page.waitForTimeout(600);

  const type = (text: string) => page.keyboard.type(text, { delay: 35 });
  const pick = async (name: string) => {
    await page.getByRole("textbox", { name: t.canvas.pickCharacter }).pressSequentially(name.slice(0, 3), { delay: 90 });
    await page.waitForTimeout(250);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
  };
  // Like a person would: drag the canvas so the next (+) sits left of centre, leaving room for the draft.
  const pane = page.locator(".react-flow__pane");
  const panTo = async (x: number) => {
    const box = (await page.locator('[data-testid^="add-"]').last().boundingBox())!;
    const area = (await pane.boundingBox())!;
    const target = area.x + area.width * 0.38;
    if (box.x - target < x) return;
    const y = area.y + area.height * 0.8;
    await page.mouse.move(area.x + area.width * 0.7, y);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width * 0.7 - (box.x - target), y, { steps: 18 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  };
  const lastOutput = async () => {
    await panTo(0);
    const outputs = page.locator('[data-testid^="add-"]');
    await outputs.last().hover();
    await page.waitForTimeout(300);
    await outputs.last().click();
  };

  await page.getByRole("button", { name: t.canvas.addFirst }).click();
  await pick("Автор");
  await type("[Вечоріє. Над річкою стелиться туман]");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);

  await lastOutput();
  await pick("Бен");
  await type("ГГ, підемо завтра на ярмарок разом?");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);

  await lastOutput();
  await pick("ГГ");
  await type("Звісно! Зустрінемось біля криниці.");
  await page.getByRole("button", { name: t.canvas.tip.addLineDraft }).click();
  await type("Не можу, татко попросив допомогти.");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2000);
  await finish(s, "build");
});

test("an AI agent writes a scene", async () => {
  const project = demoProject({ fair: false });
  const s = await launch(project);
  const { page } = s;
  const fair = project.sceneOrder[2]!;
  await page.getByTestId(`scene-${fair}`).click();
  await page.waitForTimeout(500);
  await startRecording(s);
  const agent = await agentFor(s.app);
  await page.waitForTimeout(800);

  const { blockIds } = await agent.call<{ blockIds: string[] }>("add_chain", {
    sceneId: fair,
    lines: [{ character: "Оксана", text: fairTree.text }],
  });
  await page.waitForTimeout(1300);
  const { rootBlockId } = await agent.call<{ rootBlockId: string }>("add_tree", {
    sceneId: fair,
    from: { blockId: blockIds[0] },
    root: { character: "ГГ", lines: fairTree.next.lines.map((l) => ({ text: l.text })) },
  });
  await page.waitForTimeout(1300);
  const choice = await agent.call<{ lines: { id: string }[] }>("get_block", { blockId: rootBlockId });
  for (const [i, line] of fairTree.next.lines.entries()) {
    await agent.call("add_chain", {
      sceneId: fair,
      from: { blockId: rootBlockId, lineId: choice.lines[i]!.id },
      lines: [{ character: line.next.character, text: line.next.text }],
      end: { type: "end" },
    });
    await page.waitForTimeout(1300);
  }
  await page.getByRole("button", { name: t.canvas.tip.fit }).click();
  await page.waitForTimeout(2200);
  await agent.client.close();
  await finish(s, "agent");
});

test("playing a scene", async () => {
  const s = await launch(demoProject());
  const { page } = s;
  await page.getByRole("navigation", { name: t.views.label }).getByRole("button", { name: t.views.simulation }).click();
  await page.waitForTimeout(500);
  await startRecording(s);
  await page.locator('[data-testid^="sim-scene-"]').first().click();
  await page.getByRole("group", { name: t.sim.speed }).getByRole("button", { name: "2×" }).click();
  await expect(page.getByTestId("sim-choice")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  await page.keyboard.press("2");
  // The branch converges, then jumps to «Біля криниці»: wait for the next choice there.
  await expect(page.getByText(t.sim.scene("Біля криниці"))).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("sim-choice")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  await page.keyboard.press("1");
  await page.waitForTimeout(2500);
  await finish(s, "simulation");
});
