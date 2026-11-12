import { describe, expect, it } from "vitest";
import {
  addBlock,
  addChain,
  addLine,
  addTree,
  copyBlocks,
  CoreError,
  createCharacter,
  createScene,
  deleteBlocks,
  deleteCharacter,
  deleteLine,
  deleteScene,
  duplicateScene,
  incomingOf,
  linesRemovedByUpdate,
  pasteBlocks,
  reorderLines,
  reorderScenes,
  setNext,
  updateBlock,
  updateCharacter,
  updateLine,
  updateProject,
  updateScene,
} from "../src";
import { block, line, scene, setup, setupMorning, TEXT } from "./helpers";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof CoreError) return e.code;
    throw e;
  }
  return "OK";
};

describe("project and characters", () => {
  it("updates project name and lore", () => {
    const { editor } = setup();
    const lore = "Невелике село біля лісу. ГГ живе з татком і щоранку ходить по воду до криниці.";
    editor.run(updateProject, { name: "Літо в Заліссі", description: lore });
    expect(editor.project).toMatchObject({ name: "Літо в Заліссі", description: lore });
    expect(code(() => editor.run(updateProject, { name: "  " }))).toBe("INVALID_ARGUMENT");
  });

  it("creates characters with auto colors and validates input", () => {
    const { editor } = setup();
    const a = editor.run(createCharacter, { name: "Татко" });
    const b = editor.run(createCharacter, { name: "Бен" });
    const p = editor.project;
    expect(p.characterOrder).toEqual([expect.any(String), a.characterId, b.characterId]);
    expect(p.characters[a.characterId]!.color).not.toBe(p.characters[b.characterId]!.color);
    expect(code(() => editor.run(createCharacter, { name: "Мельник", color: "red" }))).toBe("INVALID_ARGUMENT");
    editor.run(updateCharacter, { characterId: b.characterId, speechStyle: "Привітний, часто посміюється: «хехе».", color: "#16A34A" });
    expect(editor.project.characters[b.characterId]).toMatchObject({
      speechStyle: "Привітний, часто посміюється: «хехе».",
      color: "#16a34a",
    });
  });

  it("deleting a character keeps their blocks with an empty character", () => {
    const { editor, benId, ids } = setupMorning();
    const r = editor.run(deleteCharacter, { characterId: benId });
    expect(r.affectedBlockIds).toEqual([ids.ben]);
    expect(block(editor.project, ids.ben)).toMatchObject({ characterId: null, lines: [{ text: TEXT.ben }] });
    expect(editor.project.characterOrder).not.toContain(benId);
  });

  it("forbids deleting the author", () => {
    const { editor, authorId } = setup();
    expect(code(() => editor.run(deleteCharacter, { characterId: authorId }))).toBe("FORBIDDEN");
  });
});

describe("scenes", () => {
  it("creates, renames, reorders and deletes scenes", () => {
    const { editor, sceneId } = setup();
    const { sceneId: well } = editor.run(createScene, { name: "Біля криниці", description: "ГГ набирає воду, Бен поруч." });
    expect(editor.project.sceneOrder).toEqual([sceneId, well]);
    editor.run(reorderScenes, { sceneIds: [well, sceneId] });
    expect(editor.project.sceneOrder).toEqual([well, sceneId]);
    expect(code(() => editor.run(reorderScenes, { sceneIds: [well] }))).toBe("INVALID_ARGUMENT");
    editor.run(updateScene, { sceneId: well, name: "Криниця за млином" });
    expect(scene(editor.project, well).name).toBe("Криниця за млином");
    editor.run(deleteScene, { sceneId: well });
    expect(editor.project.scenes[well]).toBeUndefined();
  });

  it("start block must be in the scene", () => {
    const { editor, sceneId, ids } = setupMorning();
    editor.run(updateScene, { sceneId, startBlockId: ids.ben });
    expect(scene(editor.project, sceneId).startBlockId).toBe(ids.ben);
    const { sceneId: other } = editor.run(createScene, { name: "Біля криниці" });
    expect(code(() => editor.run(updateScene, { sceneId: other, startBlockId: ids.ben }))).toBe("INVALID_ARGUMENT");
  });

  it("duplicates a scene with fresh ids and remapped links", () => {
    const { editor, sceneId } = setupMorning();
    const { sceneId: copyId } = editor.run(duplicateScene, { sceneId });
    const original = scene(editor.project, sceneId);
    const copy = scene(editor.project, copyId);
    expect(copy.name).toBe("Сцена 1 (копія)");
    expect(Object.keys(copy.blocks)).toHaveLength(7);
    for (const id of Object.keys(copy.blocks)) expect(original.blocks[id]).toBeUndefined();
    const start = copy.blocks[copy.startBlockId!]!;
    expect(start.lines[0]!.text).toBe(TEXT.knock);
    const next = start.lines[0]!.next;
    expect(next?.type === "block" && next.blockId in copy.blocks).toBe(true);
  });
});

describe("addBlock", () => {
  it("first detached block becomes the start", () => {
    const { editor, sceneId, authorId } = setup();
    const { blockId } = editor.run(addBlock, { sceneId, characterId: authorId, lines: [{ text: TEXT.knock }] });
    expect(scene(editor.project, sceneId).startBlockId).toBe(blockId);
    const { blockId: second } = editor.run(addBlock, { sceneId, characterId: authorId, lines: [{ text: TEXT.benIntro }] });
    expect(scene(editor.project, sceneId).startBlockId).toBe(blockId);
    expect(block(editor.project, second).lines).toEqual([{ id: expect.any(String), text: TEXT.benIntro, next: null }]);
  });

  it("connects to an output; lineId may be omitted for single-line blocks", () => {
    const { editor, sceneId, ids, benId } = setupMorning();
    const decline = line(editor.project, ids.answer, 1).id;
    const r1 = editor.run(addBlock, {
      sceneId,
      characterId: benId,
      lines: [{ text: "Ну, як знаєш. Але якщо передумаєш — я біля млина, хехе." }],
      from: { blockId: ids.answer, lineId: decline },
    });
    expect(line(editor.project, ids.answer, 1).next).toEqual({ type: "block", blockId: r1.blockId });
    const r2 = editor.run(addBlock, { sceneId, characterId: benId, lines: [{ text: "Бувай, ГГ!" }], from: { blockId: r1.blockId } });
    expect(line(editor.project, r1.blockId).next).toEqual({ type: "block", blockId: r2.blockId });
  });

  it("inserts between an output and its previous next", () => {
    const { editor, sceneId, ids, heroId } = setupMorning();
    const { blockId } = editor.run(addBlock, {
      sceneId,
      characterId: heroId,
      lines: [{ text: "Ну от, знову я заспала…" }, { text: "Ще п'ять хвилиночок!" }],
      from: { blockId: ids.knock },
      insert: true,
    });
    expect(line(editor.project, ids.knock).next).toEqual({ type: "block", blockId });
    expect(block(editor.project, blockId).lines.map((l) => l.next)).toEqual([{ type: "block", blockId: ids.dad }, null]);
  });

  it("creates several lines (a choice) up front", () => {
    const { editor, sceneId, authorId } = setup();
    const { blockId, lineIds } = editor.run(addBlock, {
      sceneId,
      characterId: authorId,
      lines: [{ text: "Піти стежкою повз млин" }, { text: "Піти через ліс", next: { type: "end" } }],
    });
    expect(lineIds).toHaveLength(2);
    expect(block(editor.project, blockId).lines.map((l) => [l.text, l.next])).toEqual([
      ["Піти стежкою повз млин", null],
      ["Піти через ліс", { type: "end" }],
    ]);
  });

  it("rejects bad arguments", () => {
    const { editor, sceneId, authorId, ids } = setupMorning();
    const run = (args: Partial<Parameters<typeof addBlock.run>[1]>) =>
      code(() => editor.run(addBlock, { sceneId, characterId: authorId, lines: [{ text: TEXT.well }], ...args }));
    expect(run({ lines: [] })).toBe("INVALID_ARGUMENT");
    expect(run({ insert: true })).toBe("INVALID_ARGUMENT");
    expect(run({ from: { blockId: ids.knock }, insert: true, lines: [{ text: TEXT.well, next: { type: "end" } }] })).toBe(
      "INVALID_ARGUMENT",
    );
    expect(run({ characterId: "chr_zzzzzzzzzz" })).toBe("NOT_FOUND");
    expect(run({ from: { blockId: ids.answer } })).toBe("INVALID_ARGUMENT"); // several lines and no lineId
    expect(run({ lines: [{ text: TEXT.well, next: { type: "block", blockId: "blk_zzzzzzzzzz" } }] })).toBe("NOT_FOUND");
    const { sceneId: other } = editor.run(createScene, { name: "Біля криниці" });
    expect(run({ sceneId: other, from: { blockId: ids.knock } })).toBe("CROSS_SCENE");
    expect(run({ sceneId: other, lines: [{ text: TEXT.well, next: { type: "block", blockId: ids.knock } }] })).toBe(
      "CROSS_SCENE",
    );
  });
});

describe("updateBlock", () => {
  it("edits character", () => {
    const { editor, ids, dadId } = setupMorning();
    editor.run(updateBlock, { blockId: ids.knock, characterId: dadId });
    expect(block(editor.project, ids.knock).characterId).toBe(dadId);
  });

  it("replaces the full line list: update, create, remove", () => {
    const { editor, ids } = setupMorning();
    const [accept, decline] = block(editor.project, ids.answer).lines;
    const tease = "Хіба що понесеш обидва, хехе!";
    const args = {
      blockId: ids.answer,
      lines: [{ id: decline!.id, text: "Дякую, Бене, але я сама." }, { text: tease, next: { type: "end" as const } }],
    };
    expect(linesRemovedByUpdate(editor.project, args)).toEqual([accept!.id]);
    const r = editor.run(updateBlock, args);
    expect(r.removedLineIds).toEqual([accept!.id]);
    const b = block(editor.project, ids.answer);
    expect(b.lines.map((l) => l.text)).toEqual(["Дякую, Бене, але я сама.", tease]);
    expect(b.lines[0]!.id).toBe(decline!.id);
    expect(b.lines[0]!.next).toEqual({ type: "block", blockId: ids.well }); // next not passed — kept
    expect(b.lines[1]!.next).toEqual({ type: "end" });
  });

  it("turns a single line into a choice by adding lines", () => {
    const { editor, ids } = setupMorning();
    const only = line(editor.project, ids.wake);
    editor.run(updateBlock, {
      blockId: ids.wake,
      lines: [{ id: only.id, text: only.text }, { text: "Ще п'ять хвилиночок, татку…" }],
    });
    expect(block(editor.project, ids.wake).lines.map((l) => l.next)).toEqual([only.next, null]);
  });

  it("keeps at least one line and validates ids", () => {
    const { editor, ids } = setupMorning();
    expect(code(() => editor.run(updateBlock, { blockId: ids.knock, lines: [] }))).toBe("INVALID_ARGUMENT");
    expect(code(() => editor.run(updateBlock, { blockId: ids.knock, lines: [{ id: "ln_zzzzzzzzzz", text: TEXT.knock }] }))).toBe(
      "NOT_FOUND",
    );
  });
});

describe("deleteBlocks", () => {
  it("clears incoming links and reports dangling outputs", () => {
    const { editor, sceneId, ids } = setupMorning();
    const r = editor.run(deleteBlocks, { blockIds: [ids.well] });
    expect(r.deletedIds).toEqual([ids.well]);
    expect(r.danglingOutputs).toHaveLength(2);
    expect(block(editor.project, ids.answer).lines.map((l) => l.next)).toEqual([null, null]);
    expect(scene(editor.project, sceneId).startBlockId).toBe(ids.knock);
  });

  it("clears the start when the start block is deleted", () => {
    const { editor, sceneId, ids } = setupMorning();
    editor.run(deleteBlocks, { blockIds: [ids.knock, ids.dad] });
    expect(scene(editor.project, sceneId).startBlockId).toBeNull();
    expect(Object.keys(scene(editor.project, sceneId).blocks)).toHaveLength(5);
  });

  it("is all-or-nothing", () => {
    const { editor, ids } = setupMorning();
    const before = editor.project;
    expect(code(() => editor.run(deleteBlocks, { blockIds: [ids.well, "blk_zzzzzzzzzz"] }))).toBe("NOT_FOUND");
    expect(editor.project).toBe(before);
    expect(code(() => editor.run(deleteBlocks, { blockIds: [] }))).toBe("INVALID_ARGUMENT");
  });
});

describe("lines and links", () => {
  it("adds, edits, reorders and deletes lines", () => {
    const { editor, ids } = setupMorning();
    const { lineId } = editor.run(addLine, { blockId: ids.answer, text: "Бене, ти що, знову на полювання зібрався?", index: 0 });
    expect(line(editor.project, ids.answer, 0).id).toBe(lineId);
    editor.run(updateLine, { lineId, text: "Бене, а ти куди так рано?" });
    const order = block(editor.project, ids.answer).lines.map((l) => l.id).reverse();
    editor.run(reorderLines, { blockId: ids.answer, lineIds: order });
    expect(block(editor.project, ids.answer).lines.map((l) => l.id)).toEqual(order);
    expect(block(editor.project, ids.answer).lines.at(-1)!.text).toBe("Бене, а ти куди так рано?");
    editor.run(deleteLine, { lineId });
    expect(block(editor.project, ids.answer).lines.map((l) => l.text)).toEqual([TEXT.decline, TEXT.accept]);
  });

  it("never deletes the last line of a block", () => {
    const { editor, ids } = setupMorning();
    expect(code(() => editor.run(deleteLine, { lineId: line(editor.project, ids.knock).id }))).toBe("INVALID_ARGUMENT");
  });

  it("setNext links, unlinks and ends", () => {
    const { editor, sceneId, ids, authorId } = setupMorning();
    editor.run(setNext, { from: { blockId: ids.well }, next: { type: "block", blockId: ids.knock } });
    expect(incomingOf(scene(editor.project, sceneId), ids.knock)).toEqual([
      { blockId: ids.well, lineId: line(editor.project, ids.well).id },
    ]);
    editor.run(setNext, { from: { blockId: ids.well }, next: null });
    expect(line(editor.project, ids.well).next).toBeNull();
    const { sceneId: other } = editor.run(createScene, { name: "Біля криниці" });
    const { blockId } = editor.run(addBlock, { sceneId: other, characterId: authorId, lines: [{ text: "[Скрип коловорота]" }] });
    expect(code(() => editor.run(setNext, { from: { blockId: ids.well }, next: { type: "block", blockId } }))).toBe(
      "CROSS_SCENE",
    );
  });
});

describe("batch commands", () => {
  it("addTree builds the morning scene with convergence via labels", () => {
    const { editor, sceneId, ids, rootBlockId } = setupMorning();
    const s = scene(editor.project, sceneId);
    expect(s.startBlockId).toBe(rootBlockId);
    expect(rootBlockId).toBe(ids.knock);
    expect(incomingOf(s, ids.well)).toHaveLength(2);
    expect(block(editor.project, ids.answer).lines.map((l) => l.text)).toEqual([TEXT.accept, TEXT.decline]);
    expect(line(editor.project, ids.well).next).toEqual({ type: "end" });
  });

  it("addTree validates labels and node shape atomically", () => {
    const { editor, sceneId } = setup();
    const before = editor.project;
    const bad = (root: object) => code(() => editor.run(addTree, { sceneId, root: root as never }));
    expect(bad({ character: "Автор", text: TEXT.knock, next: { ref: "nope" } })).toBe("INVALID_ARGUMENT");
    expect(
      bad({ label: "x", character: "Автор", text: TEXT.knock, next: { label: "x", character: "Автор", text: TEXT.benIntro } }),
    ).toBe("INVALID_ARGUMENT");
    expect(bad({ character: "Автор", text: TEXT.knock, lines: [{ text: TEXT.well }] })).toBe("INVALID_ARGUMENT");
    expect(bad({ character: "Автор", lines: [] })).toBe("INVALID_ARGUMENT");
    expect(bad({ character: "Автор" })).toBe("INVALID_ARGUMENT");
    expect(bad({ character: "Мельник", text: "Добридень, ГГ!" })).toBe("INVALID_ARGUMENT");
    expect(editor.project).toBe(before);
  });

  it("addTree insert passes the old next to unspecified outputs", () => {
    const { editor, sceneId, ids } = setupMorning();
    const r = editor.run(addTree, {
      sceneId,
      from: { blockId: ids.knock },
      insert: true,
      root: { character: "ГГ", lines: [{ text: "Уже встаю!" }, { text: "Зробити вигляд, що спиш", next: { end: true } }] },
    });
    expect(block(editor.project, r.rootBlockId).lines.map((l) => l.next)).toEqual([
      { type: "block", blockId: ids.dad },
      { type: "end" },
    ]);
    expect(line(editor.project, ids.knock).next).toEqual({ type: "block", blockId: r.rootBlockId });
  });

  it("addChain creates a linked chain and resolves characters by name", () => {
    const { editor, sceneId, ids, benId } = setupMorning();
    const { blockIds } = editor.run(addChain, {
      sceneId,
      from: { blockId: ids.well },
      lines: [
        { character: "Бен", text: "Ого, яка черга біля криниці. Пропустиш мене, ГГ?" },
        { character: benId, text: "Жартую, жартую, хехе." },
      ],
      end: { type: "end" },
    });
    expect(blockIds).toHaveLength(2);
    expect(line(editor.project, ids.well).next).toEqual({ type: "block", blockId: blockIds[0] });
    expect(block(editor.project, blockIds[0]!)).toMatchObject({ characterId: benId, lines: [{ next: { type: "block", blockId: blockIds[1] } }] });
    expect(line(editor.project, blockIds[1]!).next).toEqual({ type: "end" });
  });

  it("ambiguous character names are rejected with candidates", () => {
    const { editor, sceneId } = setup();
    editor.run(createCharacter, { name: "Бен" });
    editor.run(createCharacter, { name: "Бен" });
    try {
      editor.run(addChain, { sceneId, lines: [{ character: "Бен", text: TEXT.ben }] });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CoreError);
      expect((e as CoreError).details).toMatchObject({ candidates: [{}, {}] });
    }
  });
});

describe("clipboard", () => {
  it("pastes a copy as a detached branch with fresh ids", () => {
    const { editor, sceneId, ids } = setupMorning();
    const clip = copyBlocks(editor.project, [ids.answer, ids.well]);
    const r = editor.run(pasteBlocks, { sceneId, clipboard: clip });
    expect(r.blockIds).toHaveLength(2);
    expect(r.rootBlockIds).toHaveLength(1);
    const root = block(editor.project, r.rootBlockIds[0]!);
    expect(root.lines.map((l) => l.text)).toEqual([TEXT.accept, TEXT.decline]);
    expect(root.lines.every((l) => l.next?.type === "block" && r.blockIds.includes(l.next.blockId))).toBe(true);
    expect(incomingOf(scene(editor.project, sceneId), root.id)).toEqual([]);
  });

  it("links to blocks outside the copy survive in the same scene and drop elsewhere", () => {
    const { editor, sceneId, ids } = setupMorning();
    const clip = copyBlocks(editor.project, [ids.knock]);
    const same = editor.run(pasteBlocks, { sceneId, clipboard: clip });
    expect(line(editor.project, same.blockIds[0]!).next).toEqual({ type: "block", blockId: ids.dad });
    const { sceneId: other } = editor.run(createScene, { name: "Біля криниці" });
    const there = editor.run(pasteBlocks, { sceneId: other, clipboard: clip });
    expect(line(editor.project, there.blockIds[0]!).next).toBeNull();
    expect(scene(editor.project, other).startBlockId).toBe(there.blockIds[0]);
  });
});

describe("scene transitions", () => {
  it("a line can lead to the start of another scene; outline and issues show it", async () => {
    const { editor, sceneId, ids, authorId } = setupMorning();
    const { sceneId: well } = editor.run(createScene, { name: "Біля криниці" });
    editor.run(setNext, { from: { blockId: ids.well }, next: { type: "scene", sceneId: well } });
    expect(line(editor.project, ids.well).next).toEqual({ type: "scene", sceneId: well });

    const { projectIssues, sceneOutline } = await import("../src");
    // An empty target scene is an error: the jump leads nowhere.
    expect(projectIssues(editor.project).map((i) => [i.code, i.message])).toEqual([
      ["empty_target_scene", "Сцена «Біля криниці» ще порожня або без стартового блоку"],
    ]);
    editor.run(addBlock, { sceneId: well, characterId: authorId, lines: [{ text: "[Скрип коловорота]", next: { type: "end" } }] });
    expect(projectIssues(editor.project)).toEqual([]);
    expect(sceneOutline(editor.project, sceneId)).toContain(`→ СЦЕНА «Біля криниці» (${well})`);
  });

  it("rejects transitions to a missing scene or the same scene", () => {
    const { editor, sceneId, ids } = setupMorning();
    expect(code(() => editor.run(setNext, { from: { blockId: ids.well }, next: { type: "scene", sceneId: "scn_zzzzzzzzzz" } }))).toBe(
      "NOT_FOUND",
    );
    expect(code(() => editor.run(setNext, { from: { blockId: ids.well }, next: { type: "scene", sceneId } }))).toBe(
      "INVALID_ARGUMENT",
    );
  });

  it("deleting a scene disconnects transitions into it", () => {
    const { editor, ids } = setupMorning();
    const { sceneId: well } = editor.run(createScene, { name: "Біля криниці" });
    editor.run(setNext, { from: { blockId: ids.well }, next: { type: "scene", sceneId: well } });
    const r = editor.run(deleteScene, { sceneId: well });
    expect(r.danglingOutputs).toEqual([{ blockId: ids.well, lineId: line(editor.project, ids.well).id }]);
    expect(line(editor.project, ids.well).next).toBeNull();
  });

  it("addTree accepts { scene } targets and duplicates keep transitions", () => {
    const { editor, sceneId } = setup();
    const { sceneId: well } = editor.run(createScene, { name: "Біля криниці" });
    const r = editor.run(addTree, { sceneId, root: { character: "Автор", text: TEXT.knock, next: { scene: well } } });
    expect(line(editor.project, r.rootBlockId).next).toEqual({ type: "scene", sceneId: well });
    const { sceneId: copy } = editor.run(duplicateScene, { sceneId });
    const copied = Object.values(scene(editor.project, copy).blocks)[0]!;
    expect(copied.lines[0]!.next).toEqual({ type: "scene", sceneId: well });
  });
});
