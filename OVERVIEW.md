# VNami — Overview

> Status: the MVP feature set is fully agreed (section 7). What remains is listed in section 8.

## 1. The product

**VNami** (VN + Nanami) is a **local desktop app** (Windows / macOS / Linux) for writers and developers of visual novels. It lets you **visually build branching dialogue**: who says what, where the player makes a choice and where the options lead.

The product has two equal "audiences":

1. **A human** works through an interactive visual editor.
2. **An AI agent** works with the same data through the **app's built-in MCP server**. The agent runs **locally** on the same machine.

The human and the agent can work **at the same time**, and each one's changes are immediately visible to the other. In practice usually only one of them works at a time.

There is no web version, cloud or accounts. Mobile platforms are out of scope. **The UI is in Ukrainian**, and dialogue content is usually Ukrainian too.

## 2. Architectural principle

- All state lives **locally**, in the app's storage on disk. Each project is a separate file.
- **The app is the single source of truth.** The editor and the MCP server work with one model in the app's memory. So agent changes appear on the canvas immediately, and agent actions go into the shared undo/redo history.
- The MCP server is reachable only locally, so nothing is exposed to the outside.
- MCP works **only while the app is running**. There is no separate background process that would read project files without the app.

## 3. Glossary

| Term | Meaning |
|---|---|
| **Project** | A set of scenes of one novel. Has a name and a long lore description; characters belong to the project. There can be many projects. |
| **Scene** | A separate graph of blocks with a start block. |
| **Character** | Someone who speaks. |
| **Author** ("Автор") | A built-in character for narration. An ordinary character that always exists in every project and cannot be deleted. |
| **Block** | A graph node: **one character's lines**. By default a block has one line; if there are several, it is a **choice**: the player picks one of them. There is no separate "choice block" type. |
| **Line** | Text in a block. Every line has **its own output**. In a block with several lines they are also called **options**. Which character is the player is out of scope. |
| **Output** | The point to the right of a line from which a link goes to the next block. As many outputs as lines. |
| **Link** | A transition from an output to the next block. |
| **Convergence** | Several links lead into one block, i.e. branches merge. |
| **Problem block** | A block missing a link or data. Highlighted red. |

## 4. Data model (conceptual)

- A **project** has a **name** and a **lore description** and contains **characters** (shared by all its scenes) and **scenes**.
- A **scene** is a **directed graph** of blocks. A block can have several incoming links (convergence) and links can go back (cycles). In the MVP UI the graph is shown as a tree (see 5.5).
- A **block** consists of a character and one or more lines. Long linear chains are expected: they show where interactivity is lacking.
- **Branching is several lines in a block.** Every line has its own output, so links to the next blocks go **from each line separately**. A block with several lines (a choice) looks distinct, but it is the same block: an option can be added to any block, and removing the extra ones turns it back into an ordinary line.
- A **link** leads from an output (a line) to a block in the same scene, to the start of another scene, or to the end of the story.
- A **character** has: name, colour, description (backstory), speech style.
- The **"Автор" (Author) character** is created automatically in every project. It has the same fields and is edited like other characters. The only difference is that it cannot be deleted.
- A **line** holds only text and its output. Choice options are lines of the block's character (usually the hero the player plays as); which character is the player is decided outside this tool.
- The data format is **our own JSON structure**. It is the same for saving, export and MCP.

## 5. MVP — functional scope

### 5.1 Project
- The app can hold **many projects**. The app stores them in its own storage.
- "Projects" screen: create, open, rename, duplicate, delete (with confirmation).
- **Quick switching** between projects via the menu with the project name in the top bar.
- Project fields: **name** and **long lore description**.
- The last project opens on launch.

### 5.2 Scenes
- Create, rename, delete, duplicate a scene.
- Short scene description (optional).
- Scene list in the side panel, from which a scene can be opened.
- Mark the scene's start block.

### 5.3 Characters
- Create, edit and delete a character. Fields: **name**, **colour**, **description (backstory)**, **speech style**. The description and speech style also serve as context for the AI agent.
- The project's character list.
- **"Автор"** always exists. It can be edited (name, colour, description, style), but cannot be deleted.
- When a character is deleted, their blocks **remain** but become problem blocks (red) until another character is assigned.

### 5.4 Blocks and links
- Add a block: pick a character and type text. The default is the last used character or "Автор".
- Add the next block after the selected output.
- Add another line to a block — the block becomes a choice. Options can be added, edited, deleted and reordered; the block's last line cannot be deleted (the block itself is deleted instead).
- Edit text and change the character.
- **Deleting a block:** its links disappear. Blocks that lost their incoming link and outputs without a continuation are marked red. There is no cascading delete.
- Move a block or branch.
- Copy and paste blocks and branches, including between scenes.
- **Links:** an output leads to a new block created via `(+)`, or connects to an **existing block** (by dragging from the output onto the block, or via the menu next to `(+)`). Several links can lead into one block — **convergence**. **Cycles** are allowed too — a link back to a block higher up the branch (e.g. returning to a question menu). A link can be disconnected.
- **Finishing a branch:** an output can lead **to the start of another scene** (on the canvas a link badge "Далі: Scene name"; clicking it opens that scene) or be marked as **the end of the story**. Such an output is not highlighted red, unlike an output that is simply not connected. A jump into an empty scene is an error.

### 5.5 Visualization
- A scene is shown as a tree of blocks with arrows.
- Blocks with several lines (a choice) look noticeably different, and each line's output is visible separately.
- Characters are distinguished by colour.
- Problem blocks and outputs are highlighted red. There is an issue list and counter, from which you can jump to each one.
- A block with several parents (convergence) is drawn once, and all links into it are ordinary lines, like any others.

### 5.6 Editor convenience (required for the MVP)
- **Canvas:** scroll, pan (dragging the background), **zoom in / zoom out** (wheel, trackpad, Ctrl/Cmd +/−), a "fit all to screen" button.
- **Undo / Redo** (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z / Ctrl+Y) for all operations, including agent actions.
- **Selection:** click, multi-select (Shift/Ctrl or box). Delete removes the selection.
- **Copy / cut / paste** (Ctrl/Cmd+C/X/V).
- **Quick editing:** double-click on a block edits text in place. The `(+)` button on every free output creates the next block right there. Detailed scenarios are in [FLOWS.md](FLOWS.md).
- **Collapsing and expanding branches.**
- **Search** by text and filter by character within a scene and the whole project.
- **Automatic tree layout** without overlapping blocks, plus **manual dragging** of blocks by the header with a button to return to auto layout ([FLOWS.md](FLOWS.md), 8a).
- **Minimap** for large scenes (nice to have).

### 5.7 Saving and export
- Each project is stored as a separate JSON file in the app's storage. **Background autosave every second** when there are changes. It always saves, even when the project has errors.
- **JSON export** is available **only when the project has no errors** (red blocks). Warnings do not block export.
- **JSON import** creates a new project from an export file.
- **Versioning.** The storage format and the export format have **separate** versions. Old projects are migrated to the new format automatically on open (with a backup). Import supports every export version ever released. Details in [SCHEMA.md](SCHEMA.md).

### 5.8 MCP server
- Built into the app and available **only locally**.
- The agent can read the character list, each character in detail, the scene list, and the structure and content of a whole scene.
- The agent can add blocks and fully edit existing ones. Mistakes are reverted with undo.
- **Content deletion by the agent** (blocks, options, characters, scenes) runs **only after human approval** in the app. The app shows a request with highlighted blocks and "Підтвердити" / "Відхилити" (Approve / Reject) buttons. Approval can be turned off in settings; it is on by default.
- **How to connect MCP** (the `🤖` button in the top bar): the app shows the server URL, the token and a ready-made connect command for the agent (e.g. `claude mcp add …`) with a "Copy" button, a prompt the user can send to the agent so it connects itself, and whether the server is running right now.
- **The Claude app** (not Claude Code) connects with the "Підключити до Claude" (Connect to Claude) button in the same dialog: VNami adds itself to Claude's settings (MCP.md, 2a). Claude in the browser cannot be connected — it cannot see the user's computer.

The full specification is in [MCP.md](MCP.md).

### 5.9 Dialogue simulation
- A simple view of a scene **as a chat**: lines appear one by one with the character's name and colour, like in a visual novel.
- **Autoplay** with a pause between lines; can be sped up, or advanced manually.
- Where a block has several lines (a choice), playback stops and shows the **options as buttons**; the chosen option continues the dialogue along its branch.
- Jumps to another scene continue playing in that scene; "End of story" finishes the simulation.
- Start from the scene's start block or from a selected block; can restart from the beginning.
- A separate Simulation section; where a branch breaks, playback stops and explains what is wrong. Details in [FLOWS.md](FLOWS.md), section 17.

### 5.10 App updates
- **Free, via GitHub Releases** of the public repository `ValdekBro/vn-dialogs-builder`. No server needed.
- The app **checks for updates on every launch** and every 4 hours while open. It downloads nothing without being asked.
- A new version shows a banner "Version X available · What's new · **Update**". The button downloads the update (with progress), flushes the project, silently installs and restarts the app. The banner can be closed — it reminds again on the next launch.
- At the bottom of the Projects screen: the app version and "Check for updates".
- **Windows:** full auto-update via the installer. There is no portable build.
- **macOS:** a universal build (`.dmg`, Apple Silicon + Intel). Without a paid Developer ID ($99/year) the app cannot install an update by itself: Squirrel.Mac checks that the new version is signed by the same developer, and an ad-hoc signature does not provide that. So on Mac the app also checks for new versions, but the button is **"Download"**: it opens the release page, and the `.dmg` is dragged into Applications over the old version. First launch: "System Settings → Privacy & Security → Open Anyway".
- How to release a version — [ARCHITECTURE.md](ARCHITECTURE.md), "Updates".

## 6. Post-MVP

- **Character:** avatar.
- Marking which character is the player.
- **Block:** emotion/sprite, author notes, tags.
- Reconnecting the end of an existing link by dragging.
- **Action blocks** (show a sprite, change the background, music, a variable).
- Variables and conditions for options.
- Export to engine and builder formats (Ren'Py, Ink, Yarn, etc.).
- Content localization.
- Extended hotkeys and keyboard navigation between blocks.
- Auto-continue: after Enter the next block's draft opens immediately.

## 7. Decisions made

| # | Question | Decision |
|---|---|---|
| 1 | Platform | Local desktop app only, no web |
| 2 | Storage | App storage, one file per project; the app is the single source of truth |
| 2a | Projects | Many projects, quick switching; project = name + lore description + scenes (+ characters) |
| 2b | Versioning | Separate versions for the storage format and the export format; migrations |
| 3 | MCP | Built into the app, local access only, works only while the app is running; the agent reads, adds and edits freely, and deletes only after human approval |
| 4 | Human + agent | Simultaneous work, real-time updates |
| 5 | Tree or graph | Graph in the model, tree in the MVP UI |
| 6 | Convergence | Branches can merge into a shared block |
| 7 | Block | One character's lines |
| 8 | Branching | Only via several lines in a block; one line — one output |
| 9 | Choice | No separate block type: block = one character's lines, each line has its own output; several lines — a choice |
| 10 | Scenes | A project has several scenes, each a separate graph; characters are shared |
| 11 | "Автор" character | A built-in ordinary character: editable but not deletable |
| 12 | Deletion | Links disappear, orphaned elements turn red; no cascade |
| 13 | Export | Our own JSON; engine formats later |
| 14 | Character fields | Name, colour, description (backstory), speech style |
| 14a | Block fields | MVP — character and text; emotion, notes, tags post-MVP |
| 14b | Choice option | A line of the block: text and output; who the player is — out of scope |
| 14c | End of story | An explicit marker on the output; such an output is not an issue (see [SCHEMA.md](SCHEMA.md)) |
| 14d | Scene description | Optional short text field |
| 14e | Tree orientation | Left to right |
| 14f | Export | Blocked while there are errors; saving — always, every second in the background |
| 15 | UI language | Ukrainian (code, comments and docs are in English) |
| 16 | UX | Scroll, zoom, undo/redo, hotkeys and the rest of section 5.6 |
| 17 | Name | **VNami** (VN + Nanami). The file format keeps the technical identifier `vn-dialogs-builder.*` so old files still open |
| 18 | UI theme | Dark only |
| 19 | Jumps between scenes | In the MVP: an output can lead to the start of another scene (`next: { type: "scene" }`), shown as a link badge |
| 19a | Convergence and cycles | In the MVP: an output can connect to any block of the scene — several links into one block and links back along a branch are allowed |
| 19b | Block placement | Auto layout + manual dragging by the block header; the manual position is stored in the project and not exported |

## 8. Next steps

1. ~~Fix the JSON schema~~ — see [SCHEMA.md](SCHEMA.md).
2. ~~Describe the key user flows~~ — see [FLOWS.md](FLOWS.md). Hotkeys — after the MVP.
3. ~~Specify the MCP tools~~ — see [MCP.md](MCP.md).
4. ~~Choose the technologies~~ — the stack is chosen, see [ARCHITECTURE.md](ARCHITECTURE.md).
5. ~~The `packages/core` core with unit tests~~ — schemas, commands, undo/redo, issues, export.
6. ~~Testing strategy and E2E scenarios~~ — see [TESTING.md](TESTING.md).
7. ~~Electron app skeleton: window, main process, project storage.~~
8. MVP wish list:
   1. ~~Updates (5.10)~~ — done.
   2. ~~Dialogue simulation as a chat with option choice and autoplay (5.9)~~ — done.
   3. ~~MCP server and connection guide (5.8)~~ — done.
