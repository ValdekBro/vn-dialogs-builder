import type { BlockId, CharacterId, Next, SceneId } from "@vn/core";
import { call, execute } from "../api";
import { attempt, showToast } from "../store/toast";
import { t } from "../strings/uk";
import { cancelDraft, focusBlock } from "./canvas-store";
import type { Draft, LineOutput } from "./projection";

/** Дії полотна: тонкі обгортки над командами ядра з тостами, фокусом і скиданням стану полотна. */

export type DraftInput = {
  characterId: CharacterId | null;
  /** Тексти реплік; кілька — це вибір. */
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
  // Людина видаляє без підтвердження, але з можливістю скасувати (FLOWS.md, 9).
  showToast(t.canvas.deleted(blockIds.length), "info", 6000, {
    label: t.canvas.undo,
    run: () => void attempt(() => call("session.undo")),
  });
}

export type Move = { blockId: BlockId; pos: { x: number; y: number } | null };

/** Ручне розташування блоків (FLOWS.md, 8a). `pos: null` — назад в авторозкладку. */
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
