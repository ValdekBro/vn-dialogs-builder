import { addBlock, addTree, createCharacter, createProject, ProjectEditor, sequentialIds, setNext, type Scene } from "@vn/core";
import { describe, expect, it } from "vitest";
import { projectScene, type ProjNode } from "../src/renderer/src/canvas/projection";

function prologue() {
  const newId = sequentialIds();
  const editor = new ProjectEditor(createProject({ name: "Ранок у селі", appVersion: "0", newId }), { newId });
  const sceneId = editor.project.sceneOrder[0]!;
  editor.run(createCharacter, { name: "ГГ" });
  editor.run(createCharacter, { name: "Бен" });
  const { blockIds } = editor.run(addTree, {
    sceneId,
    root: {
      label: "a",
      character: "Бен",
      text: "Привіт, ГГ! З самого ранку вже на ногах, хехе. Відра не надто важкі? Може, допомогти донести?",
      next: {
        label: "ask",
        character: "ГГ",
        lines: [
          {
            text: "О, Бене, доброго ранку! Візьми одне відро.",
            next: { label: "bell", character: "Автор", text: "[До криниці стежка йде повз старий млин]", next: { end: true } },
          },
          { text: "Дякую, але я сама впораюся.", next: { ref: "bell" } },
          { text: "А ти чого так рано? Знову на полювання?" },
        ],
      },
    },
  });
  const ids = blockIds as Record<"a" | "ask" | "bell", string>;
  const scene = () => editor.project.scenes[sceneId]!;
  return { editor, sceneId, ids, scene };
}

const kinds = (nodes: ProjNode[]) => nodes.map((n) => `${n.kind}:${n.id}`);

describe("projectScene", () => {
  it("shows an empty scene as the add-first button, or the draft", () => {
    const empty: Scene = { id: "scn_0000000001", name: "Біля криниці", description: "", startBlockId: null, blocks: {} };
    expect(kinds(projectScene(empty).nodes)).toEqual(["empty:empty"]);
    expect(kinds(projectScene(empty, {}).nodes)).toEqual(["draft:draft"]);
  });

  it("draws each block once, convergence as an ordinary line, open outputs as stubs, ends as markers", () => {
    const { scene, ids } = prologue();
    const { nodes, edges } = projectScene(scene());
    const [yes, no, maybe] = scene().blocks[ids.ask]!.lines;
    const out = (blockId: string) => scene().blocks[blockId]!.lines[0]!.id;

    expect(nodes.filter((n) => n.kind === "block").map((n) => n.id)).toEqual([ids.a, ids.ask, ids.bell]);
    expect(nodes.find((n) => n.id === ids.a)).toMatchObject({ isStart: true, reachable: true });
    const bellKey = `${ids.bell}:${out(ids.bell)}`;
    expect(nodes).toContainEqual({ kind: "stub", id: `end:${bellKey}`, output: { blockId: ids.bell, lineId: out(ids.bell) }, state: "end" });
    expect(nodes.some((n) => (n.kind as string) === "ref")).toBe(false);
    expect(nodes).toContainEqual({
      kind: "stub",
      id: `stub:${ids.ask}:${maybe!.id}`,
      output: { blockId: ids.ask, lineId: maybe!.id },
      state: "open",
    });
    expect(edges.map((e) => [e.source, e.sourceHandle, e.target, e.kind])).toEqual([
      [ids.a, out(ids.a), ids.ask, "link"],
      [ids.ask, yes!.id, ids.bell, "link"],
      [ids.bell, out(ids.bell), `end:${bellKey}`, "end"],
      [ids.ask, no!.id, ids.bell, "link"],
      [ids.ask, maybe!.id, `stub:${ids.ask}:${maybe!.id}`, "stub"],
    ]);
  });

  it("puts unreachable blocks into their own trees, rooted where nothing leads in", () => {
    const { editor, sceneId, scene, ids } = prologue();
    const authorId = editor.project.characterOrder[0]!;
    const { blockId: orphan } = editor.run(addBlock, { sceneId, characterId: authorId, lines: [{ text: "[Десь далеко гавкає собака]" }] });
    const { blockId: child } = editor.run(addBlock, { sceneId, characterId: authorId, lines: [{ text: "[Татко гукає з подвір'я]" }], from: { blockId: orphan } });
    const { nodes } = projectScene(scene());
    const blocks = nodes.filter((n) => n.kind === "block");
    expect(blocks.map((n) => n.id)).toEqual([ids.a, ids.ask, ids.bell, orphan, child]);
    expect(blocks.slice(3).every((n) => n.kind === "block" && !n.reachable)).toBe(true);
  });

  it("handles cycles without looping forever", () => {
    const { editor, scene, ids } = prologue();
    editor.run(setNext, { from: { blockId: ids.bell }, next: { type: "block", blockId: ids.a } });
    const { nodes } = projectScene(scene());
    expect(nodes.filter((n) => n.kind === "block")).toHaveLength(3);
    const { edges } = projectScene(scene());
    expect(edges).toContainEqual(expect.objectContaining({ source: ids.bell, target: ids.a, kind: "link" }));
  });

  it("places a draft on an open output instead of its stub", () => {
    const { scene, ids } = prologue();
    const maybe = scene().blocks[ids.ask]!.lines[2];
    const from = { blockId: ids.ask, lineId: maybe!.id };
    const { nodes, edges } = projectScene(scene(), { from });
    expect(nodes.some((n) => n.id === `stub:${ids.ask}:${maybe!.id}`)).toBe(false);
    expect(edges).toContainEqual(expect.objectContaining({ source: ids.ask, sourceHandle: maybe!.id, target: "draft" }));
  });

  it("inserting a draft keeps the old continuation after it", () => {
    const { scene, ids } = prologue();
    const a = scene().blocks[ids.a]!.lines[0]!;
    const { edges } = projectScene(scene(), { from: { blockId: ids.a, lineId: a.id }, insert: true });
    expect(edges.slice(0, 2).map((e) => [e.source, e.target])).toEqual([
      [ids.a, "draft"],
      ["draft", ids.ask],
    ]);
  });
});

describe("scene transitions on the canvas", () => {
  it("shows a transition to another scene as its own link node at the end of the output", async () => {
    const { createScene } = await import("@vn/core");
    const { editor, scene, ids } = prologue();
    const { sceneId: well } = editor.run(createScene, { name: "Біля криниці" });
    editor.run(setNext, { from: { blockId: ids.bell }, next: { type: "scene", sceneId: well } });
    const { nodes, edges } = projectScene(scene());
    const out = scene().blocks[ids.bell]!.lines[0]!;
    const id = `scene:${ids.bell}:${out.id}`;
    expect(nodes).toContainEqual({ kind: "scene", id, output: { blockId: ids.bell, lineId: out.id }, sceneId: well });
    expect(edges).toContainEqual(expect.objectContaining({ source: ids.bell, target: id, kind: "end" }));
  });
});

describe("manual positions", () => {
  it("a moved block stays where it was put, its stub and end marker move with it, other blocks do not", async () => {
    const { applyPinned } = await import("../src/renderer/src/canvas/layout");
    const { scene, ids } = prologue();
    const projection = projectScene(scene());
    const auto = new Map(projection.nodes.map((n, i) => [n.id, { x: i * 300, y: 0 }]));
    const ask = projection.nodes.find((n) => n.id === ids.ask)!;
    const askAuto = auto.get(ask.id)!;
    const pinned = new Map([[ids.ask, { x: askAuto.x + 40, y: 500 }]]);
    const out = applyPinned(projection, auto, pinned);

    expect(out.get(ids.ask)).toEqual({ x: askAuto.x + 40, y: 500 });
    // Відкритий вихід «А ти чого так рано?» — (+) — їде разом із блоком вибору.
    const stub = projection.nodes.find((n) => n.kind === "stub" && n.id.startsWith(`stub:${ids.ask}`))!;
    expect(out.get(stub.id)).toEqual({ x: auto.get(stub.id)!.x + 40, y: 500 });
    // Блок, у який веде вибір, — окремий блок, він не рухається.
    expect(out.get(ids.bell)).toEqual(auto.get(ids.bell));
    expect(out.get(ids.a)).toEqual(auto.get(ids.a));
  });
});
