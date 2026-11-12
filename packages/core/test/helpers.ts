import { addTree, createCharacter, createProject, getAuthor, ProjectEditor, sequentialIds, type Block, type Project } from "../src";

/** Texts from the «Ранок» (Morning) scene — real lines, so tests see real text (ellipses, apostrophes, names). */
export const TEXT = {
  knock: "[Стук-стук у двері]",
  dad: "Ти вже прокинулася? Відра з водою порожні. Сходи по воду.",
  wake: "Ох... Так, уже прокинулася. Зараз зберуся й піду.",
  benIntro: "[Бен — мисливець]",
  ben: "Привіт, ГГ! З самого ранку вже на ногах, хехе. Відра не надто важкі? Може, допомогти донести?",
  accept: "О, Бене, доброго ранку! Та ні, не надто важкі. Але якщо ти так хочеш допомогти, візьми одне відро.",
  decline: "Доброго ранку, Бене! Дякую, але я сама впораюся.",
  well: "[До криниці стежка йде повз старий млин]",
} as const;

/** Empty project with predictable IDs: Автор `chr_0000000001`, Сцена 1 `scn_0000000001`. */
export function setup() {
  const newId = sequentialIds();
  const project = createProject({ name: "Ранок у селі", appVersion: "0.0.0-test", newId });
  const editor = new ProjectEditor(project, { newId, now: () => 0 });
  const sceneId = project.sceneOrder[0]!;
  const authorId = getAuthor(project).id;
  return { editor, sceneId, authorId, newId };
}

/**
 * The «Ранок» scene: Автор → Татко → ГГ → Автор → Бен → ГГ chooses (accept help / decline) →
 * both options converge into «До криниці…», where the scene ends.
 */
export function setupMorning() {
  const ctx = setup();
  const { editor, sceneId } = ctx;
  const { characterId: dadId } = editor.run(createCharacter, { name: "Татко", color: "#a16207" });
  const { characterId: heroId } = editor.run(createCharacter, { name: "ГГ", color: "#3b82f6" });
  const { characterId: benId } = editor.run(createCharacter, {
    name: "Бен",
    color: "#16a34a",
    description: "Мисливець, сусід ГГ.",
    speechStyle: "Привітний, трохи грайливий, часто посміюється: «хехе».",
  });
  const { blockIds, rootBlockId } = editor.run(addTree, {
    sceneId,
    root: {
      label: "knock",
      character: "Автор",
      text: TEXT.knock,
      next: {
        label: "dad",
        character: "Татко",
        text: TEXT.dad,
        next: {
          label: "wake",
          character: "ГГ",
          text: TEXT.wake,
          next: {
            label: "benIntro",
            character: "Автор",
            text: TEXT.benIntro,
            next: {
              label: "ben",
              character: "Бен",
              text: TEXT.ben,
              next: {
                label: "answer",
                character: "ГГ",
                lines: [
                  { text: TEXT.accept, next: { label: "well", character: "Автор", text: TEXT.well, next: { end: true } } },
                  { text: TEXT.decline, next: { ref: "well" } },
                ],
              },
            },
          },
        },
      },
    },
  });
  return {
    ...ctx,
    dadId,
    heroId,
    benId,
    rootBlockId,
    ids: blockIds as Record<"knock" | "dad" | "wake" | "benIntro" | "ben" | "answer" | "well", string>,
  };
}

export function scene(project: Project, sceneId: string) {
  return project.scenes[sceneId]!;
}

export function block(project: Project, blockId: string): Block {
  for (const s of Object.values(project.scenes)) if (s.blocks[blockId]) return s.blocks[blockId]!;
  throw new Error(`no block ${blockId}`);
}

/** A block's line (the first by default). */
export function line(project: Project, blockId: string, index = 0) {
  return block(project, blockId).lines[index]!;
}
