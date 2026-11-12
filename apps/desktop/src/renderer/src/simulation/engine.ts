import type { BlockId, CharacterId, LineId, Next, Project, SceneId } from "@vn/core";

/**
 * Dialogue playback (OVERVIEW.md, 5.9; FLOWS.md, 17): walks the scene graph the way a player would.
 * A pure function over the current project, without React or timers: the store decides when to call it.
 * The model is re-read on every step, so edits made during playback are picked up.
 */

/** Where playback stands: the block that has not been shown yet. */
export type Cursor = { sceneId: SceneId; blockId: BlockId };

export type ProblemCode =
  | "missing_block"
  | "missing_scene"
  | "missing_start"
  | "missing_character"
  | "empty_text"
  | "dangling_output"
  | "empty_target_scene";

/** One entry of the chat log. */
export type Entry =
  | { kind: "line"; sceneId: SceneId; blockId: BlockId; lineId: LineId; characterId: CharacterId; text: string }
  | { kind: "choice"; sceneId: SceneId; blockId: BlockId; characterId: CharacterId; options: { lineId: LineId; text: string }[] }
  | { kind: "picked"; sceneId: SceneId; blockId: BlockId; lineId: LineId; characterId: CharacterId; text: string }
  | { kind: "scene"; sceneId: SceneId; name: string }
  | { kind: "end" }
  | { kind: "problem"; code: ProblemCode; sceneId: SceneId; blockId?: BlockId; lineId?: LineId; name?: string };

/** What a step produced: entries to show in order, and where playback continues (`null` — it stops or waits). */
export type Step = { entries: Entry[]; next: Cursor | null };

/** The starting point: a given block, or the scene's start block. */
export function startAt(project: Project, sceneId: SceneId, blockId?: BlockId): Step {
  const scene = project.scenes[sceneId];
  if (!scene) return stop({ kind: "problem", code: "missing_scene", sceneId });
  const start = blockId ?? scene.startBlockId;
  if (!start) return stop({ kind: "problem", code: "missing_start", sceneId, name: scene.name });
  return { entries: [], next: { sceneId, blockId: start } };
}

/** Shows the block under the cursor: one line and its continuation, or a choice that waits for `pick`. */
export function step(project: Project, cursor: Cursor): Step {
  const block = project.scenes[cursor.sceneId]?.blocks[cursor.blockId];
  if (!block) return stop({ kind: "problem", code: "missing_block", ...cursor });
  const where = { sceneId: cursor.sceneId, blockId: block.id };
  if (block.characterId === null) return stop({ kind: "problem", code: "missing_character", ...where });

  const empty = block.lines.find((l) => l.text.trim() === "");
  if (empty) return stop({ kind: "problem", code: "empty_text", ...where, lineId: empty.id });

  if (block.lines.length > 1) {
    const options = block.lines.map((l) => ({ lineId: l.id, text: l.text }));
    return stop({ kind: "choice", ...where, characterId: block.characterId, options });
  }
  const line = block.lines[0]!;
  const shown: Entry = { kind: "line", ...where, lineId: line.id, characterId: block.characterId, text: line.text };
  return follow(project, where, line.id, line.next, [shown]);
}

/** The player picked an option of a choice: it goes into the log as that character's line, then the branch continues. */
export function pick(project: Project, choice: Extract<Entry, { kind: "choice" }>, lineId: LineId): Step {
  const block = project.scenes[choice.sceneId]?.blocks[choice.blockId];
  const line = block?.lines.find((l) => l.id === lineId);
  if (!block || !line) return stop({ kind: "problem", code: "missing_block", sceneId: choice.sceneId, blockId: choice.blockId });
  const where = { sceneId: choice.sceneId, blockId: block.id };
  const picked: Entry = { kind: "picked", ...where, lineId, characterId: choice.characterId, text: line.text };
  return follow(project, where, lineId, line.next, [picked]);
}

/** Where a line's output leads: the next block, the end, another scene's start, or a dangling output. */
function follow(project: Project, from: { sceneId: SceneId; blockId: BlockId }, lineId: LineId, next: Next, entries: Entry[]): Step {
  if (next === null) return { entries: [...entries, { kind: "problem", code: "dangling_output", ...from, lineId }], next: null };
  if (next.type === "end") return { entries: [...entries, { kind: "end" }], next: null };
  if (next.type === "block") return { entries, next: { sceneId: from.sceneId, blockId: next.blockId } };

  const target = project.scenes[next.sceneId];
  if (!target) return { entries: [...entries, { kind: "problem", code: "missing_scene", ...from, lineId }], next: null };
  if (!target.startBlockId) {
    return { entries: [...entries, { kind: "problem", code: "empty_target_scene", ...from, lineId, name: target.name }], next: null };
  }
  return { entries: [...entries, { kind: "scene", sceneId: target.id, name: target.name }], next: { sceneId: target.id, blockId: target.startBlockId } };
}

function stop(entry: Entry): Step {
  return { entries: [entry], next: null };
}

/** Text of an entry the reader has to read — for the pause before the next one. */
export function readingText(entry: Entry): string {
  if (entry.kind === "line" || entry.kind === "picked") return entry.text;
  return "";
}

/**
 * Pause after an entry at 1×: longer lines get longer pauses, like reading.
 * About 15 characters per second, never shorter than 1.2 s or longer than 8 s.
 */
export function readingDelayMs(entry: Entry): number {
  const chars = readingText(entry).length;
  if (chars === 0) return 900;
  return Math.min(8000, Math.max(1200, 700 + chars * 65));
}
