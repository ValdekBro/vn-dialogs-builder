import { applyPatches } from "immer";
import { describe, expect, it } from "vitest";
import {
  addBlock,
  createCharacter,
  defineCommand,
  deleteBlocks,
  InvariantError,
  updateProject,
  type ChangeEvent,
  type Project,
} from "../src";
import { setup, setupMorning, TEXT } from "./helpers";

describe("ProjectEditor history", () => {
  it("undo and redo restore exact states", () => {
    const { editor, sceneId, authorId } = setup();
    const s0 = editor.project;
    editor.run(addBlock, { sceneId, characterId: authorId, lines: [{ text: TEXT.knock }] });
    const s1 = editor.project;
    editor.run(addBlock, { sceneId, characterId: authorId, lines: [{ text: TEXT.benIntro }] });
    const s2 = editor.project;

    expect(editor.undoLabel).toBe("Додати блок");
    expect(editor.undo()?.label).toBe("Додати блок");
    expect(editor.project).toEqual(s1);
    editor.undo();
    expect(editor.project).toEqual(s0);
    expect(editor.undo()).toBeNull();
    editor.redo();
    editor.redo();
    expect(editor.project).toEqual(s2);
    expect(editor.redo()).toBeNull();
  });

  it("a new command clears the redo stack", () => {
    const { editor } = setup();
    editor.run(updateProject, { name: "Літо в Заліссі" });
    editor.undo();
    expect(editor.canRedo).toBe(true);
    editor.run(updateProject, { name: "Осінь у Заліссі" });
    expect(editor.canRedo).toBe(false);
  });

  it("deletion is undone together with link cleanup", () => {
    const { editor, ids } = setupMorning();
    const before = editor.project;
    editor.run(deleteBlocks, { blockIds: [ids.well] });
    editor.undo();
    expect(editor.project).toEqual(before);
  });

  it("no-op commands do not create history entries", () => {
    const { editor } = setup();
    editor.run(updateProject, { name: editor.project.name });
    expect(editor.canUndo).toBe(false);
  });

  it("failed commands leave state and history untouched", () => {
    const { editor, sceneId } = setup();
    const before = editor.project;
    expect(() => editor.run(addBlock, { sceneId, characterId: "chr_zzzzzzzzzz", lines: [{ text: TEXT.well }] })).toThrow();
    expect(editor.project).toBe(before);
    expect(editor.canUndo).toBe(false);
  });

  it("guards against commands that break invariants", () => {
    const { editor } = setup();
    const broken = defineCommand({
      name: "broken",
      label: () => "broken",
      run(draft: Project) {
        draft.characterOrder.push("chr_zzzzzzzzzz");
      },
    });
    const before = editor.project;
    expect(() => editor.run(broken, undefined)).toThrow(InvariantError);
    expect(editor.project).toBe(before);
  });

  it("emits patches that reproduce the new state, tagged by source", () => {
    const { editor, sceneId, authorId } = setup();
    const events: ChangeEvent[] = [];
    editor.subscribe((e) => events.push(e));
    let mirror = editor.project;

    editor.run(createCharacter, { name: "Мельник" }, "agent");
    mirror = applyPatches(mirror, events.at(-1)!.patches);
    editor.run(addBlock, { sceneId, characterId: authorId, lines: [{ text: TEXT.well }] });
    mirror = applyPatches(mirror, events.at(-1)!.patches);
    editor.undo();
    mirror = applyPatches(mirror, events.at(-1)!.patches);
    expect(mirror).toEqual(editor.project);

    expect(events.map((e) => [e.type, e.entry?.source])).toEqual([
      ["execute", "agent"],
      ["execute", "user"],
      ["undo", "user"],
    ]);
  });

  it("reset replaces the project and clears history", () => {
    const { editor } = setup();
    editor.run(updateProject, { name: "Літо в Заліссі" });
    const other = { ...editor.project, name: "Зима в Заліссі" };
    editor.reset(other);
    expect(editor.project).toBe(other);
    expect(editor.canUndo).toBe(false);
  });

  it("respects the history limit", () => {
    const { editor } = setup();
    const limited = new (editor.constructor as typeof import("../src").ProjectEditor)(editor.project, { historyLimit: 2 });
    for (const name of ["a", "b", "c"]) limited.run(updateProject, { name });
    limited.undo();
    limited.undo();
    expect(limited.canUndo).toBe(false);
    expect(limited.project.name).toBe("a");
  });
});
