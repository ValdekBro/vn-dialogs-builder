import { addBlock, addTree, createCharacter, createProject, createScene, ProjectEditor, sequentialIds, setNext, updateBlock } from "@vn/core";
import { beforeEach, describe, expect, it } from "vitest";
import { pick, readingDelayMs, startAt, step, type Entry, type Step } from "../../src/renderer/src/simulation/engine";
import { advance, choose, restartSimulation, startSimulation, useSim } from "../../src/renderer/src/simulation/sim-store";
import { useApp } from "../../src/renderer/src/store/app-store";

/** Dialogue playback (FLOWS.md, 17) on the «Ранок» scene: a chain, a choice with convergence, a jump to the next scene. */

const TEXT = {
  knock: "[Стук-стук у двері]",
  dad: "Ти вже прокинулася? Відра з водою порожні. Сходи по воду.",
  ben: "Привіт, ГГ! З самого ранку вже на ногах, хехе. Відра не надто важкі? Може, допомогти донести?",
  accept: "О, Бене, доброго ранку! Та ні, не надто важкі. Але якщо ти так хочеш допомогти, візьми одне відро.",
  decline: "Доброго ранку, Бене! Дякую, але я сама впораюся.",
  well: "[До криниці стежка йде повз старий млин]",
  wellScene: "[Біля криниці вже чекає черга]",
};

function morning() {
  const newId = sequentialIds();
  const editor = new ProjectEditor(createProject({ name: "Ранок у селі", appVersion: "0", newId }), { newId });
  const sceneId = editor.project.sceneOrder[0]!;
  for (const name of ["Татко", "ГГ", "Бен"]) editor.run(createCharacter, { name });
  const well = { id: editor.run(createScene, { name: "Біля криниці" }).sceneId };
  const author = editor.project.characterOrder[0]!;
  const wellStart = { id: editor.run(addBlock, { sceneId: well.id, characterId: author, lines: [{ text: TEXT.wellScene, next: { type: "end" } }] }).blockId };
  const { blockIds } = editor.run(addTree, {
    sceneId,
    root: {
      label: "knock",
      character: "Автор",
      text: TEXT.knock,
      next: {
        character: "Татко",
        text: TEXT.dad,
        next: {
          label: "ben",
          character: "Бен",
          text: TEXT.ben,
          next: {
            label: "answer",
            character: "ГГ",
            lines: [
              { text: TEXT.accept, next: { label: "path", character: "Автор", text: TEXT.well, next: { scene: well.id } } },
              { text: TEXT.decline, next: { ref: "path" } },
            ],
          },
        },
      },
    },
  });
  const ids = blockIds as Record<"knock" | "ben" | "answer" | "path", string>;
  return { editor, sceneId, wellId: well.id, wellStart, ids };
}

/** Plays steps until a choice, the end or a problem, like autoplay does. */
function play(project: ProjectEditor["project"], first: Step): Entry[] {
  const out: Entry[] = [...first.entries];
  let cursor = first.next;
  for (let i = 0; cursor && i < 50; i++) {
    const s = step(project, cursor);
    out.push(...s.entries);
    cursor = s.next;
  }
  return out;
}

const describeEntry = (e: Entry) =>
  e.kind === "line" || e.kind === "picked" ? `${e.kind}: ${e.text}` : e.kind === "choice" ? `choice: ${e.options.length}` : e.kind === "problem" ? `problem: ${e.code}` : e.kind === "scene" ? `scene: ${e.name}` : "end";

describe("playback engine", () => {
  it("plays the chain up to the choice, then the picked branch into the next scene and its end", () => {
    const { editor, sceneId } = morning();
    const p = editor.project;
    const first = play(p, startAt(p, sceneId));
    expect(first.map(describeEntry)).toEqual([`line: ${TEXT.knock}`, `line: ${TEXT.dad}`, `line: ${TEXT.ben}`, "choice: 2"]);

    const choice = first.at(-1) as Extract<Entry, { kind: "choice" }>;
    const rest = play(p, pick(p, choice, choice.options[1]!.lineId));
    expect(rest.map(describeEntry)).toEqual([
      `picked: ${TEXT.decline}`,
      `line: ${TEXT.well}`,
      "scene: Біля криниці",
      `line: ${TEXT.wellScene}`,
      "end",
    ]);
  });

  it("can start from any block", () => {
    const { editor, sceneId, ids } = morning();
    const entries = play(editor.project, startAt(editor.project, sceneId, ids.ben));
    expect(entries.map(describeEntry)).toEqual([`line: ${TEXT.ben}`, "choice: 2"]);
  });

  it("stops with a problem where the branch breaks", () => {
    const { editor, sceneId, ids, wellId, wellStart } = morning();
    // The path to the well is not connected yet.
    const path = editor.project.scenes[sceneId]!.blocks[ids.path]!;
    editor.run(setNext, { from: { blockId: path.id }, next: null });
    expect(play(editor.project, startAt(editor.project, sceneId, ids.path)).at(-1)).toMatchObject({
      kind: "problem",
      code: "dangling_output",
      blockId: ids.path,
    });

    // A block without a character and an option without text.
    editor.run(updateBlock, { blockId: ids.ben, characterId: null });
    expect(play(editor.project, startAt(editor.project, sceneId)).at(-1)).toMatchObject({ code: "missing_character", blockId: ids.ben });
    const answer = editor.project.scenes[sceneId]!.blocks[ids.answer]!;
    editor.run(updateBlock, { blockId: ids.answer, lines: [{ id: answer.lines[0]!.id, text: TEXT.accept }, { id: answer.lines[1]!.id, text: " " }] });
    expect(play(editor.project, startAt(editor.project, sceneId, ids.answer))).toEqual([
      expect.objectContaining({ kind: "problem", code: "empty_text", lineId: answer.lines[1]!.id }),
    ]);

    // A scene without a start block: playing it, and jumping into it.
    const { sceneId: mill } = editor.run(createScene, { name: "Млин" });
    expect(play(editor.project, startAt(editor.project, mill))).toEqual([
      expect.objectContaining({ kind: "problem", code: "missing_start", name: "Млин" }),
    ]);
    editor.run(setNext, { from: { blockId: wellStart.id }, next: { type: "scene", sceneId: mill } });
    expect(play(editor.project, startAt(editor.project, wellId)).at(-1)).toMatchObject({ code: "empty_target_scene", name: "Млин" });
  });

  it("pauses longer after longer lines", () => {
    const line = (text: string): Entry => ({ kind: "line", sceneId: "s", blockId: "b", lineId: "l", characterId: "c", text });
    expect(readingDelayMs(line("Так."))).toBe(1200);
    expect(readingDelayMs(line(TEXT.ben))).toBeGreaterThan(readingDelayMs(line(TEXT.dad)));
    expect(readingDelayMs(line("а".repeat(1000)))).toBe(8000);
  });
});

describe("playback store", () => {
  beforeEach(() => {
    useSim.setState({ origin: null, log: [], queue: [], cursor: null, waiting: null, finished: false, playing: true, speed: 1 });
  });

  it("shows one entry per advance, waits on the choice, and restarts from the same point", () => {
    const { editor, sceneId, ids } = morning();
    useApp.setState({ project: editor.project, sceneId, view: "builder" });

    startSimulation(sceneId, ids.ben);
    expect(useApp.getState().view).toBe("simulation");
    expect(useSim.getState().log.map(describeEntry)).toEqual([`line: ${TEXT.ben}`]);

    advance();
    expect(useSim.getState().waiting?.options).toHaveLength(2);
    advance(); // the choice waits for the player
    expect(useSim.getState().log).toHaveLength(2);

    choose(useSim.getState().waiting!.options[0]!.lineId);
    for (let i = 0; i < 5; i++) advance();
    const s = useSim.getState();
    expect(s.log.slice(2).map(describeEntry)).toEqual([`picked: ${TEXT.accept}`, `line: ${TEXT.well}`, "scene: Біля криниці", `line: ${TEXT.wellScene}`, "end"]);
    expect(s.finished).toBe(true);

    restartSimulation();
    expect(useSim.getState().log.map(describeEntry)).toEqual([`line: ${TEXT.ben}`]);
    expect(useSim.getState().finished).toBe(false);
  });
});
