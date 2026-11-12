# VNami — Architecture

> Features and product decisions are described in [OVERVIEW.md](OVERVIEW.md), the data format in [SCHEMA.md](SCHEMA.md), MCP in [MCP.md](MCP.md). This document covers the tech stack and architecture.

## 1. Stack

| Layer | Choice |
|---|---|
| Language | **TypeScript** everywhere |
| Desktop shell | **Electron** (built with **electron-vite**) |
| UI | **React + Vite** |
| Graph canvas | **React Flow** (`@xyflow/react`) |
| Auto layout | **elkjs** |
| State and undo/redo | Own **commands** + **Immer** (patches); **Zustand** in the window |
| Schemas and validation | **Zod** |
| MCP | **`@modelcontextprotocol/sdk`**, Streamable HTTP transport on `127.0.0.1` |
| Styles and components | **Tailwind CSS + shadcn/ui** |
| Hotkeys | **tinykeys** or `react-hotkeys-hook` |
| Tests | **Vitest** (logic), **Playwright** (e2e for Electron) |
| Packaging | **electron-builder** (Windows / macOS / Linux) |
| Monorepo | **pnpm workspaces** |

## 2. Rationale for key decisions

### 2.1 Electron, not Tauri
- The MCP server must share memory with the project model so there is a single source of truth. Electron's main process runs on Node, so the official TS MCP SDK runs right inside it.
- Tauri has a Rust backend. We would have to either rewrite the domain logic and MCP in Rust, or run a separate Node process alongside and sync state with it. Both are more complex.
- The developer has a web background, so all the code stays in TS/React.
- Electron's downside is build size, roughly 100+ MB. That is acceptable for a developer tool.

### 2.2 React Flow for the canvas
- Pan, zoom, fit to screen, minimap, box selection and dragging links come out of the box.
- Nodes are React components with several connection points (handles). So a choice block with a separate output per option is natural to implement.
- Rejected alternatives: JointJS (advanced features are paid), Rete.js (more complex), a custom canvas (too expensive).

### 2.3 elkjs for auto layout
- It respects output order (ports), so arrows from options do not cross.
- It also suits a future view of the full graph with convergence.
- Dagre is simpler but does not understand output order.

### 2.4 Commands + Immer instead of CRDT
- Every change is a **command** executed in the main process.
- Immer's `produceWithPatches` gives forward and inverse patches for each command.
- A shared **undo/redo** history for human and agent actions.
- **Real-time** sync with the window happens by broadcasting patches over IPC.
- Yjs/Automerge (CRDT) are built for several people on different machines. We do not need them, and they would add complexity.

### 2.5 Zod as the shared schema
One schema serves three purposes:
- validating the project file on open and import;
- input schemas of MCP tools (the SDK accepts Zod directly);
- TypeScript types via `z.infer`.

### 2.6 MCP over Streamable HTTP on localhost
- The MCP server must live inside the already running app. So stdio (where the client starts the server process itself) does not fit directly. Instead we use HTTP on `127.0.0.1:<port>`.
- The server listens only on the loopback address, and access is protected by a token.
- Clients (Claude Code, Cursor, etc.) connect by URL.
- For clients that only support stdio (the Claude desktop app) there is a small bridge script: Claude starts the VNami executable in Node mode, and the bridge forwards messages to the HTTP server ([MCP.md](MCP.md), 2a).
- MCP is available only while the app is running with a project open.
- **Deletion approval:** an agent command that deletes content does not run immediately. `ProjectStore` creates an approval request and sends it to the window over IPC. The MCP tool call waits for the human's answer or a timeout. Details in [MCP.md](MCP.md), section 5.9.

### 2.7 Deliberately not used
- **Tauri** — see section 2.1.
- **Redux** — Zustand + Immer are simpler at this scale.
- **A database (SQLite etc.)** — a project is stored in a single JSON file.
- **An i18n library** — the UI is Ukrainian only. Strings live in one module, so other languages are easy to add later.

## 3. Repository structure

```
packages/
  core/                 plain TS, no Electron or React
    schema/             Zod storage schemas: Project, Scene, Character, Block, Line
      migrations/       project file migrations between versions
    export/             export format: Zod schemas, toExport(), fromExport(), export version migrations
    commands/           model-changing commands (addBlock, setNext, deleteCharacter, ...)
    history/            undo/redo based on Immer patches
    issues/             issue detection (unreachable blocks, dangling outputs, ...)
    queries/            search and filtering
apps/
  desktop/
    main/               Electron main process
      project-store/    the current project in memory, command execution, history
      persistence/      file read/write, autosave
      mcp/              MCP server, tools as wrappers over core commands, stdio bridge
      ipc/              main ↔ renderer bridge
    preload/            safe API for the renderer (contextBridge)
    renderer/           React UI
      canvas/           React Flow, custom nodes, elkjs layout
      views/            builder, characters, project info
      store/            Zustand mirror of the state
      strings/          Ukrainian UI strings
```

`core` is the heart of the system. Both the UI and MCP use it, and it is fully covered by unit tests.

## 4. Data flow

```
 Human (UI)                          AI agent
     │                                   │
     │ IPC: command                      │ MCP tool call (HTTP, localhost)
     ▼                                   ▼
 ┌─────────────────── Electron main ───────────────────┐
 │  ProjectStore                                        │
 │   ├─ runs the command (core/commands) via Immer      │
 │   ├─ records patches in History (undo/redo)          │
 │   ├─ recomputes issues (core/issues)                 │
 │   └─ schedules autosave to the file                  │
 └──────────────────────────────────────────────────────┘
     │ IPC: patches                       │ tool result
     ▼                                    ▼
 Renderer (Zustand applies patches)     Agent
```

- The **source of truth** is `ProjectStore` in the main process.
- The renderer never changes the model itself; it only sends commands and receives patches.
- Undo/redo are commands too. They can be called from the UI (Ctrl/Cmd+Z) and from MCP.
- Node positions on the canvas are computed by the layout (elkjs) and do not go into the model. The exception is blocks the human moved manually: their position is stored in the block's `pos` field (SCHEMA.md) and overlaid on the auto layout; the block's service nodes (`(+)`, "End", jumps) move with it (`applyPinned` in `canvas/layout.ts`).

## 5. Storage

- **App storage:** the app data folder (`app.getPath("userData")`), e.g. on macOS `~/Library/Application Support/VNami/`:
  ```
  projects/
    prj_Zx7vB4nM2q.json        project file
    prj_Zx7vB4nM2q.v1.bak.json backup before migration (when needed)
  settings.json                last open project, MCP port and token, settings
  ```
- **The project list** is built by scanning `projects/`: `id`, `name`, `description`, scene count and file modification date are read from each file. There is no separate index, so it cannot go out of sync.
- **Switching projects:** the current project is flushed, the undo history is cleared, and the other one is loaded. MCP immediately works with the new active project.
- JSON is indented, and keys come in a stable order.
- Every entity has a stable ID.
- **Versioning:** the project file has the storage format `version`, and the export file has its own independent `version`. Migrations, backups and behaviour with newer files are described in [SCHEMA.md](SCHEMA.md), sections 7–8.
- **Atomic writes:** first to a temporary file, then a rename.
- **Autosave:** a timer checks the "unsaved changes" flag once a second and writes the file if it is set. Saving does not depend on whether the project has issues.
- **Export** builds a separate file via `toExport()` and is allowed only when `core/issues` finds no issue with `severity: "error"`. The user saves the file anywhere via the system dialog.
- **Import** accepts an export file of any supported version, migrates it, validates it with the Zod schema and creates a new project from it.

### Windows build

```bash
pnpm dist:win
```

- Output in `apps/desktop/release/`: the installer `VNami-Setup-<version>.exe` (x64). There is no portable build: only the installer can update itself.
- All dependencies are bundled into the built files (`out/`), so only those go into the package.
- It can be built on macOS too. Without Wine the `.exe` icon and metadata are not changed (`signAndEditExecutable: false`), and there is no code signing yet, so Windows SmartScreen warns on first launch.
- `pnpm` must be on PATH for the build (`corepack enable`).
- This is a local build for checking. Real releases are built by GitHub Actions (below).

### Updates

- **Source:** GitHub Releases of the public repository `ValdekBro/vn-dialogs-builder` (`publish` in `electron-builder.yml`). A release contains `VNami-Setup-X.Y.Z.exe`, `.blockmap` and `latest.yml` with the version number. Free.
- **In the app:** `src/main/updater.ts` on `electron-updater`. Checks 5 s after launch and every 4 h; `autoDownload` is off. The state (`UpdateState` in `shared/api.ts`) reaches the window as an `update` event; the window shows a banner (`UpdateBanner`) and a "Check for updates" button on the Projects screen. "Update" → download → `store.dispose()` (flush) → `quitAndInstall` (silent install and restart). A background check without internet shows nothing.
- **Windows** — the full cycle (download and install). **macOS** — check only (`Updater.downloadOnly`): state `available` with `manual: true`, and the "Download" button opens the release page. Reason: Squirrel.Mac installs an update only if it is signed with the same Developer ID, and we have an ad-hoc signature (`mac.identity: "-"`, `hardenedRuntime: false` in `electron-builder.yml`). With a Developer ID it is enough to remove `downloadOnly` and add signing and notarization in CI. In `dev` and on Linux the state is `unsupported`.
- Mac has two builds (`--arm64 --x64`; a universal one would carry two copies of Electron): `VNami-X.Y.Z-mac-arm64.dmg` and `VNami-X.Y.Z-mac-x64.dmg` for people, and the matching `.zip` files + `latest-mac.yml`, which the app uses to see new versions. Locally: `pnpm dist:mac`.
- **Releasing a version:**
  1. Add a `## [0.2.0] — <date>` section to `CHANGELOG.md`: what is new, what changed, what was fixed — for users, not developers. This text becomes the GitHub release notes. Commit.
  2. `pnpm release 0.2.0` (the script refuses without the CHANGELOG section) — bumps the version in `package.json` (root and `apps/desktop`), commits, tags `v0.2.0` and pushes.
  3. GitHub Actions (`.github/workflows/release.yml`):
     - `prepare` (Linux): the tag matches the version, typecheck and tests, a draft release (`gh release create --draft`);
     - `build` — in parallel `windows-latest` (installer with `.exe` icon and metadata; Windows has rcedit) and `macos-latest` (`.dmg` + `.zip` for arm64 and x64); electron-builder uploads the files into the draft (`--publish always`, `GITHUB_TOKEN`);
     - `publish`: the draft becomes a published release.
     The draft is created once up front, so parallel uploads do not create several releases for the same tag.
  4. CI takes the release notes from `CHANGELOG.md` (`scripts/changelog.mjs`). The "What's new" link in the app leads to the release page.
- GitHub Actions minutes are free for a public repository.
- There is no code signing: SmartScreen warns on first install; updates are not affected.

## 6. Security

- MCP listens only on `127.0.0.1`.
- MCP access is protected by a token that the app generates and shows in the "Connect an AI agent" dialog together with a ready-made connect command.
- In Electron: `contextIsolation: true`, `nodeIntegration: false`. The renderer talks to main only through a narrow API in preload.

## 7. Testing

The full strategy and list of scenarios are in [TESTING.md](TESTING.md). In short:
- **Vitest** for `core`: commands, undo/redo, issue detection, schemas. This is the main coverage.
- **Vitest** + a real MCP client for the MCP tools over `ProjectStore`, and for the stdio bridge.
- **Playwright E2E** (on request only, for regression checks) runs the real Electron app with a separate data folder and walks through the FLOWS.md scenarios by clicking and typing: from creating blocks to working together with an agent via MCP.
- For testability the app has a test mode (`VN_E2E=1`), a data folder from env (`VN_USER_DATA_DIR`), a Claude config override (`VN_CLAUDE_CONFIG`) and stable selectors (`data-testid` with entity IDs).
