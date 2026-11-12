# VNami — User Flows

> How a human works in the editor. Features are described in [OVERVIEW.md](OVERVIEW.md), the data model in [SCHEMA.md](SCHEMA.md).
>
> The UI is in Ukrainian; button and label names are quoted in English here, with the Ukrainian original where it helps to find the element.

## 0. UX principles

1. **Action where it is needed.** Buttons appear right where something can be added or changed. No hunting through menus.
2. **Creation in place.** A new block appears right where it will stand, as a "draft" that only needs filling in. There are no modal windows for creation.
3. **Minimum clicks.** Autofocus in the right field, picking and typing without extra windows.
4. **The tree grows left to right**, because the app runs on a wide computer screen. Block and option outputs are on the block's right edge.
5. **Nothing is scary to break.** Any action can be undone (Ctrl/Cmd+Z). After a deletion a notification with an "Undo" button appears.
6. **A living canvas.** After every change the layout smoothly (animated) rearranges, and the canvas scrolls to the new block by itself.
7. **Mouse first.** Extended hotkeys and keyboard navigation come after the MVP. In the MVP only basic keys work: Enter / Shift+Enter / Esc in inputs, Ctrl/Cmd+Z / Shift+Z, Delete, Ctrl/Cmd+C/X/V.

## 1. Canvas anatomy

An open project has three sections; the switch between them is in the top bar:
- **Dialogues** ("Діалоги") — the builder: scene list and canvas. Nothing extra, only dialogue work.
- **Characters** ("Персонажі") — a separate section with a page for each character (section 10).
- **About project** ("Про проєкт") — name, lore description and short stats (section 15).

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ Project ▾ │ [Dialogues] Characters  About │ 🔍  ⚠ 2 │ 🤖 │ Saved ↶ ↷        │
 ├───────────┬─────────────────────────────────────────────────────────────────┤
 │ SCENES  + │ Ранок — Дорогою до криниці ГГ зустрічає Бена.                   │
 │ ▸ Ранок   │                                                                 │
 │   Криниця │  ┌───────────────────┐    ┌──────────────────────────┐          │
 │           │  │ ● Бен             │    │ ● ГГ                  ◇  │          │
 │           │  │ Привіт, ГГ! Відра ├───►│ ◇ О, Бене, візьми одне   ├──► …     │
 │           │  │ не надто важкі?…  │    │   відро.                 │          │
 │           │  └───────────────────┘    │ ◇ Дякую, але я сама      ├── (+) ⇥  │
 │           │                           │   впораюся.              │          │
 │           │                           └──────────[+ Option]──────┘          │
 │           │                                              [minimap]          │
 └───────────┴─────────────────────────────────────────────────────────────────┘
```

- **Builder left panel:** scenes only.
- **Top bar:** project, section switch, search, issue counter, agent indicator, save state, undo/redo.
- **Canvas:** blocks, links, `(+)` buttons, minimap, zoom and "fit all" buttons.
- A block's character is picked right on the canvas (section 4), so you never need to go to the Characters section to work on dialogue.

## 2. A block on the canvas

A block is a character and their lines. There is no separate "choice block" type: a block with one line is an ordinary dialogue step, with several — a player choice.

- **Header:** a colour dot and the character's name. Clicking the name opens the character picker.
- **Lines:** each line is a separate row with **its own output on the block's right edge**. A single line shows up to 4 lines of text; in a choice each option shows up to 2 lines with a `◇` marker. The full text is visible while editing or in a hover tooltip.
- **A choice** (several lines) has a violet frame and `◇` markers, so it stands out from an ordinary line at once.
- **Badges:** `⚑ start` on the start block. A block with an issue has a red frame, and hovering `⚠` shows what exactly is wrong.
- **Hover action bar** (small icons above the block):
  - `⚑` make it the start block;
  - `↶` return to auto layout (only on a manually moved block, section 8a);
  - `🗑` delete.
- **The header** (`⋮⋮` marker) is the block's drag handle (section 8a).

  Collapsing a branch and duplicating come later.
- **The `+ Option` button** ("+ Варіант") under the block (on hover) adds another line — that is how a block becomes a choice.
- **Tooltips:** every button shows a one- or few-word tooltip on hover saying what it does.
- **Context menu** (right click) with the same actions — later.

## 3. Outputs and the `(+)` button

Every **unconnected output** (`next = null`) has a short stub line in the link style with a `(+)` button at its end.

```
  [ block ]──────(+) ⇥        an ordinary line with no continuation
  ◇ Option ──────(+) ⇥        an option with no continuation
  [ block ]──────[→ Далі: Біля криниці]   a jump to the start of another scene
```

- **Clicking `(+)`** ("New block") creates a new block (section 4).
- **On hover** a **"Next"** ("Далі") button appears to the right of `(+)`. It opens a menu (which also contains "Connect to block", section 8):
  - **go to the start of a scene** — a list of the project's other scenes;
  - **"+ New scene"** — creates a scene and leads into it right away;
  - **"End of story"** — the "END" marker.

  The button stays visible while the cursor is over `(+)` or over it, and the menu stays until an item is picked (Esc or a click outside closes it).
- **A jump to a scene** is shown at the end of the output as a link badge "→ Далі: Scene name". Clicking it opens that scene; `×` on hover removes the jump (the output gets `(+)` again). A jump into an empty scene is an error until that scene has a start block.
- The same "Next" menu has "Connect to block" — a list of the scene's blocks the output can be connected to (section 8).
- The stub of an unconnected output is **reddish**, because it is an issue. The "END" marker is neutral grey.

The "END" marker is removed by clicking it (tooltip "Remove end"): the output gets `(+)` again.

## 4. Creating a block (the main scenario)

1. The user clicks `(+)` on an output.
2. The layout makes room with an animation, and a **draft** — a block with a dashed frame — appears **in place of the future block**.
3. The draft immediately opens the **character picker**:
   - characters are shown in the same order as in the character list;
   - the list filters while typing: an exact match and a prefix match come first; Enter picks the highlighted character, and ↑/↓ move the highlight;
   - if no such name exists, **"+ Create character «Name»"** comes first. The character is created at once with an automatic colour, and the text field opens without waiting, so you can keep typing.
4. After picking a character the focus moves to the **line input**:
   - Enter saves the block;
   - Shift+Enter adds a new line to the text;
   - Esc cancels: the draft disappears, and nothing is created.
5. The **`+ Option`** button in the draft adds another line input — the block becomes a choice. Enter in any input saves the whole block; empty inputs are skipped.
6. After saving, the draft becomes an ordinary block, and every free output gets its own `(+)`.
7. Every saved block is a separate undo step.

> **Post-MVP: auto-continue.** After Enter the next draft opens right away to the right of the block just created, so a linear dialogue can be written without the mouse: character, text, Enter… Esc or Enter on empty text stops the chain.

**Empty scene.** The canvas centre has a big `(+) Add the first block` button. The first block created automatically becomes the start block.

## 5. Inserting a block between existing ones

- Hovering a **link line** shows `+` ("Insert block") and `×` ("Disconnect") in its middle.
- `+` opens a draft **between** the two blocks. The layout spreads the tree apart, and the rest goes as in section 4. The new block's first line takes over the old continuation, so the chain does not break.

## 6. Choice (several lines)

- **Add an option:** the `+ Option` button under any block. An input appears: Enter adds the line and immediately opens an input for the next one; Esc or Enter on an empty input finishes. Existing lines and links do not change.
- **Editing a line's text:** double-click.
- **Option order:** dragging by the `⋮⋮` handle to the left of the option (later).
- **Deleting an option:** the `×` icon when hovering the line (only when there are several lines). That option's continuation becomes orphaned and is highlighted red. The block's last line cannot be deleted — the block itself is deleted instead.
- If one line remains, the block looks like an ordinary line again.

## 7. Editing a block

- **Line text:** double-click opens in-place editing. Enter or a click outside the block saves, Shift+Enter adds a new line, and Esc cancels the changes.
- **Character:** clicking the name in the header opens the same character picker as during creation.
- There is no separate properties panel in the MVP: everything is edited right on the block.

## 8. Links

- **Create:**
  - together with a new block — via `(+)` on an output (section 4) or an insert on a line (section 5);
  - to an **existing block** — drag from the output point (the circle to the right of the line) and release anywhere on the block; while dragging, blocks that can be connected are highlighted blue. Or the "Next" menu next to `(+)` → "Connect to block" (the scene's block list).
  - Releasing the drag on empty space creates a new block there (section 4).
- **Delete:** hover the link and press `×` ("Disconnect"). The output gets `(+)` again.
- **Convergence** (several links into one block) — ordinary lines like all other links; the block is shown once.
- **Cycles** (a link back to a block higher up the branch or into the same block, e.g. returning to a question menu) are allowed. Such a line goes right to left, so it is drawn dashed above the blocks to keep it visible and disconnectable.
- **After the MVP:** reconnecting the end of an existing line by dragging.

## 8a. Block placement

- Blocks are laid out **automatically** (left to right, no overlaps). The automation does not always place a block where it suits a person: e.g. a long link may run under other blocks.
- **Moving manually:** the block header is the drag handle (`⋮⋮` marker on the left, a "hand" cursor). It can be grabbed anywhere in the header except the character name (clicking it changes the character). The block follows the mouse together with its `(+)`, "End" and jump badges. If several blocks are selected, they move together. Lines are not drag handles, so they do not get in the way of selecting and editing text.
- A moved block **stays where it was put**, and the position is saved in the project (the `pos` field, [SCHEMA.md](SCHEMA.md)). The other blocks keep being laid out automatically. A drag is one action that can be undone.
- **Returning to place:** the `↶` button in a moved block's action bar. The "Auto layout" button under the zoom buttons (visible only when the scene has moved blocks) returns all the scene's blocks to auto layout.
- Copies of blocks (paste, scene duplication) appear in auto layout.

## 9. Selection, copying, deletion

- **Selection:** click a block. Shift/Ctrl+click adds a block to the selection; a mouse box selects several blocks.
- **Deletion by the human:** `🗑` or Delete. **No confirmation dialog:** a notification "Deleted 3 blocks · Undo" appears. Links that led into the deleted blocks become red `(+)`.
- **Copying:** Ctrl/Cmd+C/X/V, or duplicating via `⧉`. A pasted copy gets new IDs and appears as a separate branch that can be connected to the right output. Copying works between scenes too.

## 10. Characters

A separate Characters section, so it does not take space next to the canvas.

- **List on the left:** colour dot, name and line count. The `+` button creates a character with an automatic colour and opens their page right away.
- **The selected character's page on the right:**
  - colour (palette + custom colour) and name;
  - description and backstory — a large field;
  - speech style — with a hint that the agent follows it when writing lines;
  - scenes where the character speaks, with line counts. Clicking a scene opens it in the builder;
  - a delete button.
- Changes are saved immediately, as everywhere.
- **Deletion:**
  - if the character has no lines, they are deleted right away, with an "Undo" notification;
  - if they do, a **confirmation dialog** appears: "Оля has 14 lines. They will be left without a character and marked red." A dialog fits here because the change affects many places;
  - "Автор" has no delete button.
- **Creating from the builder:** the canvas character picker has "+ Create character" (section 4). It creates a character with just a name; the other fields are filled in later in this section.

## 11. Scenes

- **List** in the left panel. A click opens the scene; the current scene is highlighted.
- **`+ scene`** creates a new row with an active name input and opens the scene right away with an "Add the first block" button.
- **Double-click** on a name renames it.
- **The scene description** is shown under the name at the top of the canvas, and clicking it allows editing. Without a description a grey "Add a description…" placeholder stands there.
- **Scene order** changes by dragging in the list.
- **Context menu:** rename, duplicate, delete. Deleting a non-empty scene asks for confirmation.
- **Start block:** `⚑` in the block's action bar.

## 12. Issues

- A block or output with an issue has a red frame or a red stub. This marks **every unfinished spot**: a block without a character (e.g. after a character was deleted: the text stays, the character field is empty), empty text, an unconnected output, an unreachable block.
- **While the project has errors, export is blocked.** The "Export" button is disabled, and its tooltip shows the error count and opens the list. Warnings do not block export.
- Saving **does not depend** on errors: project state is always saved (section 15).
- **The `⚠ N` counter** in the top bar opens the current scene's issue list, and a switch shows the whole project's. Clicking an issue moves the canvas to it and highlights the spot.
- The issue count is also shown next to each scene in the scene list.

## 13. Navigation

- **Pan:** drag the background or scroll with the trackpad.
- **Zoom:** wheel with Ctrl/Cmd or pinch on the trackpad. There are also `−` / `+` buttons and a `⤢ fit all` button.
- **Minimap** in a canvas corner. Clicking it moves the view to that spot.
- **Collapsing branches:** `▾` on a block.
- **Search:** a field in the top bar. Matches are highlighted, Enter goes to the next match, and a "3 of 12" counter is shown next to it. You can search in the current scene or the whole project.

## 14. Working together with the agent

- **The `🤖` indicator in the top bar:** grey means the agent is not connected; green — connected (made calls in the last 2 minutes); it pulses when the agent just did something; red — the MCP server did not start (e.g. the port is taken). A click opens "Connect an AI agent": server state, a ready-made prompt to send to the agent, a "Connect to Claude" button for the Claude desktop app, a command for Claude Code and a config for other clients with a "Copy" button, the URL and the token (hidden, can be shown). The same window opens from the Projects screen.
- **Agent changes** are highlighted on the canvas: new or changed blocks glow for a few seconds. If a change is off screen, a notification "The agent added 5 blocks · Show" appears.
- The canvas **does not jump by itself** to agent changes, so it does not disturb the human. You can go to them with the "Show" button.
- **A deletion request from the agent** appears as a panel over the canvas but does not block work:
  - it shows what the agent wants to delete and the reason (`reason`);
  - blocks to be deleted are highlighted, and arrows that will disappear are dashed;
  - "Approve" / "Reject" buttons and a timer showing how much time is left to answer.
- If the human is editing a block the agent changes, the agent's change applies after the human saves or cancels their edit. Text the human is typing is never overwritten.

## 15. Projects

A project is a set of scenes (and the characters who speak in them) with a **name** and a **long lore description**. The app stores all projects in its own storage, so there is no need to look for files on disk.

- **First launch:** the Projects screen with a big "Create project" button.
- **The Projects screen:** a list of cards with the name, the start of the lore description, the scene count and the last modification date. Projects are created, opened, renamed, duplicated and deleted from here. Deletion needs confirmation.
- **Switching projects:** the project name on the left of the top bar is a dropdown. It lists projects for quick switching, a "+ New project" item and an "All projects…" item that opens the Projects screen. Switching is instant, because the current project is already autosaved.
- **New project:** the user types only a name. The project is created with the "Автор" character and an empty "Сцена 1" scene, which opens right away.
- **The About project section:** a separate section (not a panel next to the canvas) with the name, a large field for the lore description and short stats: scenes, characters, lines and errors. The agent also reads the lore description as context.
- On launch the app opens the last project worked on.
- **Autosave** runs constantly in the background: unsaved changes are written **every second**. There is no "Save" button. The top bar shows "Saved" / "Saving…".
- **JSON export:** the project menu. Available only when the project has no errors (section 12). The result is a file in a separate, versioned export format (see [SCHEMA.md](SCHEMA.md)).
- **JSON import:** on the Projects screen. Creates a new project from an export file.
- **App updates:** projects saved by an older version are upgraded to the new format automatically on open. The app makes a backup first.

## 16. Decisions made

| Question | Decision |
|---|---|
| Tree orientation | Left to right |
| Speaker hint in the draft | Not needed in the MVP |
| Deletion by the human | Blocks — no confirmation, with "Undo"; a character with lines and a non-empty scene — with confirmation |
| Blocks of a deleted character | They stay with an empty character and are highlighted red |
| Export | Blocked while the project has errors |
| Autosave | Every second in the background when there are changes |
| Auto-continue after Enter | Post-MVP |
| Projects | Several projects in the app's storage, quick switching; a project has a name and a lore description |
| Block placement | Auto layout + manual dragging by the header (section 8a) |
