# VNami — Testing

> How the app is tested. Features are described in [OVERVIEW.md](OVERVIEW.md), UI scenarios in [FLOWS.md](FLOWS.md), the architecture in [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Test levels

| Level | Tool | What it checks | Location |
|---|---|---|---|
| Unit | **Vitest** | Core: schemas, commands, undo/redo, issues, export | `packages/core/test` |
| Renderer logic | **Vitest** | Pure UI logic without React: canvas projection, playback engine and store. Tests that import renderer modules live in `test/renderer` and are typechecked with the web (DOM) config | `apps/desktop/test` |
| MCP integration | **Vitest** + a real MCP client from the SDK | MCP tools over HTTP on top of `ProjectStore`, without a window; the stdio bridge for the Claude app | `apps/desktop/test` |
| **E2E** | **Playwright** (`_electron`) | **The real app**: launch, clicks, typing, restart, working together with an agent | `apps/desktop/e2e` |

The core logic is covered by unit tests because they are fast. E2E tests check what unit tests cannot see: the UI, the bridge between the window and the main process (IPC, preload), saving to disk, and MCP on top of an open window.

## 2. E2E: the real app, not a simulation

An E2E test **launches the built Electron app** via Playwright's `_electron.launch()` and works with the window like a person: clicks buttons, types text, drags links, presses Ctrl/Cmd+Z, closes and reopens the app.

- A simulation (the window in a browser with faked IPC) is not used as the main level. It misses exactly the bugs E2E exists for: preload, IPC, files, MCP.
- Playwright can also run code in the main process (`electronApp.evaluate`). This is needed for system dialogs: the test substitutes a file path instead of the "Save as" window.
- For every test the app starts with a **clean, separate data folder**, so tests do not affect each other and never touch your real projects.
- A test must never be able to write configs of other apps on the machine (e.g. the Claude desktop app config): such paths are always overridden (`VN_CLAUDE_CONFIG`) and checked before any action that writes.

## 3. What the app does for testability

1. **Data folder from env.** `VN_USER_DATA_DIR=<temp folder>` replaces `app.getPath("userData")`. Before launch a test can put ready-made projects (seeds) there.
2. **Test mode** `VN_E2E=1` (`src/main/index.ts`):
   - CSS transitions and animations are off, so clicks land where the element ends up;
   - autosave runs every 50 ms instead of every second;
   - MCP listens on a random free port; the test reads the port and token from `globalThis.__vnE2E.mcp()` in the main process;
   - `VN_E2E_APPROVAL_SEC` shortens the deletion approval timeout to test `timeout`;
   - update checks are off;
   - `VN_E2E_HIDDEN=1` keeps the window hidden (it still renders fully).
   - `VN_E2E_ANIMATIONS=1` keeps transitions on — used by `pnpm --filter @vn/desktop showcase`, which records the README media from the real app (`apps/desktop/showcase`).
   - The Claude app config path (`VN_CLAUDE_CONFIG`) always points into the test's temp folder.
3. **Stable selectors.**
   - Elements are found by role and label (`getByRole("button", { name: "Додати блок" })`). This way the test also checks UI accessibility.
   - Where there is no label (canvas nodes, outputs, `(+)`), a `data-testid` with the entity ID is used: `block-<blockId>`, `add-<lineId>` for the `(+)` on a line's output.
   - Ukrainian labels are taken from the same `strings` module the UI uses. Changing a button's text does not break tests.
4. **The model state is available to tests.** In test mode preload exposes a read-only `window.__vnTest.getProject()`. The test clicks in the UI and checks the result both on screen and in the model.

## 4. Helper layer

Tests do not work with raw selectors; they use the helpers in `e2e/support`:

```ts
test.use({ launch: { seed: [prologue()] } });          // clean folder + a ready project, opened on start

test("…", async ({ vn }) => {
  await vn.canvas.addAfter(lineId).click();            // (+) on a line's output
  await vn.draft.pickCharacter("Бен");                 // character in the block draft (creates it if new)
  await vn.draft.line().fill("Привіт, ГГ! Може, допомогти донести?");
  await vn.draft.line().press("Enter");
  const project = await vn.project();                  // the model the window works on
  const again = await vn.restart();                    // close and reopen with the same folder
  const agent = await vn.connectAgent();               // a real MCP client
  await vn.stubSaveDialog(path);                       // "Save as" returns this path
});
```

- `e2e/support/app.ts` — the `vn` fixture (`VnApp`): launch, `restart`, `project`, `connectAgent`, `stubSaveDialog` / `stubOpenDialog`, and small page objects `canvas`, `draft`, `topBar`, `toast`. When a test fails, the main-process log is attached to the report.
- `e2e/support/seeds.ts` — seed projects built with core commands: `prologue()` (the «Ранок» scene with a choice, a jump to «Біля криниці» and one unconnected option) and `lastTram()` (a clean project with no errors).
- Custom matchers (`toHaveIssue`, `toBeConnectedTo`, `toBeHighlightedAsAgentChange`) are planned for when the remaining scenarios are written.

## 5. E2E scenarios

Each scenario is tied to a FLOWS.md section. **Written so far** (`apps/desktop/e2e`): E1, E2–E4, E5 (without reordering by drag), E9, E15, E17, E19, E20, E22, E24. The rest are next.

| # | Scenario | Steps and checks | FLOWS |
|---|---|---|---|
| E1 | First launch | Empty folder → "Projects" screen → create a project → the "Сцена 1" canvas opens, characters include "Автор" | 15 |
| E2 | First block | `(+)` on an empty scene → pick "Автор" → type text → Enter → the block is the start block, its output is red with `(+)` | 3, 4 |
| E3 | Chain | Several blocks in a row via `(+)`; Shift+Enter inserts a line break; Esc cancels the draft without changes | 4 |
| E4 | New character from the picker | "+ Створити персонажа" → name → it is immediately selected in the block and appears in the Characters section | 4, 10 |
| E5 | Choice | `+ Варіант` in the draft or under a block → several lines → `(+)` from each → reorder by dragging | 6 |
| E6 | Insert between blocks | `(+)` in the middle of a link → a new block between two, the old link continued | 5 |
| E7 | Convergence | Drag from an output onto an existing block, and via the menu → both links are ordinary lines into one block; a back link to a block higher up the branch (a cycle) is drawn dashed and can be disconnected | 8 |
| E8 | End of story | `■` on an output → red disappears, the issue counter goes down | 3, 12 |
| E9 | Undo/redo | A series of actions → Ctrl/Cmd+Z reverts each → Shift+Ctrl/Cmd+Z redoes | 0 |
| E10 | Deleting a block | Delete a block → "Undo" toast → links turn red → "Undo" restores everything | 9 |
| E11 | Copying | Copy a branch → paste into this and another scene → new IDs, a separate branch | 9 |
| E12 | Deleting a character | Confirmation → their blocks remain, without a character and red | 10 |
| E13 | Scenes | Create, rename, reorder, description above the canvas, delete a non-empty one with confirmation | 11 |
| E14 | Issues | Issues panel → a click goes to the block → "Export" is disabled while there are errors; warnings do not block it | 12 |
| E15 | Autosave | Changes → app restart → everything is in place, the last project and scene are open | 15 |
| E16 | Projects | Create a second project, switch, rename, duplicate, delete, edit lore | 15 |
| E17 | Export and import | Export to a file (dialog substituted) → the file passes the schema → import creates a new project with the same content | 15 |
| E18 | File versions | A project with a newer version → "update the app" message, file unchanged. An older version → migration and backup | 15 |
| E19 | Agent creates | MCP `add_tree` → blocks appear on the canvas with the agent highlight | 14 |
| E20 | Agent deletes | `delete_blocks` → approval panel with highlighted blocks → "Reject" gives `rejected`; retry → "Approve" gives `approved`; no answer — `timeout` | 14 |
| E21 | Agent and human at once | The human edits a block's text, the agent changes the same block → the agent's change applies after editing ends, nothing is lost | 14 |
| E22 | Undoing an agent action | The agent added blocks → the human presses Ctrl/Cmd+Z → the agent's changes are undone | 14 |
| E24 | Simulation | `▶` on a block → the Simulation section plays from it; autoplay reaches the choice → key "2" → the branch continues into the next scene and ends with "End of story"; restart → another option leads nowhere → red panel → "Show in builder" highlights the block; pause holds, Space advances | 17 |
| E23 | Canvas | Zoom, fit all, manual block placement and auto layout | 1, 8a |

## 6. Diagnosing failures

- When a test fails, a **Playwright trace** (every step with a DOM snapshot) and a **screenshot** of the window are saved (video — not yet). Open the trace with `pnpm exec playwright show-trace`.
- The main-process log (and the window's console) is attached to the report of a failed test.
- **Comparison screenshots** (`toHaveScreenshot`, not yet) will be taken only for a few key canvas states (block, choice, issues, agent highlight). Screenshots are stored per OS, because fonts differ.

## 7. When what runs

| Tests | When | Command |
|---|---|---|
| Unit and MCP integration | **After every meaningful code change**: after changing logic, before considering a task done. Not needed after docs- or text-only changes | `pnpm test` |
| E2E | **On request only**: when several features are done and you need to make sure nothing broke (a regression run), or before a release | `pnpm e2e` |

- `pnpm test` never runs E2E. Unit tests must stay fast (seconds), so they can be run all the time.
- E2E is slow (minutes, windows on screen), so it does not run automatically after changes.
- A single E2E scenario can be run while working on a feature to debug it: `pnpm e2e -g "E5"`. The full run happens only on request.

```bash
pnpm test            # unit and MCP integration
pnpm e2e             # builds the app and runs all E2E
pnpm e2e -g "E5"     # one scenario
pnpm e2e --ui        # Playwright interactive mode: every step is visible
```

- Locally the app windows appear on screen: you can watch the test click. For background runs there is `VN_E2E_HIDDEN=1`: the window is not shown but fully renders.
- **CI:** releases run typecheck and unit tests (`.github/workflows/release.yml`). E2E in CI is manual: Actions → **E2E** → Run workflow (`.github/workflows/e2e.yml`), optionally with a scenario filter. It runs on macOS, Windows and Linux (via `xvfb`); the HTML report and traces of failed tests are uploaded as artifacts.
- Results go to `apps/desktop/e2e-results` (traces, screenshots) and `apps/desktop/playwright-report` (`pnpm exec playwright show-report`); both are git-ignored.

## 8. Development rule

- Every new UI feature comes with its E2E scenario from section 5. The scenario is written and debugged together with the feature, but the full E2E run happens only on request.
- A task is done when unit and MCP tests pass.
- Tests use realistic dialogue text (the «Ранок» scene: Татко, ГГ, Бен), not placeholders.
