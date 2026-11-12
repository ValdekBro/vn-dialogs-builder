import { addTree, createCharacter, createProject, createScene, ProjectEditor, randomId, updateProject, updateScene, type Project } from "@vn/core";

/**
 * Ready-made projects a test can put into the data folder before launch (TESTING.md, section 3).
 * Built with the core commands, so they are always valid in the current storage format.
 * Texts are realistic dialogue (the «Ранок» scene: Татко, ГГ, Бен), not placeholders.
 */

/**
 * «Ранок у селі»: scene «Ранок» — the Author, Татко, then ГГ's choice.
 * Option 1 jumps to «Біля криниці», which ends the story; option 2 is not connected yet (one error).
 */
export function prologue(): Project {
  const editor = new ProjectEditor(createProject({ name: "Ранок у селі", appVersion: "0.0.0", newId: randomId }));
  const morning = editor.project.sceneOrder[0]!;
  editor.run(updateScene, { sceneId: morning, name: "Ранок" });
  editor.run(updateProject, { description: "Невелике село над річкою. Літо перед від'їздом ГГ до міста." });
  for (const name of ["Татко", "ГГ", "Бен"]) editor.run(createCharacter, { name });
  const { sceneId: well } = editor.run(createScene, { name: "Біля криниці" });
  editor.run(addTree, {
    sceneId: well,
    root: {
      character: "Бен",
      text: "Привіт, ГГ! Може, допомогти донести?",
      next: { character: "ГГ", text: "Дякую, Бене. Відро сьогодні як камінь.", next: { end: true } },
    },
  });
  editor.run(addTree, {
    sceneId: morning,
    root: {
      character: "Автор",
      text: "[Ранок. Татко вже порається біля хати]",
      next: {
        character: "Татко",
        text: "Вставай, ГГ, сонце вже високо! Збігай по воду.",
        next: {
          character: "ГГ",
          lines: [
            { text: "Уже біжу, тату!", next: { scene: well } },
            { text: "Ще п'ять хвилин…" },
          ],
        },
      },
    },
  });
  return editor.project;
}

/** A clean project with no errors: «Останній трамвай», one scene that ends the story. */
export function lastTram(): Project {
  const editor = new ProjectEditor(createProject({ name: "Останній трамвай", appVersion: "0.0.0", newId: randomId }));
  const scene = editor.project.sceneOrder[0]!;
  editor.run(createCharacter, { name: "Кондукторка" });
  editor.run(addTree, {
    sceneId: scene,
    root: {
      character: "Автор",
      text: "[Північ. Останній трамвай повільно під'їжджає до зупинки]",
      next: { character: "Кондукторка", text: "Сідайте швидше, це останній на сьогодні.", next: { end: true } },
    },
  });
  return editor.project;
}
