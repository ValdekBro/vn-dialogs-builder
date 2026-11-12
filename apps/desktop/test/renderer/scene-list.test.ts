import { addTree, createProject, createScene, ProjectEditor, sequentialIds } from "@vn/core";
import { describe, expect, it } from "vitest";
import { reorderedScenes, sceneDeleteImpact } from "../../src/renderer/src/views/scene-list";

/** The scene list (FLOWS.md, 11): drag-and-drop order and what deleting a scene affects. */

describe("reorderedScenes", () => {
  const order = ["scn_ranok", "scn_krynytsia", "scn_mlyn"];

  it("puts the dragged scene above or below the target", () => {
    expect(reorderedScenes(order, "scn_mlyn", "scn_ranok", false)).toEqual(["scn_mlyn", "scn_ranok", "scn_krynytsia"]);
    expect(reorderedScenes(order, "scn_ranok", "scn_mlyn", true)).toEqual(["scn_krynytsia", "scn_mlyn", "scn_ranok"]);
    expect(reorderedScenes(order, "scn_ranok", "scn_krynytsia", true)).toEqual(["scn_krynytsia", "scn_ranok", "scn_mlyn"]);
  });

  it("returns null when nothing changes", () => {
    expect(reorderedScenes(order, "scn_ranok", "scn_ranok", true)).toBeNull();
    expect(reorderedScenes(order, "scn_ranok", "scn_krynytsia", false)).toBeNull(); // already right above it
    expect(reorderedScenes(order, "scn_gone", "scn_mlyn", false)).toBeNull();
  });
});

describe("sceneDeleteImpact", () => {
  it("counts the scene's blocks and jumps into it from other scenes", () => {
    const newId = sequentialIds();
    const editor = new ProjectEditor(createProject({ name: "Ранок у селі", appVersion: "0", newId }), { newId });
    const morning = editor.project.sceneOrder[0]!;
    const { sceneId: well } = editor.run(createScene, { name: "Біля криниці" });
    editor.run(addTree, {
      sceneId: well,
      root: { character: "Автор", text: "[Біля криниці вже чекає черга]", next: { end: true } },
    });
    editor.run(addTree, {
      sceneId: morning,
      root: {
        character: "Автор",
        lines: [
          { text: "Піти до криниці стежкою повз млин", next: { scene: well } },
          { text: "Піти навпростець через поле", next: { scene: well } },
        ],
      },
    });
    expect(sceneDeleteImpact(editor.project, well)).toEqual({ blocks: 1, jumpsIn: 2 });
    expect(sceneDeleteImpact(editor.project, morning)).toEqual({ blocks: 1, jumpsIn: 0 });
  });
});
