import { describe, expect, it } from "vitest";
import {
  addBlock,
  addChain,
  createScene,
  ExportBlockedError,
  ExportFormatError,
  fromExport,
  ImportError,
  migrateExport,
  Project,
  sequentialIds,
  serializeExport,
  toExport,
} from "../src";
import { setupMorning } from "./helpers";

const now = new Date("2026-11-11T12:00:00.000Z");

describe("export", () => {
  it("exports a clean project in traversal order and skips empty scenes", () => {
    const { editor, sceneId, ids } = setupMorning();
    editor.run(createScene, { name: "Біля криниці" });
    const file = toExport(editor.project, { appVersion: "0.1.0", now });
    expect(file).toMatchObject({
      format: "vn-dialogs-builder.export",
      version: 1,
      appVersion: "0.1.0",
      exportedAt: "2026-11-11T12:00:00.000Z",
      project: { id: editor.project.id, name: "Ранок у селі" },
    });
    expect(file.characters.map((c) => [c.name, c.isAuthor])).toEqual([
      ["Автор", true],
      ["Татко", false],
      ["ГГ", false],
      ["Бен", false],
    ]);
    expect(file.scenes).toHaveLength(1);
    expect(file.scenes[0]!.id).toBe(sceneId);
    expect(file.scenes[0]!.blocks.map((b) => b.id)).toEqual([ids.knock, ids.dad, ids.wake, ids.benIntro, ids.ben, ids.answer, ids.well]);
    expect(serializeExport(file).endsWith("}\n")).toBe(true);
  });

  it("is blocked by errors", () => {
    const { editor, sceneId, authorId } = setupMorning();
    editor.run(addBlock, { sceneId, characterId: authorId, lines: [{ text: "[Десь далеко гавкає собака]" }] });
    expect(() => toExport(editor.project, { appVersion: "0.1.0" })).toThrow(ExportBlockedError);
  });

  it("round-trips through import into a new project", () => {
    const { editor, sceneId, ids } = setupMorning();
    editor.run(addChain, { sceneId, from: { blockId: ids.well }, lines: [{ character: "Бен", text: "Ну, бувай, ГГ. Побіг я на полювання!" }], end: { type: "end" } });
    const file = toExport(editor.project, { appVersion: "0.1.0", now });
    const imported = fromExport(JSON.parse(serializeExport(file)), { appVersion: "0.2.0", newId: () => "prj_imported00" });
    expect(Project.safeParse(imported).success).toBe(true);
    expect(imported.id).toBe("prj_imported00");
    expect(imported.appVersion).toBe("0.2.0");
    expect({ ...imported, id: editor.project.id, appVersion: editor.project.appVersion }).toEqual(editor.project);
  });

  it("rejects malformed and too-new export files", () => {
    expect(() => migrateExport({ format: "nope", version: 1 })).toThrow(ExportFormatError);
    expect(() => migrateExport({ format: "vn-dialogs-builder.export", version: 99 })).toThrow(/newer/);
    expect(() =>
      fromExport({ format: "vn-dialogs-builder.export", version: 1, scenes: [] }, { appVersion: "x", newId: sequentialIds() }),
    ).toThrow(ImportError);
  });

  it("rejects an export that would break project invariants", () => {
    const { editor } = setupMorning();
    const file = toExport(editor.project, { appVersion: "0.1.0", now });
    file.characters.forEach((c) => (c.isAuthor = false));
    expect(() => fromExport(file, { appVersion: "x" })).toThrow(ImportError);
  });

  it("runs export migrations from older versions", () => {
    const migrated = migrateExport(
      { format: "vn-dialogs-builder.export", version: 1, legacy: true },
      { 1: ({ legacy: _legacy, ...rest }) => ({ ...rest, upgraded: true }) },
      2,
    );
    expect(migrated).toEqual({ format: "vn-dialogs-builder.export", version: 2, upgraded: true });
  });
});

describe("export with scene transitions", () => {
  it("keeps transitions and refuses to export while the target scene is empty", async () => {
    const { createScene: cs, setNext: sn, addBlock: ab } = await import("../src");
    const { editor, ids, authorId } = setupMorning();
    const { sceneId: well } = editor.run(cs, { name: "Біля криниці" });
    editor.run(sn, { from: { blockId: ids.well }, next: { type: "scene", sceneId: well } });
    expect(() => toExport(editor.project, { appVersion: "0.1.0", now })).toThrow(ExportBlockedError);
    editor.run(ab, { sceneId: well, characterId: authorId, lines: [{ text: "[Скрип коловорота]", next: { type: "end" } }] });
    const file = toExport(editor.project, { appVersion: "0.1.0", now });
    const morning = file.scenes[0]!;
    expect(morning.blocks.find((b) => b.id === ids.well)!.lines[0]!.next).toEqual({ type: "scene", sceneId: well });
    expect(file.scenes.map((s) => s.name)).toContain("Біля криниці");
  });
});
