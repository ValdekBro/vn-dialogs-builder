# VNami — Data Schema

> Two **separately versioned** formats: the **project file** (the app's internal storage; the same model lives in memory and in MCP) and the **export file** (an external contract for engines and other tools).
> Context: [OVERVIEW.md](OVERVIEW.md), [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Key decisions

1. **A link is stored on the output, not in a separate collection.** An output is a line: every line of a block has its own `next` field. At most one link can leave an output, and the data structure guarantees that by itself.
2. **Incoming links are not stored but computed.** The "who leads into this block" index is built in memory. Convergence and unreachable blocks are determined through it.
3. **`next` has these states:**
   - `null` — no link set. The output counts as an issue and is highlighted red;
   - `{ "type": "block", "blockId": "..." }` — go to a block;
   - `{ "type": "end" }` — a **deliberate end of the story**. The output is not flagged as an issue;
   - `{ "type": "scene", "sceneId": "..." }` — jump to the start of another scene.

   Without an explicit "end", every legitimate ending of a scene would be red.
4. **There are no block types.** A block is a character and a list of lines (at least one). One line is an ordinary dialogue step; several are a player choice, and each continues along its own path. Future action blocks will be a separate kind of node.
5. **Collections are stored as objects keyed by ID**, and order, where it matters, as separate ID arrays. Lookups are O(1) and git diffs are stable.
6. **IDs have a type prefix:** `prj_`, `chr_`, `scn_`, `blk_`, `ln_` (line), followed by 10 characters from the nanoid alphabet. They are easy to read in logs and MCP, and harder to mix up.
7. **Issues are not stored in the file.** They are always recomputed from the model. A project file may contain issues (unfinished work); an export may not.
8. **Editor state is not stored in the project file.** Zoom and the selected scene are app settings for a given project, so they do not clutter the diff. The exception is manual block positions (`Block.pos`), because the author deliberately arranged them.
9. **Storage and export are versioned independently.** The internal format may change together with the app (with automatic migration), while the export format is a stable contract for external consumers. So there is a separate conversion between them (section 8).

## 2. Entities

### Project (root of the project file)

A project is a set of scenes with a name and a lore description. Characters belong to the project and are shared by all its scenes.

| Field | Type | Description |
|---|---|---|
| `format` | `"vn-dialogs-builder.project"` | Storage format signature |
| `version` | `4` | Storage format version (section 7) |
| `appVersion` | `string` | Version of the app that last saved the file (informational) |
| `id` | `ProjectId` | `prj_…` |
| `name` | `string` | Project name |
| `description` | `string` | Long lore description, may be empty |
| `characters` | `Record<CharacterId, Character>` | Characters |
| `characterOrder` | `CharacterId[]` | Character order in the list |
| `scenes` | `Record<SceneId, Scene>` | Scenes |
| `sceneOrder` | `SceneId[]` | Scene order in the list |

### Character

| Field | Type | Description |
|---|---|---|
| `id` | `CharacterId` | `chr_…` |
| `name` | `string` | Name, non-empty |
| `color` | `string` | `#RRGGBB` |
| `description` | `string` | Description or backstory, may be empty |
| `speechStyle` | `string` | Speech style, may be empty |
| `builtIn` | `"author"`? | Present only on "Автор" (Author). This character cannot be deleted |

### Scene

| Field | Type | Description |
|---|---|---|
| `id` | `SceneId` | `scn_…` |
| `name` | `string` | Scene name |
| `description` | `string` | Short scene description, optional (may be empty) |
| `startBlockId` | `BlockId \| null` | Start block |
| `blocks` | `Record<BlockId, Block>` | The scene's blocks |

### Block

| Field | Type | Description |
|---|---|---|
| `id` | `BlockId` | `blk_…` |
| `characterId` | `CharacterId \| null` | `null` if the character was deleted |
| `lines` | `Line[]` | Lines, at least one. Several lines are a choice; array order is display order |
| `pos` | `{ x, y }?` | Canvas position if the human moved the block manually (canvas coordinates). Without it the block is laid out automatically. Does not affect dialogue logic and is **not exported** |

### Line

| Field | Type | Description |
|---|---|---|
| `id` | `LineId` | `ln_…` |
| `text` | `string` | Line text, may be multiline |
| `next` | `Next` | The line's output |

### Next

```
null                                   // no link → an issue
{ "type": "block", "blockId": "blk_…" } // go to a block of the same scene
{ "type": "end" }                      // deliberate end (of the story)
{ "type": "scene", "sceneId": "scn_…" } // jump to the start of another scene
```

## 3. Zod (`packages/core/src/schema`)

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
  pos: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(), // manual canvas position
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
  version: z.literal(4),
  appVersion: z.string(),
  id: ProjectId,
  name: z.string().min(1),
  description: z.string(),
  characters: z.record(CharacterId, Character),
  characterOrder: z.array(CharacterId),
  scenes: z.record(SceneId, Scene),
  sceneOrder: z.array(SceneId),
});
// + superRefine for the invariants in section 4
```

## 4. Invariants

They are checked by `superRefine` on load and import, and by commands on every change. A violated invariant means a **corrupted file**, not an issue to highlight.

1. The key in a `Record` matches the entity's `id` field.
2. `characterOrder` contains exactly the IDs in `characters`, without duplicates. The same applies to `sceneOrder` and `scenes`.
3. The project has exactly one character with `builtIn: "author"`.
4. All IDs are unique within the project (including line IDs).
4a. A block has at least one line.
5. `Next.blockId` points to a block of **the same scene**.
5a. `Next.sceneId` points to **another** existing scene (a jump to its start block).
6. `startBlockId`, if set, points to a block of this scene.
7. `characterId`, if set, points to an existing character.

Commands maintain invariants 5–7 automatically:
- when a block is deleted, every `next` that led into it becomes `null`, and `startBlockId` becomes `null` if needed;
- when a scene is deleted, jumps into it from other scenes become `null`;
- when a character is deleted, their blocks' `characterId` becomes `null`.

## 5. Issues (computed, highlighted red)

| Code | Where | Condition |
|---|---|---|
| `missing_start` | Scene | The scene has blocks but `startBlockId = null` |
| `unreachable` | Block | The block is unreachable from the start block (graph walk) |
| `dangling_output` | Line | `next = null` |
| `missing_character` | Block | `characterId = null` |
| `empty_text` | Line | The text is empty |
| `empty_target_scene` | Line | The jump leads into a scene without a start block (an empty one) |

All issues are currently errors (`severity: "error"`). The `warning` level stays in the format for future checks.

**Issues with `severity: "error"` block project export.** Warnings do not block export. Saving the project file does not depend on issues.

Each issue looks like `{ code, sceneId, blockId?, lineId?, severity: "error" | "warning", message }`, where `message` is a human-readable description in the UI language. The MCP tool `list_issues` returns the same format.

## 6. Example file

Content (names, lore, dialogue) is in Ukrainian, as in real projects.

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

Block `blk_c3c3c3c3c3` has two lines by ГГ — a player choice: accept Бен's help or decline. Both options lead into `blk_d4d4d4d4d4`, so there is **convergence** here. On the canvas this block is drawn once, and both links into it are ordinary lines.

## 7. Storage serialization and versioning

- Keys are written in a **stable order**: entity fields in the fixed schema order, `Record`s sorted by ID.
- 2-space indentation, a trailing newline at the end of the file.
- **Loading:** `JSON.parse` → migrations by `version` → `Project.parse` validation.
- **Migrations:** a chain of pure functions `v1 → v2 → … → current` in `core/schema/migrations/project`. Every migration is covered by a test on an old-version fixture file.
- **Opening an older file:** before the first save in the new format, the app puts a backup `<projectId>.v<old version>.bak.json` next to it.
- **Opening a newer file** (from a newer app version): the app does not open the project and shows "The project was created by a newer version, update the app". This way an old app cannot damage the data.
- `version` is bumped on **any** structural change, even adding a field, so migrations are explicit.

### Storage format changelog

| Version | Changes | Migration |
|---|---|---|
| 1 | Initial version: `line` blocks (text + `next`) and `choice` blocks (text + `opt_…` options) | — |
| 2 | Block = character + `lines[]`, each line has its own `next`; no block types | `line` → one line; `choice` options → lines; the `choice` block's text becomes a separate block of the same character before the choice |
| 3 | New kind of `next`: `{ type: "scene", sceneId }` — jump to the start of another scene | Data unchanged, version number only |
| 4 | Optional block field `pos: { x, y }` — manual canvas position | Data unchanged, version number only |

## 8. Export format

A separate format generated from the project by `toExport(project)` in `core/export`. Export is possible only when the project has no errors, so the export format is **stricter** than the storage format: all outputs are connected, characters are set.

| Difference from storage | Why |
|---|---|
| Separate `format` and `version` | Independent evolution |
| Collections are **arrays** in the right order (characters, scenes), not `Record` + `order` | Easier for consumers to iterate |
| A scene's blocks are ordered by the walk from the start block | The file reads like a script |
| `next` is never `null`, `characterId` is never `null` | Guaranteed by the absence of errors |
| `builtIn: "author"` → `isAuthor: true` | Clearer to third parties |
| `pos` is dropped | Canvas layout is not part of the dialogue |
| `exportedAt`, `appVersion` added | Tracking where the file came from |

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

> An empty scene (no blocks) has no `startBlockId`. Such scenes are **not included** in the export.

### Export versioning

- The export `version` is bumped on any change of its structure. Each version is recorded in the changelog below.
- The app always exports the **latest** format version.
- **Import** accepts every export version ever released: `migrations/export` bring an old file up to the current version, and `fromExport()` turns it into a new project (with a new `prj_` ID).
- A change of the internal storage format **does not force** a change of the export format: only `toExport()` is updated.

### Export format changelog

| Version | Changes |
|---|---|
| 1 | Initial version |

## 9. Future extensions

| Feature | How it fits the schema |
|---|---|
| Action blocks | A separate kind of node (a `kind` field on the block) with a `next` field |
| Variables and conditions | `project.variables` + `line.condition` |
| Emotion, notes, block tags | New fields on the block |
| Avatar, "player" flag | New fields on `Character` |
| Content localization | `text` becomes `string \| Record<Locale, string>` or moves to a string table |

Each of these changes bumps the storage `version` (with a migration) and, if it reaches the export, the export `version`.
