import { describe, expect, it } from "vitest";
import {
  addBlock,
  addLine,
  canExport,
  countIssues,
  deleteCharacter,
  findBlocks,
  projectIssues,
  sceneOutline,
  setNext,
  updateScene,
} from "../src";
import { block, line, setup, setupMorning, TEXT } from "./helpers";

describe("issues", () => {
  it("a finished scene has no issues", () => {
    const { editor } = setupMorning();
    expect(projectIssues(editor.project)).toEqual([]);
    expect(canExport(editor.project)).toBe(true);
  });

  it("an empty scene has no issues", () => {
    const { editor } = setup();
    expect(projectIssues(editor.project)).toEqual([]);
  });

  it("detects each problem", () => {
    const { editor, sceneId, ids, benId, authorId } = setupMorning();
    editor.run(deleteCharacter, { characterId: benId }); // missing_character
    editor.run(addLine, { blockId: ids.answer, text: "" }); // empty_text + dangling_output (варіант)
    editor.run(addBlock, { sceneId, characterId: authorId, lines: [{ text: " " }] }); // unreachable + empty_text + dangling_output

    const codes = projectIssues(editor.project).map((i) => i.code).sort();
    expect(codes).toEqual(
      ["dangling_output", "dangling_output", "empty_text", "empty_text", "missing_character", "unreachable"].sort(),
    );
    expect(countIssues(projectIssues(editor.project))).toEqual({ errors: 6, warnings: 0 });
    expect(canExport(editor.project)).toBe(false);
  });

  it("line issues point at the line", () => {
    const { editor, ids } = setupMorning();
    const { lineId } = editor.run(addLine, { blockId: ids.answer, text: "" });
    const issues = projectIssues(editor.project).filter((i) => i.lineId === lineId);
    expect(issues.map((i) => i.message).sort()).toEqual(["Варіант нікуди не веде", "Порожній варіант"]);
  });

  it("missing_start without reporting every block as unreachable", () => {
    const { editor, sceneId } = setupMorning();
    editor.run(updateScene, { sceneId, startBlockId: null });
    expect(projectIssues(editor.project).map((i) => i.code)).toEqual(["missing_start"]);
  });

  it("issue messages are in Ukrainian", () => {
    const { editor, sceneId, authorId } = setup();
    editor.run(addBlock, { sceneId, characterId: authorId, lines: [{ text: TEXT.knock }] });
    expect(projectIssues(editor.project)[0]!.message).toBe("Репліка нікуди не веде");
  });
});

describe("outline", () => {
  it("renders the scene with a choice and convergence as a reference", () => {
    const { editor, sceneId, ids } = setupMorning();
    const [accept, decline] = block(editor.project, ids.answer).lines;
    editor.run(updateScene, { sceneId, name: "Ранок", description: "Татко будить ГГ, по дорозі до криниці вона зустрічає Бена." });
    expect(sceneOutline(editor.project, sceneId)).toBe(
      [
        `Сцена «Ранок» (${sceneId}), старт: ${ids.knock}, проблем: 0`,
        "Опис: Татко будить ГГ, по дорозі до криниці вона зустрічає Бена.",
        `[${ids.knock}] Автор: ${TEXT.knock}`,
        `[${ids.dad}] Татко: ${TEXT.dad}`,
        `[${ids.wake}] ГГ: ${TEXT.wake}`,
        `[${ids.benIntro}] Автор: ${TEXT.benIntro}`,
        `[${ids.ben}] Бен: ${TEXT.ben}`,
        `[${ids.answer}] ГГ, вибір:`,
        `  ◇ [${accept!.id}] «${TEXT.accept}»`,
        `    [${ids.well}] Автор: ${TEXT.well}`,
        "    ■ КІНЕЦЬ",
        `  ◇ [${decline!.id}] «${TEXT.decline}»`,
        `    ↪ ${ids.well}`,
        "",
      ].join("\n"),
    );
  });

  it("marks unconnected outputs and lists unreachable blocks", () => {
    const { editor, sceneId, ids } = setupMorning();
    editor.run(setNext, { from: { blockId: ids.well }, next: null });
    const { blockId } = editor.run(addBlock, {
      sceneId,
      characterId: null,
      lines: [{ text: "Відра повні.\nТепер назад, поки сонце не піднялося." }],
    });
    const out = sceneOutline(editor.project, sceneId);
    expect(out).toContain("⚠ НЕ ПІДКЛЮЧЕНО");
    expect(out).toContain(
      `Недосяжні:\n  [${blockId}] (без персонажа): Відра повні. ⏎ Тепер назад, поки сонце не піднялося.\n  ⚠ НЕ ПІДКЛЮЧЕНО`,
    );
    expect(line(editor.project, ids.well).next).toBeNull();
  });

  it("handles empty scenes", () => {
    const { editor, sceneId } = setup();
    expect(sceneOutline(editor.project, sceneId)).toContain("(порожня сцена)");
  });
});

describe("findBlocks", () => {
  it("searches line text case-insensitively, filters by character and choices", () => {
    const { editor, heroId } = setupMorning();
    expect(findBlocks(editor.project, { query: "ВІДРА" }).map((r) => r.block.lines[0]!.text)).toEqual([TEXT.dad, TEXT.ben]);
    expect(findBlocks(editor.project, { query: "сама впораюся" })).toHaveLength(1);
    expect(findBlocks(editor.project, { characterId: heroId })).toHaveLength(2);
    expect(findBlocks(editor.project, { choicesOnly: true })).toHaveLength(1);
    expect(findBlocks(editor.project, { limit: 1 })).toHaveLength(1);
  });
});

describe("linkTargets", () => {
  it("offers every block of the scene: convergence and cycles are allowed", async () => {
    const { linkTargets, setNext: sn } = await import("../src");
    const { editor, sceneId, ids } = setupMorning();
    const scene = () => editor.project.scenes[sceneId]!;
    const all = [ids.knock, ids.dad, ids.wake, ids.benIntro, ids.ben, ids.answer, ids.well];
    expect(linkTargets(scene(), ids.ben)).toEqual(all);
    // Цикл: з кінцевого блоку назад до Бена — дозволено, і модель це приймає.
    expect(linkTargets(scene(), ids.well)).toContain(ids.ben);
    editor.run(sn, { from: { blockId: ids.well }, next: { type: "block", blockId: ids.ben } });
    expect(editor.project.scenes[sceneId]!.blocks[ids.well]!.lines[0]!.next).toEqual({ type: "block", blockId: ids.ben });
  });
});
