# VNami changelog

Changes in every version. The GitHub release notes are taken from here automatically
(the `## [X.Y.Z]` section), so add the new version's section before `pnpm release X.Y.Z`.
Written for people who use the app: what is new, what changed, what was fixed.

## [Unreleased]

### New
- **Connect the Claude app** (not only Claude Code). The 🤖 "Connect an AI agent" dialog now has a "Connect to Claude" button: it adds VNami to the Claude desktop app's settings without changing anything else there. Restart Claude afterwards, and you can ask it to write dialogue right in the chat. No need to install Node.js.
- If VNami is closed, Claude gets a clear "open VNami" message instead of a connection error.

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
