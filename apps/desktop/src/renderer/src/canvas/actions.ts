import { copyBlocks, type BlockClipboard, type BlockId, type CharacterId, type Next, type SceneId } from "@vn/core";
import { call, execute } from "../api";
import { useApp } from "../store/app-store";
import { attempt, showToast } from "../store/toast";
import { t } from "../strings/uk";
import { cancelDraft, focusBlock } from "./canvas-store";
import type { Draft, LineOutput } from "./projection";

/** Canvas actions: thin wrappers over core commands with toasts, focus and canvas state reset. */

export type DraftInput = {
  characterId: CharacterId | null;
  /** Line texts; several make a choice. */
  lines: string[];
};

export async function saveDraft(sceneId: SceneId, draft: Draft, input: DraftInput) {
  const result = await attempt(() =>
    execute<{ blockId: BlockId }>("addBlock", {
      sceneId,
      characterId: input.characterId,
      lines: input.lines.map((text) => ({ text })),
      ...(draft.from ? { from: draft.from, insert: draft.insert ?? false } : {}),
    }),
  );
  cancelDraft();
  if (result) focusBlock(result.blockId);
}

export async function removeBlocks(blockIds: BlockId[]) {
  if (blockIds.length === 0) return;
  const ok = await attempt(() => execute("deleteBlocks", { blockIds }));
  if (ok === undefined) return;
  // The human deletes without confirmation, but can undo (FLOWS.md, 9).
  showToast(t.canvas.deleted(blockIds.length), "info", 6000, {
    label: t.canvas.undo,
    run: () => void attempt(() => call("session.undo")),
  });
}

export type Move = { blockId: BlockId; pos: { x: number; y: number } | null };

/** Manual block placement (FLOWS.md, 8a). `pos: null` returns to auto layout. */
export function moveBlocks(moves: Move[]) {
  if (moves.length === 0) return;
  return attempt(() => execute("moveBlocks", { moves }));
}

export function resetLayout(sceneId: SceneId) {
  return attempt(() => execute("resetLayout", { sceneId }));
}

export function setOutputNext(from: LineOutput, next: Next) {
  return attempt(() => execute("setNext", { from, next }));
}

export async function createCharacterNamed(name: string): Promise<CharacterId | undefined> {
  const r = await attempt(() => execute<{ characterId: CharacterId }>("createCharacter", { name }));
  return r?.characterId;
}

// ── Clipboard (FLOWS.md, 9) ───────────────────────────────

/**
 * Copied blocks live in the app, not in the system clipboard: they are model data, and pasting into
 * another scene (or project) must keep their structure. Pasting gives new IDs every time.
 */
let clipboard: BlockClipboard | null = null;

export function copyToClipboard(blockIds: BlockId[]): boolean {
  const project = useApp.getState().project;
  if (!project || blockIds.length === 0) return false;
  clipboard = copyBlocks(project, blockIds);
  return true;
}

export function hasClipboard(): boolean {
  return clipboard !== null;
}

export function copyBlocksAction(blockIds: BlockId[]) {
  if (copyToClipboard(blockIds)) showToast(t.canvas.copiedBlocks(blockIds.length));
}

/** Cut = copy + delete, with the usual "Undo". */
export async function cutBlocks(blockIds: BlockId[]) {
  if (!copyToClipboard(blockIds)) return;
  const ok = await attempt(() => execute("deleteBlocks", { blockIds }));
  if (ok === undefined) return;
  showToast(t.canvas.cutBlocks(blockIds.length), "info", 6000, {
    label: t.canvas.undo,
    run: () => void attempt(() => call("session.undo")),
  });
}

/** Paste into a scene as a separate branch; returns the new block IDs so the canvas can select them. */
export async function pasteClipboard(sceneId: SceneId): Promise<BlockId[] | null> {
  if (!clipboard) return null;
  const snapshot = clipboard;
  const result = await attempt(() => execute<{ blockIds: BlockId[]; rootBlockIds: BlockId[] }>("pasteBlocks", { sceneId, clipboard: snapshot }));
  if (!result) return null;
  focusBlock(result.rootBlockIds[0] ?? result.blockIds[0]!, true);
  return result.blockIds;
}

/** ⧉ on a block: a copy of it next to the original, in the same scene. */
export async function duplicateBlock(sceneId: SceneId, blockId: BlockId) {
  const project = useApp.getState().project;
  if (!project) return;
  const snapshot = copyBlocks(project, [blockId]);
  const result = await attempt(() => execute<{ blockIds: BlockId[] }>("pasteBlocks", { sceneId, clipboard: snapshot }));
  if (result?.blockIds[0]) focusBlock(result.blockIds[0], true);
}
