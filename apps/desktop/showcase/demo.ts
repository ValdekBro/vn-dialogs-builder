import { addTree, createCharacter, createProject, createScene, ProjectEditor, randomId, updateCharacter, updateProject, updateScene, type Project, type TreeNode } from "@vn/core";

/**
 * The demo project for README media: «Ранок у селі» — three scenes with choices, a convergence
 * and jumps between scenes, characters with descriptions. It has no errors.
 */
/** The «Ярмарок» scene: the agent writes it live in the agent showcase. */
export const fairTree = {
  character: "Оксана",
  text: "Свіжі бублики! ГГ, Бене, беріть, поки гарячі!",
  next: {
    character: "ГГ",
    lines: [
      { text: "Два, будь ласка. Один для Бена.", next: { character: "Бен", text: "Ти найкращий друг на світі!", next: { end: true } } },
      { text: "Мені з маком, якщо є.", next: { character: "Оксана", text: "Для тебе завжди знайдеться!", next: { end: true } } },
    ],
  },
} satisfies TreeNode;

/** `fair: false` leaves «Ярмарок» empty (for the agent to fill). */
export function demoProject({ fair = true }: { fair?: boolean } = {}): Project {
  const editor = new ProjectEditor(createProject({ name: "Ранок у селі", appVersion: "0.0.0", newId: randomId }));
  const morning = editor.project.sceneOrder[0]!;
  editor.run(updateScene, { sceneId: morning, name: "Ранок", description: "ГГ прокидається й іде по воду" });
  editor.run(updateProject, {
    description:
      "Невелике село над річкою, останнє літо перед від'їздом ГГ до міста. Теплі, трохи ностальгійні історії про родину, друзів і перший ярмарок.",
  });
  const people: [string, string, string][] = [
    ["Татко", "Батько ГГ. Суворий на словах, але м'який серцем. Встає раніше за всіх.", "Коротко, по-господарськи, з приказками."],
    ["ГГ", "Головний герой. Останнє літо в селі перед навчанням у місті.", "Жартує, щоб приховати хвилювання."],
    ["Бен", "Сусід і найкращий друг ГГ. Завжди готовий допомогти.", "Говорить швидко й захоплено."],
    ["Оксана", "Продає бублики на ярмарку, знає всі новини села.", "Голосна, привітна, кличе всіх на ім'я."],
  ];
  for (const [name, description, speechStyle] of people) editor.run(createCharacter, { name, description, speechStyle });
  const author = Object.values(editor.project.characters).find((c) => c.builtIn === "author")!;
  editor.run(updateCharacter, { characterId: author.id, description: "Оповідач: описує місце, час і дії." });

  const { sceneId: well } = editor.run(createScene, { name: "Біля криниці", description: "Зустріч із Беном" });
  const { sceneId: fairScene } = editor.run(createScene, { name: "Ярмарок", description: "Наступного дня" });

  editor.run(addTree, {
    sceneId: morning,
    root: {
      character: "Автор",
      text: "[Світанок. Крізь фіранку пробивається сонце, надворі кукурікає півень]",
      next: {
        character: "Татко",
        text: "Вставай, ГГ, сонце вже високо! Мати просила води принести, поки не спекло.",
        next: {
          character: "ГГ",
          lines: [
            {
              text: "Уже біжу, тату!",
              next: {
                character: "Татко",
                text: "Отак би щодня. Відра біля порогу.",
                // The three branches converge here; this block jumps to the next scene.
                next: { label: "out", character: "Автор", text: "[ГГ хапає відра й вибігає на вулицю. Роса ще не висохла]", next: { scene: well } },
              },
            },
            {
              text: "Ще п'ять хвилин…",
              next: {
                character: "Татко",
                text: "П'ять хвилин минуло ще годину тому. Підйом!",
                next: { character: "ГГ", text: "Добре, добре, встаю…", next: { ref: "out" } },
              },
            },
            {
              text: "А чому не Бен? Він же поруч живе.",
              next: { character: "Татко", text: "Бо в Бена своя криниця, а в нас своя родина. Ну ж бо.", next: { ref: "out" } },
            },
          ],
        },
      },
    },
  });
  editor.run(addTree, {
    sceneId: well,
    root: {
      character: "Бен",
      text: "О, ГГ! Ти теж по воду? Давай допоможу донести.",
      next: {
        character: "ГГ",
        lines: [
          {
            text: "Дякую, Бене, відра сьогодні як камінь.",
            next: { character: "Бен", text: "Тоді по дорозі розкажу, що завтра буде на ярмарку!", next: { scene: fairScene } },
          },
          { text: "Я впораюсь, дякую.", next: { character: "Бен", text: "Як скажеш. Побачимося на ярмарку!", next: { scene: fairScene } } },
        ],
      },
    },
  });
  if (fair) editor.run(addTree, { sceneId: fairScene, root: fairTree });
  return editor.project;
}
