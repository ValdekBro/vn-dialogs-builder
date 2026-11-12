import type { BlockId, CharacterId, Next, SceneId } from "@vn/core";
import { call, execute } from "../api";
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
