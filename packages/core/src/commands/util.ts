import { CoreError, invalid, notFound } from "../errors";
import type { IdGenerator } from "../ids";
import { findBlock, getCharacter, resolveOutput } from "../queries";
import { HexColor, type Next, type Output, type Project, type Scene } from "../schema/entities";

/** What a command gets from the executor besides the state itself. */
export type CommandContext = { newId: IdGenerator };

/**
 * A command changes the project draft (Immer draft) and returns a plain result: IDs, lists of IDs.
 * Never return objects from the draft: they become invalid once the command finishes.
 */
export type Command<A, R> = {
  name: string;
  /** Description for history and undo hints ("Undo: …"). */
  label: (args: A) => string;
  run: (draft: Project, args: A, ctx: CommandContext) => R;
};

export function defineCommand<A, R>(cmd: Command<A, R>): Command<A, R> {
  return cmd;
}

/** Checks that `next` can be set on an output in this scene. */
export function validateNext(project: Project, scene: Scene, next: Next): Next {
  if (next === null) return null;
  if (next.type === "end") return { type: "end" };
  if (next.type === "scene") {
    if (!(next.sceneId in project.scenes)) throw notFound("Scene", next.sceneId);
    if (next.sceneId === scene.id) throw invalid("A scene transition must lead to another scene");
    return { type: "scene", sceneId: next.sceneId };
  }
  if (next.type !== "block") throw invalid(`Unknown next type`);
  if (!(next.blockId in scene.blocks)) {
    if (findBlock(project, next.blockId)) {
      throw new CoreError("CROSS_SCENE", `Block ${next.blockId} belongs to another scene`, { blockId: next.blockId });
    }
    throw notFound("Block", next.blockId);
  }
  return { type: "block", blockId: next.blockId };
}

/** Output `from` must belong to scene `sceneId`. Also returns the line itself, to read and change its `next`. */
export function resolveOutputInScene(project: Project, sceneId: string, from: Output) {
  const resolved = resolveOutput(project, from);
  if (resolved.scene.id !== sceneId) {
    throw new CoreError("CROSS_SCENE", `Output ${from.blockId} belongs to another scene`, { blockId: from.blockId });
  }
  return resolved;
}

export function validateCharacterId(project: Project, characterId: string | null): string | null {
  if (characterId === null) return null;
  return getCharacter(project, characterId).id;
}

export function requireName(name: string, what: string): string {
  if (typeof name !== "string" || name.trim() === "") throw invalid(`${what} name must not be empty`);
  return name.trim();
}

export function validateColor(color: string): string {
  if (!HexColor.safeParse(color).success) throw invalid(`Invalid color "${color}", expected #RRGGBB`);
  return color.toLowerCase();
}

/** Checks that `ids` is a permutation of `current`. */
export function requirePermutation(ids: string[], current: string[], what: string): void {
  const set = new Set(ids);
  if (ids.length !== current.length || set.size !== ids.length || current.some((id) => !set.has(id))) {
    throw invalid(`${what} must be a permutation of existing ids`, { expected: current });
  }
}

/** Clears every link in the scene that points into deleted blocks. Returns the outputs left dangling. */
export function detachIncoming(scene: Scene, removed: Set<string>): Required<Output>[] {
  const dangling: Required<Output>[] = [];
  for (const block of Object.values(scene.blocks)) {
    if (removed.has(block.id)) continue;
    for (const line of block.lines) {
      if (line.next?.type === "block" && removed.has(line.next.blockId)) {
        line.next = null;
        dangling.push({ blockId: block.id, lineId: line.id });
      }
    }
  }
  if (scene.startBlockId !== null && removed.has(scene.startBlockId)) scene.startBlockId = null;
  return dangling;
}
