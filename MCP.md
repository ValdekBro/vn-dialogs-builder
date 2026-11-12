# VNami — MCP Specification

> Specification of the MCP server built into the app. The data model is described in [SCHEMA.md](SCHEMA.md), the architecture in [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. General principles

1. **Active project.** The app stores many projects, but MCP works with the one **currently open** in the app, so tools have no `projectId`. The agent can read the list of all projects (`list_projects`), but only the human switches projects. If no project is open, every call except `list_projects` returns `NO_PROJECT_OPEN`.
2. **Global IDs.** Block and line IDs are unique within the project, so operations on them do not need a `sceneId`.
3. **One call equals one command and one undo step.** Batch tools (`add_chain`, `add_tree`) are atomic: all or nothing, and all of it is one undo step.
4. **Agent changes are marked** as `source: "agent"`. The app can briefly highlight changed blocks on the canvas and show in history who made the change.
5. **A character can be given by ID or by exact name.** The `character` parameter accepts `chr_…` or a name. If the name is not found or is ambiguous, `INVALID_ARGUMENT` is returned with a list of candidates.
6. **Responses.** Every tool returns `structuredContent` (JSON) and a short text copy in `content` for clients without structured-output support.
7. **Tools that change the model** return the changed entities and the current issue count: `{ ..., issues: { errors: n, warnings: m } }`. This way the agent immediately sees whether it left any "red" spots behind.
8. **Deletion needs human approval.** Any agent action that deletes content (blocks, lines, characters, scenes) first shows a request in the app and runs only after approval. The mechanism is described in section 5.9.

## 1a. What the agent can do (requirements checklist)

| Requirement | Tools |
|---|---|
| List of all characters | `list_characters` |
| A single character with all details | `get_character` |
| List of scenes | `list_scenes` |
| Structure and content of a whole scene | `get_scene` (`outline` for reading, `json` for the exact structure) |
| Add new blocks | `add_block`, `add_chain`, `add_tree` |
| Fully edit existing blocks | `update_block` (character, full list of lines with their `next`) + targeted `add_line` / `update_line` / `reorder_lines` / `set_next` |
| Delete blocks with human approval | `delete_blocks` → request in the app → `approved` / `rejected` / `timeout` |

## 2. Connecting

- URL: `http://127.0.0.1:<port>/mcp`, Streamable HTTP transport.
- Default port `47821`; it can be changed in settings.
- Authorization via the `Authorization: Bearer <token>` header. The app generates the token and shows it in the "Connect an AI agent" dialog together with a ready-made connect command:

```bash
claude mcp add --transport http vnami http://127.0.0.1:47821/mcp --header "Authorization: Bearer <token>"
```

- MCP is available only while the app is running.
- The server is stateless: every POST to `/mcp` is handled separately, responses are JSON (`enableJsonResponse`). So the app judges whether an agent is "connected" by its last call (2 min).
- Only requests with `Host` 127.0.0.1 / localhost are accepted (DNS rebinding protection).
- Code: `apps/desktop/src/main/mcp/` — `http.ts` (server and token), `tools.ts` (tools and instructions), `approvals.ts` (approval queue), `bridge.ts` and `claude-desktop.ts` (bridge for the Claude app).

### 2a. The Claude app (not Claude Code)

The Claude desktop app only loads local stdio servers from `claude_desktop_config.json`; it does not accept an HTTP URL with a token. Connectors in Claude's settings and claude.ai run on Anthropic's servers and cannot reach `127.0.0.1`, so connecting them is impossible.

That is why VNami has a **stdio ↔ HTTP bridge** (`bridge.ts`, built as a separate file `out/main/mcp-bridge.js`; in the package it lives outside `app.asar` via `asarUnpack`):

```json
{
  "mcpServers": {
    "vnami": {
      "command": "<path to the VNami executable>",
      "args": ["<…>/app.asar.unpacked/out/main/mcp-bridge.js", "<userData>/settings.json"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

- Claude runs the VNami executable itself in Node mode, so the user does not need Node.js.
- The bridge forwards every JSON-RPC message from stdin as a POST to `/mcp` and writes the reply to stdout. It reads the port and token from `settings.json` every time, so Claude's config holds no token.
- If VNami is closed, the request gets error `-32000` "VNami is not running…" instead of hanging; a wrong token is a separate, clear error.
- The "Підключити до Claude" (Connect to Claude) button in the "Connect an AI agent" dialog writes the `vnami` entry into Claude's config (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`) and leaves the rest untouched. Broken JSON is never overwritten — an error is shown instead. Claude must then be fully restarted.
- If VNami is moved to another folder (e.g. launched from the `.dmg` and later copied into Applications), the path in the config goes stale — press the button again.
- For tests, the Claude config path can be overridden with the `VN_CLAUDE_CONFIG` environment variable.

## 3. Server instructions

The `instructions` field sent at initialization briefly explains the model to the agent, so it does not have to guess:

> The project consists of characters and scenes and has a lore description: read it with `get_project` before writing content. A scene is a graph of blocks. A block is one character and their lines (`lines`); every line has its own output `next`. One line is an ordinary dialogue step; several are a player choice. `next` is: `null` (not connected, an issue), a block of the same scene, `end` (a deliberate end of the story) or `scene` (jump to the start of another scene). Branching is only possible via several lines in a block. Several outputs may lead into one block (convergence). To read a scene use `get_scene` with `format: "outline"`. To create a linear dialogue use `add_chain`, for a branching part use `add_tree`. Check `list_issues` after changes. Deletions run only after a human approves them in the app: if the result is `rejected`, do not retry without a new request from the user. The "Автор" (Author) character always exists. Respect characters' `description` and `speechStyle` when writing their lines.

## 4. Shared types

```ts
type Output = { blockId: BlockId; lineId?: LineId };
// an output is a line: { blockId, lineId }
// lineId may be omitted if the block has one line

type Next =
  | null
  | { type: "block"; blockId: BlockId }   // a block of the same scene
  | { type: "end" }                       // end of the story
  | { type: "scene"; sceneId: SceneId };  // jump to the start of another scene

type CharacterRef = string; // "chr_…" or exact name

type Issue = {
  code: "missing_start" | "unreachable" | "dangling_output" | "missing_character" | "empty_text"
      | "empty_target_scene";
  severity: "error" | "warning";
  sceneId: SceneId;
  blockId?: BlockId;
  lineId?: LineId;
  message: string; // human-readable description in the UI language (Ukrainian)
};
```

## 5. Tools

### 5.1 Reading

| Tool | Input | Output |
|---|---|---|
| `list_projects` | — | `{ id, name, isActive, sceneCount }[]` |
| `get_project` | — | `{ id, name, description (lore), characters: Character[], scenes: { id, name, description, blockCount, issueCount }[] }` |
| `list_characters` | — | `Character[]` in `characterOrder` |
| `get_character` | `{ character }` | `Character` + `{ blockCount }` |
| `list_scenes` | — | `{ id, name, description, startBlockId, blockCount, issueCount }[]` in `sceneOrder` |
| `get_scene` | `{ sceneId, format?: "outline" \| "json" }` | `outline`: text tree (see 6); `json`: `Scene` per the schema |
| `get_block` | `{ blockId }` | `Block` + `{ sceneId, incoming: Output[], isStart }` |
| `find_blocks` | `{ query?, character?, sceneId?, choicesOnly?, limit? = 50 }` | `{ sceneId, block }[]`. `query` is a case-insensitive substring search in line text; `choicesOnly` — only blocks with several lines |
| `list_issues` | `{ sceneId? }` | `Issue[]` |

### 5.1a Project

| Tool | Input | Output |
|---|---|---|
| `update_project` | `{ name?, description? }` | `{ id, name, description }`. Changes the active project's name and lore description |

Creating, deleting and switching projects is available only to the human.

### 5.2 Characters

| Tool | Input | Output |
|---|---|---|
| `create_character` | `{ name, color?, description?, speechStyle? }` | `Character`. If no colour is given, one is picked automatically from the palette |
| `update_character` | `{ character, name?, color?, description?, speechStyle? }` | `Character` |
| `delete_character` | `{ character, reason? }` | **Needs approval** (5.9). After approval: `{ status, deletedId, affectedBlockIds }`. "Автор" cannot be deleted: `FORBIDDEN` |

### 5.3 Scenes

| Tool | Input | Output |
|---|---|---|
| `create_scene` | `{ name, description? }` | `Scene` (empty) |
| `update_scene` | `{ sceneId, name?, description?, startBlockId? }` | `Scene` (without blocks) |
| `delete_scene` | `{ sceneId, reason? }` | **Needs approval** (5.9). After approval: `{ status, deletedId }` |
| `duplicate_scene` | `{ sceneId, name? }` | `Scene` with new IDs |

### 5.4 Blocks

| Tool | Input | Output |
|---|---|---|
| `add_block` | `{ sceneId, character, text?, lines?: { text, next? }[], from?: Output, insert?: boolean, next?: Next }` | `Block`. One line — `text` (+ `next`); several (a choice) — `lines` |
| `update_block` | `{ blockId, character?, lines? }` | `Block` (see below) |
| `delete_blocks` | `{ blockIds: BlockId[], reason? }` | **Needs approval** (5.9). After approval: `{ status, deletedIds, danglingOutputs: Output[] }` |

**`add_block` behaviour:**
- `from` is the output to connect the new block to.
- `insert: true` inserts the block **between** `from` and its previous `next`: the old continuation goes to the new block's first line. Without `insert` the output's old link is simply replaced.
- If the scene has no start block yet, the new block becomes the start block.

**`update_block` — full block edit in one call.** Only the given fields change:
- `character` — the block's character.
- `lines` — the **full** new list of lines: `{ id?: LineId, text: string, next?: Next }[]`, at least one.
  - An element with `id` updates an existing line. If `next` is not given, the link stays as it was.
  - An element without `id` creates a new line. This is how an ordinary block becomes a choice.
  - The array order becomes the new line order.
  - Existing lines missing from the array are deleted. That is a content deletion, so **approval is needed** (5.9).

Everything runs atomically and is one undo step.

**`delete_blocks`** deletes one or more blocks with a single approval request. This is the only way to delete a block: there is no separate `delete_block` without approval.

### 5.5 Lines

| Tool | Input | Output |
|---|---|---|
| `add_line` | `{ blockId, text, index?, next?: Next }` | `Block`. The second and later lines turn the block into a choice |
| `update_line` | `{ lineId, text }` | `Block` |
| `delete_line` | `{ lineId, reason? }` | **Needs approval** (5.9). After approval: `{ status, block }`. The block's last line cannot be deleted (`INVALID_ARGUMENT`): delete the block |
| `reorder_lines` | `{ blockId, lineIds: LineId[] }` | `Block`. `lineIds` must be a permutation of the existing IDs |

### 5.6 Links

| Tool | Input | Output |
|---|---|---|
| `set_next` | `{ from: Output, next: Next }` | The updated `Block` |

This single tool covers every link operation: connect (`{type:"block"}`), disconnect (`null`), mark the end of the story (`{type:"end"}`) and jump to another scene (`{type:"scene"}`). A target block must belong to the same scene.

### 5.7 Batch

#### `add_chain` — linear dialogue

```ts
{
  sceneId: SceneId;
  from?: Output;          // where to connect the first block; without from the chain stands alone
  insert?: boolean;       // insert between from and its old next
  lines: { character: CharacterRef; text: string }[]; // at least 1
  end?: Next;             // next of the last block; null by default
}
// → { blockIds: BlockId[], issues }
```

#### `add_tree` — branching part

The structure is nested, because that is the most natural way for agents to describe dialogue. Labels (`label`) allow convergence within one call.

```ts
type TreeNode = {
  label?: string;              // local label for references within the call
  character: CharacterRef;
  text?: string;               // one line…
  next?: TreeTarget;           // …and its continuation
  lines?: {                    // or several lines — a choice
    text: string;
    next?: TreeTarget;
  }[];
};

type TreeTarget =
  | TreeNode                       // a new block
  | { ref: string }                // label of a block from the same call (convergence)
  | { blockId: BlockId }           // an existing block of the scene
  | { end: true }                  // end of the story
  | { scene: SceneId }             // jump to the start of another scene
  | null;                          // not connected

{
  sceneId: SceneId;
  from?: Output;
  insert?: boolean;
  root: TreeNode;
}
// → { blockIds: Record<label | "#<n>", BlockId>, rootBlockId, issues }
```

- A node has either `text` (+ `next`) or `lines`, not both.
- A `ref` may point to any label of the call, including one declared further down.
- An unknown or duplicate label gives `INVALID_ARGUMENT`, and nothing is created.

**Example** (the scene from SCHEMA.md, created in one call; dialogue content is Ukrainian):

```json
{
  "sceneId": "scn_Qw8rT2yUiO",
  "root": {
    "character": "Автор",
    "text": "[Бен — мисливець]",
    "next": {
      "character": "Бен",
      "text": "Привіт, ГГ! З самого ранку вже на ногах, хехе. Відра не надто важкі? Може, допомогти донести?",
      "next": {
        "character": "ГГ",
        "lines": [
          { "text": "О, Бене, доброго ранку! Та ні, не надто важкі. Але якщо ти так хочеш допомогти, візьми одне відро.",
            "next": {
              "label": "well",
              "character": "Автор",
              "text": "[До криниці стежка йде повз старий млин]",
              "next": { "end": true } } },
          { "text": "Доброго ранку, Бене! Дякую, але я сама впораюся.", "next": { "ref": "well" } }
        ]
      }
    }
  }
}
```

### 5.8 History

| Tool | Input | Output |
|---|---|---|
| `undo` | — | `{ undone: string \| null }`: description of the undone action |
| `redo` | — | `{ redone: string \| null }` |

History is shared by the human and the agent. `undo` reverts the last action, whoever made it. That is acceptable, because in practice only one of them works at a time.

`undo` and `redo` need no approval: they are reverts themselves and can be reversed.

### 5.9 Deletion approval

Agent actions that delete content do not run immediately. This applies to:
- `delete_blocks`, `delete_line`, `delete_character`, `delete_scene`;
- `update_block` that removes existing lines.

**How it works:**
1. The app shows the human a request: what exactly the agent wants to delete (blocks are highlighted on the canvas), which links disappear as a result, and the agent's `reason` if it gave one.
2. The human presses **"Підтвердити"** (Approve) or **"Відхилити"** (Reject).
3. The tool call **waits for the answer** up to 120 seconds (configurable) and returns:
   - `{ status: "approved", ... }` — the action ran, with the result described for the tool;
   - `{ status: "rejected" }` — nothing changed;
   - `{ status: "timeout" }` — the human did not answer in time, the request was withdrawn, nothing changed.
4. While a request is pending, other deletion requests queue up.

`rejected` and `timeout` are ordinary results, not errors (`isError: false`). The agent should tell the user and not retry automatically.

Approval can be turned off in the app settings ("Confirm agent deletions"). It is on by default.

> Some MCP clients have a short tool-call timeout. If 120 seconds exceeds the client's timeout, raise it in the client's settings (e.g. `MCP_TOOL_TIMEOUT` in Claude Code).

## 6. The `outline` format

A compact text representation of a scene, token-efficient and easy for an agent to read. A block that several links lead into is expanded only once; after that it is referenced with `↪`. The labels are in Ukrainian, like the rest of the content:

```
Сцена «Ранок» (scn_Qw8rT2yUiO), старт: blk_a1a1a1a1a1, проблем: 0
Опис: Дорогою до криниці ГГ зустрічає Бена.
[blk_a1a1a1a1a1] Автор: [Бен — мисливець]
[blk_b2b2b2b2b2] Бен: Привіт, ГГ! З самого ранку вже на ногах, хехе. Відра не надто важкі? Може, допомогти донести?
[blk_c3c3c3c3c3] ГГ, вибір:
  ◇ [ln_c3c3c3c3c3] «О, Бене, доброго ранку! Та ні, не надто важкі. Але якщо ти так хочеш допомогти, візьми одне відро.»
    [blk_d4d4d4d4d4] Автор: [До криниці стежка йде повз старий млин]
    ■ КІНЕЦЬ
  ◇ [ln_e5e5e5e5e5] «Доброго ранку, Бене! Дякую, але я сама впораюся.»
    ↪ blk_d4d4d4d4d4
```

Markers:
- `Сцена … старт … проблем` — header: scene name and id, start block, issue count; `Опис` — the scene description;
- `вибір` — a block with several lines (a choice); each option is marked `◇`. A block with one line is written on one line;
- `■ КІНЕЦЬ` — `next: end`;
- `→ СЦЕНА «Name» (scn_…)` — jump to the start of another scene;
- `⚠ НЕ ПІДКЛЮЧЕНО` — `next: null`;
- `↪` — reference to a block already shown;
- `(без персонажа)` — block without a character; `(порожня сцена)` — empty scene.

Unreachable blocks are listed at the end under `Недосяжні:`.

## 7. Errors

Errors are returned with `isError: true` and the structure `{ code, message, details? }`.

| Code | When |
|---|---|
| `NO_PROJECT_OPEN` | No project is open in the app |
| `NOT_FOUND` | No entity with that ID or name |
| `INVALID_ARGUMENT` | Invalid arguments: schema, ambiguous name, output without `lineId` in a block with several lines, deleting the last line, unknown label, etc. |
| `CROSS_SCENE` | A link between blocks of different scenes |
| `FORBIDDEN` | A forbidden action, e.g. deleting "Автор" |
| `UNAUTHORIZED` | Missing or wrong token |

Messages (`message`) are in **English**, because agents understand it best. Issue texts (`Issue.message`) are in Ukrainian, because the human sees them in the UI too.

## 8. Beyond the MVP

- MCP resources (`vn://scene/{id}`) and change subscriptions.
- Switching and creating projects by the agent.
- An export tool.
- MCP prompts: e.g. "write a branch in a character's style".
- `copy_blocks` between scenes. For now the agent recreates what it needs with `add_tree`.
- Tools for action blocks and variables once they appear in the schema.
