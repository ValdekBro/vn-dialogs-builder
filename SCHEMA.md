# VNami — Data Schema

> Два **окремо версіоновані** формати: **файл проєкту** (внутрішнє сховище застосунку; ця ж модель у пам'яті й у MCP) і **файл експорту** (зовнішній контракт для рушіїв та інших інструментів).
> Контекст: [OVERVIEW.md](OVERVIEW.md), [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Ключові рішення

1. **Зв'язок зберігається на виході, а не окремою колекцією.** Вихід — це репліка: кожна репліка блоку має своє поле `next`. З одного виходу може йти щонайбільше один зв'язок, і структура даних гарантує це сама.
2. **Вхідні зв'язки не зберігаються, а обчислюються.** Індекс «хто веде в цей блок» будується в пам'яті. Через нього визначаються сходження й недосяжні блоки.
3. **`next` має три стани:**
   - `null` — зв'язок не задано. Вихід вважається проблемним і підсвічується червоним;
   - `{ "type": "block", "blockId": "..." }` — перехід до блоку;
   - `{ "type": "end" }` — **свідомий кінець сцени**. Вихід не підсвічується як проблема.

   Без явного «кінця» кожна легальна кінцівка сцени була б червоною. Крім того, сюди легко додати майбутні типи переходів, наприклад `{ "type": "scene", "sceneId" }` для переходу між сценами.
4. **Окремих типів блоку немає.** Блок — це персонаж і список реплік (мінімум одна). Одна репліка — звичайний крок діалогу; кілька — вибір гравця, і кожна веде далі своїм шляхом. Майбутні блоки-дії стануть окремим видом вузла.
5. **Колекції зберігаються як об'єкти за ID**, а порядок там, де він важливий, — окремими масивами ID. Так пошук іде за O(1), а git-diff стабільний.
6. **ID мають префікс за типом:** `prj_`, `chr_`, `scn_`, `blk_`, `ln_` (репліка), а далі 10 символів з алфавіту nanoid. Їх легко читати в логах і MCP, і переплутати сутності складніше.
7. **Проблеми (issues) не зберігаються у файлі.** Вони завжди перераховуються з моделі. Файл проєкту може містити проблеми (незавершену роботу), а експорт — ні.
8. **Стан редактора не зберігається у файлі проєкту.** Згорнуті гілки, зум і вибрана сцена — це налаштування застосунку для конкретного проєкту, тож вони не засмічують diff.
9. **Сховище й експорт версіонуються незалежно.** Внутрішній формат може змінюватися разом із застосунком (з автоматичною міграцією), а формат експорту — це стабільний контракт для зовнішніх споживачів. Тому між ними є окреме перетворення (розділ 8).

## 2. Сутності

### Project (корінь файлу проєкту)

Проєкт — це набір сцен із назвою та описом лору. Персонажі належать проєкту й спільні для всіх його сцен.

| Поле | Тип | Опис |
|---|---|---|
| `format` | `"vn-dialogs-builder.project"` | Сигнатура формату сховища |
| `version` | `1` | Версія формату сховища (розділ 7) |
| `appVersion` | `string` | Версія застосунку, що останньою зберегла файл (довідково) |
| `id` | `ProjectId` | `prj_…` |
| `name` | `string` | Назва проєкту |
| `description` | `string` | Довгий опис лору, може бути порожнім |
| `characters` | `Record<CharacterId, Character>` | Персонажі |
| `characterOrder` | `CharacterId[]` | Порядок персонажів у списку |
| `scenes` | `Record<SceneId, Scene>` | Сцени |
| `sceneOrder` | `SceneId[]` | Порядок сцен у списку |

### Character

| Поле | Тип | Опис |
|---|---|---|
| `id` | `CharacterId` | `chr_…` |
| `name` | `string` | Ім'я, непорожнє |
| `color` | `string` | `#RRGGBB` |
| `description` | `string` | Опис або історія, може бути порожнім |
| `speechStyle` | `string` | Стиль мовлення, може бути порожнім |
| `builtIn` | `"author"`? | Є лише в «Автора». Такого персонажа не можна видалити |

### Scene

| Поле | Тип | Опис |
|---|---|---|
| `id` | `SceneId` | `scn_…` |
| `name` | `string` | Назва сцени |
| `description` | `string` | Короткий опис сцени, необов'язковий (може бути порожнім) |
| `startBlockId` | `BlockId \| null` | Стартовий блок |
| `blocks` | `Record<BlockId, Block>` | Блоки сцени |

### Block

| Поле | Тип | Опис |
|---|---|---|
| `id` | `BlockId` | `blk_…` |
| `characterId` | `CharacterId \| null` | `null`, якщо персонажа видалено |
| `lines` | `Line[]` | Репліки, мінімум одна. Кілька реплік — вибір; порядок масиву збігається з порядком показу |
| `pos` | `{ x, y }?` | Позиція на полотні, якщо людина переставила блок вручну (цілі числа, координати полотна). Без поля блок розкладається автоматично. На логіку діалогу не впливає й **не експортується** |

### Line (репліка)

| Поле | Тип | Опис |
|---|---|---|
| `id` | `LineId` | `ln_…` |
| `text` | `string` | Текст репліки, може бути багаторядковим |
| `next` | `Next` | Вихід репліки |

### Next

```
null                                   // зв'язок не задано → проблема
{ "type": "block", "blockId": "blk_…" } // перехід до блоку тієї ж сцени
{ "type": "end" }                      // свідомий кінець (історії)
{ "type": "scene", "sceneId": "scn_…" } // перехід на початок іншої сцени
```

## 3. Zod (ескіз для `packages/core/schema`)

```ts
const id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_-]{10}$`));

export const ProjectId = id("prj");
export const CharacterId = id("chr");
export const SceneId = id("scn");
export const BlockId = id("blk");
export const LineId = id("ln");

export const Next = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("block"), blockId: BlockId }),
    z.object({ type: z.literal("end") }),
    z.object({ type: z.literal("scene"), sceneId: SceneId }),
  ])
  .nullable();

export const Character = z.object({
  id: CharacterId,
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  description: z.string(),
  speechStyle: z.string(),
  builtIn: z.literal("author").optional(),
});

export const Line = z.object({
  id: LineId,
  text: z.string(),
  next: Next,
});

export const Block = z.object({
  id: BlockId,
  characterId: CharacterId.nullable(),
  lines: z.array(Line).min(1),
  pos: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(), // ручна позиція на полотні
});

export const Scene = z.object({
  id: SceneId,
  name: z.string().min(1),
  description: z.string(),
  startBlockId: BlockId.nullable(),
  blocks: z.record(BlockId, Block),
});

export const Project = z.object({
  format: z.literal("vn-dialogs-builder.project"),
  version: z.literal(3),
  appVersion: z.string(),
  id: ProjectId,
  name: z.string().min(1),
  description: z.string(),
  characters: z.record(CharacterId, Character),
  characterOrder: z.array(CharacterId),
  scenes: z.record(SceneId, Scene),
  sceneOrder: z.array(SceneId),
});
// + superRefine для інваріантів із розділу 4
```

## 4. Інваріанти

Їх перевіряють `superRefine` під час завантаження та імпорту, а також команди під час кожної зміни. Порушення інваріанту означає **пошкоджений файл**, а не проблему для підсвічування.

1. Ключ у `Record` збігається з полем `id` сутності.
2. `characterOrder` містить рівно ті ID, що є в `characters`, без дублікатів. Те саме стосується `sceneOrder` і `scenes`.
3. У проєкті рівно один персонаж із `builtIn: "author"`.
4. Усі ID унікальні в межах проєкту (зокрема ID реплік).
4a. Блок має щонайменше одну репліку.
5. `Next.blockId` вказує на блок **тієї ж сцени**.
5a. `Next.sceneId` вказує на **іншу** наявну сцену (перехід на її стартовий блок).
6. `startBlockId`, якщо заданий, вказує на блок цієї сцени.
7. `characterId`, якщо заданий, вказує на наявного персонажа.

Команди підтримують інваріанти 5–7 автоматично:
- коли видаляють блок, усі `next`, що вели в нього, стають `null`, а `startBlockId` за потреби теж стає `null`;
- коли видаляють персонажа, `characterId` його блоків стає `null`.

## 5. Проблеми (обчислюються, підсвічуються червоним)

| Код | Де | Умова |
|---|---|---|
| `missing_start` | Сцена | Сцена має блоки, але `startBlockId = null` |
| `unreachable` | Блок | Блок недосяжний від стартового (обхід графа) |
| `dangling_output` | Репліка | `next = null` |
| `missing_character` | Блок | `characterId = null` |
| `empty_text` | Репліка | Текст порожній |
| `empty_target_scene` | Репліка | Перехід веде в сцену без стартового блоку (порожню) |

Усі проблеми зараз — помилки (`severity: "error"`). Рівень `warning` лишається у форматі для майбутніх перевірок.

**Проблеми з `severity: "error"` блокують експорт** проєкту. Попередження (`warning`) експорт не блокують. Збереження файлу проєкту від проблем не залежить.

Кожна проблема має вигляд `{ code, sceneId, blockId?, lineId?, severity: "error" | "warning", message }`. Той самий формат повертає MCP-інструмент `list_issues`.

## 6. Приклад файлу

```json
{
  "format": "vn-dialogs-builder.project",
  "version": 4,
  "appVersion": "0.1.0",
  "id": "prj_Zx7vB4nM2q",
  "name": "Ранок у селі",
  "description": "Невелике село Залісся на краю лісу. ГГ живе з татком і щоранку ходить по воду до криниці за старим млином.",
  "characters": {
    "chr_author0001": {
      "id": "chr_author0001",
      "name": "Автор",
      "color": "#888888",
      "description": "",
      "speechStyle": "Нейтральний оповідач",
      "builtIn": "author"
    },
    "chr_hero000001": {
      "id": "chr_hero000001",
      "name": "ГГ",
      "color": "#3b82f6",
      "description": "Головна героїня, від її імені грає гравець.",
      "speechStyle": ""
    },
    "chr_k3Jd9sQpLm": {
      "id": "chr_k3Jd9sQpLm",
      "name": "Бен",
      "color": "#16a34a",
      "description": "Мисливець, сусід ГГ.",
      "speechStyle": "Привітний, трохи грайливий, часто посміюється: «хехе»."
    }
  },
  "characterOrder": [
    "chr_author0001",
    "chr_hero000001",
    "chr_k3Jd9sQpLm"
  ],
  "scenes": {
    "scn_Qw8rT2yUiO": {
      "id": "scn_Qw8rT2yUiO",
      "name": "Ранок",
      "description": "Дорогою до криниці ГГ зустрічає Бена.",
      "startBlockId": "blk_a1a1a1a1a1",
      "blocks": {
        "blk_a1a1a1a1a1": {
          "id": "blk_a1a1a1a1a1",
          "characterId": "chr_author0001",
          "lines": [
            {
              "id": "ln_a1a1a1a1a1",
              "text": "[Бен — мисливець]",
              "next": {
                "type": "block",
                "blockId": "blk_b2b2b2b2b2"
              }
            }
          ]
        },
        "blk_b2b2b2b2b2": {
          "id": "blk_b2b2b2b2b2",
          "characterId": "chr_k3Jd9sQpLm",
          "lines": [
            {
              "id": "ln_b2b2b2b2b2",
              "text": "Привіт, ГГ! З самого ранку вже на ногах, хехе. Відра не надто важкі? Може, допомогти донести?",
              "next": {
                "type": "block",
                "blockId": "blk_c3c3c3c3c3"
              }
            }
          ]
        },
        "blk_c3c3c3c3c3": {
          "id": "blk_c3c3c3c3c3",
          "characterId": "chr_hero000001",
          "lines": [
            {
              "id": "ln_c3c3c3c3c3",
              "text": "О, Бене, доброго ранку! Та ні, не надто важкі. Але якщо ти так хочеш допомогти, візьми одне відро.",
              "next": {
                "type": "block",
                "blockId": "blk_d4d4d4d4d4"
              }
            },
            {
              "id": "ln_e5e5e5e5e5",
              "text": "Доброго ранку, Бене! Дякую, але я сама впораюся.",
              "next": {
                "type": "block",
                "blockId": "blk_d4d4d4d4d4"
              }
            }
          ]
        },
        "blk_d4d4d4d4d4": {
          "id": "blk_d4d4d4d4d4",
          "characterId": "chr_author0001",
          "lines": [
            {
              "id": "ln_d4d4d4d4d4",
              "text": "[До криниці стежка йде повз старий млин]",
              "next": {
                "type": "end"
              }
            }
          ]
        }
      }
    }
  },
  "sceneOrder": [
    "scn_Qw8rT2yUiO"
  ]
}
```

Блок `blk_c3c3c3c3c3` має дві репліки ГГ — це вибір гравця: прийняти допомогу Бена чи відмовитись. Обидва варіанти ведуть у `blk_d4d4d4d4d4`, тобто тут є **сходження**. На полотні цей блок малюється один раз, а обидва зв'язки до нього — звичайні лінії.

## 7. Серіалізація та версіонування сховища

- Ключі записуються в **стабільному порядку**: поля сутності у фіксованому порядку зі схеми, `Record` відсортовані за ID.
- Відступ — 2 пробіли, у кінці файлу — перенос рядка.
- **Завантаження:** `JSON.parse` → міграції за `version` → валідація `Project.parse`.
- **Міграції:** ланцюжок чистих функцій `v1 → v2 → … → поточна` у `core/schema/migrations/project`. Кожна міграція покрита тестом на фікстурі файлу старої версії.
- **Відкриття старішого файлу:** перед першим збереженням у новому форматі застосунок кладе поруч резервну копію `<projectId>.v<стара версія>.bak.json`.
- **Відкриття новішого файлу** (з новішої версії застосунку): застосунок не відкриває проєкт і показує повідомлення «Проєкт створено новішою версією, оновіть застосунок». Так старий застосунок не пошкодить дані.
- `version` піднімається при **будь-якій** зміні структури, навіть додаванні поля, щоб міграції були явними.

### Журнал змін формату сховища

| Версія | Зміни | Міграція |
|---|---|---|
| 1 | Початкова версія: блоки `line` (текст + `next`) і `choice` (текст + варіанти `opt_…`) | — |
| 2 | Блок = персонаж + `lines[]`, у кожної репліки свій `next`; типів блоку немає | `line` → одна репліка; варіанти `choice` → репліки; текст `choice`-блоку стає окремим блоком того ж персонажа перед вибором |
| 3 | Новий вид `next`: `{ type: "scene", sceneId }` — перехід на початок іншої сцени | Даних не змінює, лише номер версії |
| 4 | Необов'язкове поле блоку `pos: { x, y }` — ручна позиція на полотні | Даних не змінює, лише номер версії |

## 8. Формат експорту

Окремий формат, який генерується з проєкту функцією `toExport(project)` у `core/export`. Експорт можливий лише коли в проєкті немає помилок, тому формат експорту **суворіший** за формат сховища: усі виходи підключені, персонажі задані.

| Відмінність від сховища | Чому |
|---|---|
| Окремі `format` і `version` | Незалежна еволюція |
| Колекції — **масиви** у правильному порядку (персонажі, сцени), а не `Record` + `order` | Споживачу простіше ітерувати |
| Блоки сцени впорядковані обходом від стартового блоку | Файл читається як сценарій |
| `next` ніколи не `null`, `characterId` ніколи не `null` | Гарантовано відсутністю помилок |
| `builtIn: "author"` → `isAuthor: true` | Зрозуміліше стороннім |
| Додано `exportedAt`, `appVersion` | Відстеження походження файлу |

```ts
export const ExportNext = z.discriminatedUnion("type", [
  z.object({ type: z.literal("block"), blockId: BlockId }),
  z.object({ type: z.literal("end") }),
  z.object({ type: z.literal("scene"), sceneId: SceneId }),
]);

export const ExportBlock = z.object({
  id: BlockId,
  characterId: CharacterId,
  lines: z.array(z.object({ id: LineId, text: z.string().min(1), next: ExportNext })).min(1),
});

export const ExportV1 = z.object({
  format: z.literal("vn-dialogs-builder.export"),
  version: z.literal(1),
  appVersion: z.string(),
  exportedAt: z.string().datetime(),
  project: z.object({ id: ProjectId, name: z.string(), description: z.string() }),
  characters: z.array(z.object({
    id: CharacterId, name: z.string(), color: z.string(),
    description: z.string(), speechStyle: z.string(), isAuthor: z.boolean(),
  })),
  scenes: z.array(z.object({
    id: SceneId, name: z.string(), description: z.string(),
    startBlockId: BlockId,
    blocks: z.array(ExportBlock),
  })),
});
```

> Порожня сцена (без блоків) не має `startBlockId`. У експорт такі сцени **не потрапляють**.

### Версіонування експорту

- `version` експорту піднімається при будь-якій зміні його структури. Кожна версія фіксується в журналі змін нижче.
- Застосунок завжди експортує **останню** версію формату.
- **Імпорт** приймає всі версії експорту, що будь-коли виходили: `migrations/export` доводять старий файл до поточної версії, а `fromExport()` перетворює його на новий проєкт (з новим `prj_` ID).
- Зміна внутрішнього формату сховища **не змушує** змінювати формат експорту: оновлюється лише `toExport()`.

### Журнал змін формату експорту

| Версія | Зміни |
|---|---|
| 1 | Початкова версія |

## 9. Розширення в майбутньому

| Фіча | Як ляже в схему |
|---|---|
| Блоки-дії | Окремий вид вузла (поле `kind` у блоку) з полем `next` |
| Змінні та умови | `project.variables` + `line.condition` |
| Емоція, нотатки, теги блоку | Нові поля в `BlockBase` |
| Аватар, позначка «гравець» | Нові поля в `Character` |
| Ручні позиції вузлів | `scene.layout: Record<BlockId, {x, y}>` |
| Локалізація | `text` стає `string \| Record<Locale, string>` або виноситься в таблицю рядків |

Кожна з цих змін піднімає `version` сховища (з міграцією) і, якщо вона потрапляє в експорт, — `version` експорту.
