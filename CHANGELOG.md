# VNami changelog

Changes in every version. The GitHub release notes are taken from here automatically
(the `## [X.Y.Z]` section), so add the new version's section before `pnpm release X.Y.Z`.
Written for people who use the app: what is new, what changed, what was fixed.

## [0.4.0] — 2026-11-12

### New
- **Dialogue simulation.** The new "Simulation" section plays a scene as a chat, the way a player will read it: lines appear one by one with the character's name and colour, choices become buttons, jumps to other scenes keep playing. Autoplay paces itself by line length, with speeds from 0.5× to 3×; a click or Space shows the next line right away. Start from any block with ▶ on the canvas, or from the scene list in the section. If a branch breaks — an unconnected output, a block without a character, empty text — playback stops, says what is wrong and shows the spot in the builder.
- **Works with the Claude app, not only Claude Code.** In "Connect an AI agent" pick Claude → Claude chat and press "Connect to Claude": VNami adds itself to the Claude desktop app's settings without changing anything else there. Restart Claude, and you can ask it to write dialogue right in the chat. No need to install Node.js. If VNami is closed, Claude gets a clear "open VNami" message.
- **A simpler "Connect an AI agent".** The dialog first asks which AI you use — Claude chat, Claude Code, Cursor or another agent — and then shows only what that one needs. The choice is remembered; "Other ways to connect" asks again.
- **Managing scenes.** Hovering a scene in the list shows rename, duplicate and delete buttons. Scenes can be reordered by dragging. Deleting a scene with content asks first and says what will be lost; any deletion can be undone.
- **Issues list.** The ⚠ counter in the top bar shows how many errors the project has; a click lists them for the current scene or the whole project, and a click on an issue takes you straight to the block.
- **Copy, cut and paste blocks.** Ctrl/Cmd+C, X and V work on the selected blocks, including between scenes and projects; the pasted copy is selected so you can move it right away. The ⧉ button on a block duplicates it.

### Changed
- The character colour picker is now a round swatch with a palette and "Custom colour…" instead of the system's square box.
- Removed the extra notes about the agent under the lore and speech style fields.

### Fixed
- "Show" on an agent's deletion request and other jumps to a block now also highlight it, even when its scene has just opened.

## [0.3.0] — 2026-11-12

### New
- **AI agents write dialogue right in the app.** VNami has a built-in MCP server: Claude Code, Cursor and other agents can read the project and add or edit scenes, blocks, lines and characters. Agent changes are highlighted on the canvas and undone with the usual Ctrl/Cmd+Z.
- **Agent deletions only with your permission.** When an agent wants to delete something, a panel appears: what exactly will disappear, the agent's reason, a timer and "Approve" / "Reject" buttons. Blocks to be deleted are highlighted red.
- **The 🤖 button in the top bar** shows whether an agent is connected and whether it is working right now. A click opens "Connect an AI agent": a ready-made prompt you just send to the agent so it connects itself, plus a command for Claude Code and a config for other clients.
- **macOS version** — one `.dmg` for Apple Silicon and Intel. The app tells you about new versions; on Mac the "Download" button opens the release page.

### Fixed
- The build no longer creates two identical releases on GitHub.

### Installing on Mac
On first launch macOS says it cannot verify the developer. Open "System Settings → Privacy & Security" and click "Open Anyway" — this is needed only once.

## [0.1.1] — 2026-11-12

The first public release.

### New
- **Dialogue canvas:** line blocks, player choices (several lines in a block), convergence and cycles, jumps to the start of another scene, "End of story".
- Creating blocks right on the canvas via `(+)`, inserting between blocks, connecting by dragging, disconnecting a link.
- **Manual placement:** a block can be dragged by its header; the position is saved, and "Auto layout" puts everything back.
- Characters, scenes, project description, issue counter and highlighting, undo/redo, autosave.
- **Updates:** the app checks for new versions on launch and updates with a single "Update" button (Windows).
