import { describe, expect, it } from "vitest";
import { moveBlocks, parseProjectFile, resetLayout, serializeProject, toExport } from "../src";
import { block, setupMorning } from "./helpers";

describe("manual block positions", () => {
  it("moves blocks in one undoable step and rounds coordinates", () => {
    const { editor, ids } = setupMorning();
    editor.run(moveBlocks, {
      moves: [
        { blockId: ids.ben, pos: { x: 412.6, y: 380.2 } },
        { blockId: ids.well, pos: { x: 900, y: 380 } },
      ],
    });
    expect(block(editor.project, ids.ben).pos).toEqual({ x: 413, y: 380 });
    expect(block(editor.project, ids.well).pos).toEqual({ x: 900, y: 380 });
    editor.undo();
    expect(block(editor.project, ids.ben).pos).toBeUndefined();
    expect(block(editor.project, ids.well).pos).toBeUndefined();
  });

  it("null returns a block to auto layout; resetLayout clears the whole scene", () => {
    const { editor, sceneId, ids } = setupMorning();
    editor.run(moveBlocks, { moves: [{ blockId: ids.ben, pos: { x: 1, y: 2 } }, { blockId: ids.dad, pos: { x: 3, y: 4 } }] });
    editor.run(moveBlocks, { moves: [{ blockId: ids.ben, pos: null }] });
    expect(block(editor.project, ids.ben).pos).toBeUndefined();
    expect(block(editor.project, ids.dad).pos).toEqual({ x: 3, y: 4 });
    expect(editor.run(resetLayout, { sceneId })).toEqual({ reset: 1 });
    expect(block(editor.project, ids.dad).pos).toBeUndefined();
  });

  it("rejects non-finite coordinates and unknown blocks", () => {
    const { editor, ids } = setupMorning();
    expect(() => editor.run(moveBlocks, { moves: [{ blockId: ids.ben, pos: { x: Number.NaN, y: 0 } }] })).toThrow();
    expect(() => editor.run(moveBlocks, { moves: [{ blockId: "blk_zzzzzzzzzz", pos: { x: 0, y: 0 } }] })).toThrow();
  });

  it("survives save and load, but stays out of the export", () => {
    const { editor, ids } = setupMorning();
    editor.run(moveBlocks, { moves: [{ blockId: ids.ben, pos: { x: 640, y: 300 } }] });
    const loaded = parseProjectFile(serializeProject(editor.project)).project;
    expect(block(loaded, ids.ben).pos).toEqual({ x: 640, y: 300 });
    const exported = toExport(editor.project, { appVersion: "0" });
    const ben = exported.scenes[0]!.blocks.find((b) => b.id === ids.ben)!;
    expect(ben).not.toHaveProperty("pos");
  });
});
