import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAuthor, parseProjectFile, sequentialIds } from "@vn/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEvent } from "../src/shared/api";
import { ProjectRepository } from "../src/main/persistence/project-repository";
import { SettingsStore } from "../src/main/persistence/settings";
import { exportFileName, fileDialogDir, ProjectStore } from "../src/main/project-store/project-store";
import { toApiError } from "../src/main/project-store/errors";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vn-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function makeStore() {
  const settings = new SettingsStore(join(dir, "settings.json"));
  await settings.load();
  const repo = new ProjectRepository({ dir: join(dir, "projects"), appVersion: "9.9.9", newId: sequentialIds() });
  const store = new ProjectStore({ repo, settings, autosaveMs: 0 });
  const events: SessionEvent[] = [];
  store.subscribe((e) => events.push(e));
  return { settings, repo, store, events };
}

describe("ProjectRepository", () => {
  it("creates, lists, renames, duplicates and deletes projects", async () => {
    const { repo } = await makeStore();
    const a = await repo.create("  Літо в Заліссі  ");
    expect(a.name).toBe("Літо в Заліссі");
    await repo.rename(a.id, "Осінь у Заліссі");
    const copy = await repo.duplicate(a.id);
    expect(copy.id).not.toBe(a.id);
    const list = await repo.list();
    expect(list.map((p) => p.name).sort()).toEqual(["Осінь у Заліссі", "Осінь у Заліссі (копія)"]);
    expect(list[0]).toMatchObject({ sceneCount: 1, description: "" });
    await repo.delete(a.id);
    expect((await repo.list()).map((p) => p.id)).toEqual([copy.id]);
  });

  it("writes files with the app version and stable formatting", async () => {
    const { repo } = await makeStore();
    const p = await repo.create("Ранок у селі");
    const text = await readFile(repo.pathOf(p.id), "utf8");
    expect(text.endsWith("}\n")).toBe(true);
    expect(parseProjectFile(text).project.appVersion).toBe("9.9.9");
    // No temporary files are left after an atomic write.
    expect((await readdir(repo.dir)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("lists unreadable files with a problem instead of failing", async () => {
    const { repo } = await makeStore();
    const p = await repo.create("Ранок у селі");
    const newer = JSON.parse(await readFile(repo.pathOf(p.id), "utf8"));
    newer.version = 999;
    newer.id = "prj_newerxxxxx";
    await writeFile(join(repo.dir, "prj_newerxxxxx.json"), JSON.stringify(newer));
    await writeFile(join(repo.dir, "prj_brokenxxxx.json"), "{oops");
    await writeFile(join(repo.dir, "notes.txt"), "ignored");
    const list = await repo.list();
    expect(list.find((x) => x.id === "prj_newerxxxxx")).toMatchObject({ problem: "too_new", name: "Ранок у селі" });
    expect(list.find((x) => x.id === "prj_brokenxxxx")).toMatchObject({ problem: "invalid", name: "prj_brokenxxxx" });
    expect(list.find((x) => x.id === p.id)?.problem).toBeUndefined();
    await expect(repo.load("prj_newerxxxxx")).rejects.toMatchObject({ kind: "too_new" });
  });
});

describe("SettingsStore", () => {
  it("creates defaults with a token and persists updates", async () => {
    const s = new SettingsStore(join(dir, "settings.json"));
    const v = await s.load();
    expect(v).toMatchObject({ lastProjectId: null, confirmAgentDeletes: true, mcp: { port: 47821 } });
    expect(v.mcp.token.length).toBeGreaterThanOrEqual(16);
    await s.update({ lastProjectId: "prj_0000000001" });
    const again = await new SettingsStore(join(dir, "settings.json")).load();
    expect(again.lastProjectId).toBe("prj_0000000001");
    expect(again.mcp.token).toBe(v.mcp.token);
  });

  it("recovers from a corrupted file", async () => {
    await writeFile(join(dir, "settings.json"), "not json");
    const v = await new SettingsStore(join(dir, "settings.json")).load();
    expect(v.lastProjectId).toBeNull();
  });
});

describe("ProjectStore", () => {
  it("opens a project, runs commands and emits sequential patches", async () => {
    const { store, events } = await makeStore();
    const { id } = await store.createProject("Ранок у селі");
    const snap = await store.openProject(id);
    const sceneId = snap.project.sceneOrder[0]!;
    const authorId = getAuthor(snap.project).id;

    store.execute("addBlock", { sceneId, characterId: authorId, lines: [{ text: "[Стук-стук у двері]" }] }, "user");
    store.execute("createCharacter", { name: "Мельник" }, "agent");
    const changed = events.filter((e) => e.type === "changed");
    expect(changed.map((e) => e.type === "changed" && [e.version, e.source])).toEqual([
      [1, "user"],
      [2, "agent"],
    ]);
    expect(store.snapshot()!.history).toMatchObject({ canUndo: true, undoLabel: "Створити персонажа «Мельник»" });
    expect(store.undo()).toBe("Створити персонажа «Мельник»");
    expect(store.redo()).toBe("Створити персонажа «Мельник»");
    expect(store.snapshot()!.version).toBe(4);
  });

  it("autosave writes only when dirty and survives reopening", async () => {
    const { store, repo, events } = await makeStore();
    const { id } = await store.createProject("Ранок у селі");
    const snap = await store.openProject(id);
    await store.flush();
    expect(events.filter((e) => e.type === "save")).toEqual([]);

    store.execute("updateProject", { description: "Невелике село Залісся на краю лісу." }, "user");
    expect(store.isDirty).toBe(true);
    await store.flush();
    expect(store.isDirty).toBe(false);
    expect(events.filter((e) => e.type === "save").map((e) => e.type === "save" && e.save)).toEqual(["dirty", "saving", "saved"]);
    expect((await repo.load(id)).description).toBe("Невелике село Залісся на краю лісу.");
    expect(snap.project.description).toBe("");
  });

  it("flushes before switching projects and reopens the last one", async () => {
    const { store, repo, settings } = await makeStore();
    const a = await store.createProject("Літо в Заліссі");
    const b = await store.createProject("Зима в Заліссі");
    await store.openProject(a.id);
    store.execute("updateProject", { description: "Ще не збережений опис лору." }, "user");
    await store.openProject(b.id);
    expect((await repo.load(a.id)).description).toBe("Ще не збережений опис лору.");
    expect(store.snapshot()!.history.canUndo).toBe(false);
    expect(settings.value.lastProjectId).toBe(b.id);

    const restarted = new ProjectStore({ repo, settings, autosaveMs: 0 });
    expect((await restarted.openLastProject())?.project.id).toBe(b.id);
  });

  it("renames the active project through history, others on disk", async () => {
    const { store, repo } = await makeStore();
    const a = await store.createProject("Літо в Заліссі");
    const b = await store.createProject("Зима в Заліссі");
    await store.openProject(a.id);
    await store.renameProject(a.id, "Літо в Заліссі, частина 2");
    expect(store.activeProject!.name).toBe("Літо в Заліссі, частина 2");
    expect(store.snapshot()!.history.canUndo).toBe(true);
    await store.renameProject(b.id, "Зима в Заліссі, частина 2");
    expect((await repo.load(b.id)).name).toBe("Зима в Заліссі, частина 2");
  });

  it("the project list shows the open project's unsaved name, and follows agent renames and undo", async () => {
    const { store, events } = await makeStore();
    const a = await store.createProject("Літо в Заліссі");
    await store.openProject(a.id);
    const lastListedName = () => {
      const e = events.findLast((x) => x.type === "projects");
      return e?.type === "projects" ? e.projects.find((p) => p.id === a.id)?.name : undefined;
    };

    // Autosave is off here, so the file still has the old name.
    store.execute("updateProject", { name: "Останній трамвай" }, "agent");
    expect((await store.listProjects()).find((p) => p.id === a.id)?.name).toBe("Останній трамвай");
    await vi.waitFor(() => expect(lastListedName()).toBe("Останній трамвай"));

    store.undo();
    await vi.waitFor(() => expect(lastListedName()).toBe("Літо в Заліссі"));
  });

  it("remembers the last scene of each project across restarts, and forgets it with the project", async () => {
    const { store, settings, repo } = await makeStore();
    const a = await store.createProject("Ранок у селі");
    await store.openProject(a.id);
    expect(store.snapshot()!.lastSceneId).toBeNull();
    const { sceneId: well } = store.execute("createScene", { name: "Біля криниці" }, "user") as { sceneId: string };
    await store.rememberScene(well);
    await store.rememberScene("scn_gone12345"); // a scene that does not exist is ignored
    await store.flush();

    const restarted = new ProjectStore({ repo, settings, autosaveMs: 0 });
    expect((await restarted.openLastProject())?.lastSceneId).toBe(well);
    await restarted.deleteProject(a.id);
    expect(settings.value.lastScenes).toEqual({});
  });

  it("deleting the active project closes it and forgets it as last", async () => {
    const { store, settings, events } = await makeStore();
    const a = await store.createProject("Літо в Заліссі");
    await store.openProject(a.id);
    await store.deleteProject(a.id);
    expect(store.activeProject).toBeNull();
    expect(settings.value.lastProjectId).toBeNull();
    expect(events.some((e) => e.type === "closed")).toBe(true);
    expect(events.at(-1)).toEqual({ type: "projects", projects: [] });
  });

  it("reports errors with codes", async () => {
    const { store } = await makeStore();
    expect(() => store.execute("updateProject", { name: "Літо в Заліссі" }, "user")).toThrow();
    try {
      store.undo();
    } catch (e) {
      expect(toApiError(e)).toMatchObject({ code: "NO_PROJECT_OPEN" });
    }
    const a = await store.createProject("Літо в Заліссі");
    await store.openProject(a.id);
    try {
      store.execute("deleteCharacter", { characterId: getAuthor(store.activeProject!).id }, "user");
      expect.unreachable();
    } catch (e) {
      expect(toApiError(e)).toMatchObject({ code: "FORBIDDEN" });
    }
    try {
      store.execute("nope" as never, {}, "user");
      expect.unreachable();
    } catch (e) {
      expect(toApiError(e)).toMatchObject({ code: "INVALID_ARGUMENT" });
    }
  });

  it("exports the open project and imports it as a new project that opens right away", async () => {
    const { store, repo } = await makeStore();
    const a = await store.createProject("Ранок у селі");
    await store.openProject(a.id);
    const sceneId = store.activeProject!.sceneOrder[0]!;

    store.execute("createCharacter", { name: "Татко" }, "user");
    // A block with an unconnected output is an error, so export is blocked.
    store.execute("addTree", { sceneId, root: { character: "Автор", text: "[Ранок. Татко вже порається біля хати]" } }, "user");
    try {
      store.exportActive("9.9.9");
      expect.unreachable();
    } catch (e) {
      expect(toApiError(e)).toMatchObject({ code: "EXPORT_BLOCKED", details: { errors: 1 } });
    }
    store.undo();
    store.execute(
      "addTree",
      {
        sceneId,
        root: {
          character: "Автор",
          text: "[Ранок. Татко вже порається біля хати]",
          next: { character: "Татко", text: "Вставай, ГГ, сонце вже високо!", next: { end: true } },
        },
      },
      "user",
    );

    const { name, text } = store.exportActive("9.9.9");
    expect(name).toBe("Ранок у селі");
    expect(JSON.parse(text)).toMatchObject({ format: "vn-dialogs-builder.export", version: 1, project: { name: "Ранок у селі" } });

    const snapshot = await store.importProject(text);
    expect(snapshot.project.id).not.toBe(a.id);
    expect(store.activeProject!.id).toBe(snapshot.project.id);
    // The original is still in the list, so the import gets a suffix to tell them apart.
    expect(snapshot.project.name).toBe("Ранок у селі (імпорт)");
    const lines = Object.values(snapshot.project.scenes[sceneId]!.blocks).flatMap((b) => b.lines.map((l) => l.text));
    expect(lines.sort()).toEqual(["[Ранок. Татко вже порається біля хати]", "Вставай, ГГ, сонце вже високо!"].sort());
    expect((await repo.list()).length).toBe(2);
    expect((await store.importProject(text)).project.name).toBe("Ранок у селі (імпорт 2)");
  });

  it("reports why an import failed", async () => {
    const { store, repo } = await makeStore();
    const codeOf = async (text: string) => {
      try {
        await store.importProject(text);
        return "ok";
      } catch (e) {
        return toApiError(e).code;
      }
    };
    expect(await codeOf("{ це не json")).toBe("IMPORT_NOT_JSON");
    expect(await codeOf(JSON.stringify({ format: "something-else", version: 1 }))).toBe("IMPORT_UNKNOWN_FORMAT");
    expect(await codeOf(JSON.stringify({ format: "vn-dialogs-builder.export", version: 999 }))).toBe("IMPORT_TOO_NEW");
    expect(await codeOf(JSON.stringify({ format: "vn-dialogs-builder.export", version: 1, scenes: "не масив" }))).toBe("IMPORT_INVALID");
    expect(await repo.list()).toEqual([]);
  });

  it("starts file dialogs in the last export folder while it exists", async () => {
    expect(fileDialogDir(null, "/docs")).toBe("/docs");
    expect(fileDialogDir(dir, "/docs")).toBe(dir);
    expect(fileDialogDir(join(dir, "видалена папка"), "/docs")).toBe("/docs");
  });

  it("makes a safe file name from the project name", () => {
    expect(exportFileName("Останній трамвай")).toBe("Останній трамвай");
    expect(exportFileName('Глава 1: "Ранок" / чернетка?')).toBe("Глава 1_ _Ранок_ _ чернетка_");
    expect(exportFileName("  ...  ")).toBe("project");
  });
});
