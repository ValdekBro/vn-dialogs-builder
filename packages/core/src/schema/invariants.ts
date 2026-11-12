import type { Next, Project } from "./entities";

export type InvariantViolation = { path: (string | number)[]; message: string };

/**
 * Checks the invariants from SCHEMA.md, section 4.
 * A violation means a corrupted file or a bug in a command, not an issue to highlight.
 */
export function findInvariantViolations(project: Project): InvariantViolation[] {
  const out: InvariantViolation[] = [];
  const seenIds = new Set<string>();
  const claim = (id: string, path: (string | number)[]) => {
    if (seenIds.has(id)) out.push({ path, message: `Duplicate id in project: ${id}` });
    seenIds.add(id);
  };

  claim(project.id, ["id"]);

  // 1, 2, 3: characters
  let authors = 0;
  for (const [key, ch] of Object.entries(project.characters)) {
    if (key !== ch.id) out.push({ path: ["characters", key], message: `Record key ${key} != id ${ch.id}` });
    claim(ch.id, ["characters", key]);
    if (ch.builtIn === "author") authors++;
  }
  if (authors !== 1) out.push({ path: ["characters"], message: `Expected exactly one author, found ${authors}` });
  checkOrder(out, "characterOrder", project.characterOrder, Object.keys(project.characters));

  // scenes
  checkOrder(out, "sceneOrder", project.sceneOrder, Object.keys(project.scenes));
  for (const [sceneKey, scene] of Object.entries(project.scenes)) {
    const sp = ["scenes", sceneKey];
    if (sceneKey !== scene.id) out.push({ path: sp, message: `Record key ${sceneKey} != id ${scene.id}` });
    claim(scene.id, sp);

    // 6: start block is in this scene
    if (scene.startBlockId !== null && !(scene.startBlockId in scene.blocks)) {
      out.push({ path: [...sp, "startBlockId"], message: `startBlockId ${scene.startBlockId} is not in scene` });
    }

    const checkNext = (next: Next, path: (string | number)[]) => {
      // 5: links only within the scene
      if (next?.type === "block" && !(next.blockId in scene.blocks)) {
        out.push({ path, message: `next points outside the scene: ${next.blockId}` });
      }
      // 5a: a jump only to another existing scene
      if (next?.type === "scene" && (!(next.sceneId in project.scenes) || next.sceneId === scene.id)) {
        out.push({ path, message: `next points to a missing or the same scene: ${next.sceneId}` });
      }
    };

    for (const [blockKey, block] of Object.entries(scene.blocks)) {
      const bp = [...sp, "blocks", blockKey];
      if (blockKey !== block.id) out.push({ path: bp, message: `Record key ${blockKey} != id ${block.id}` });
      claim(block.id, bp);
      // 7: the character exists
      if (block.characterId !== null && !(block.characterId in project.characters)) {
        out.push({ path: [...bp, "characterId"], message: `Unknown character ${block.characterId}` });
      }
      if (block.lines.length === 0) out.push({ path: [...bp, "lines"], message: `Block ${block.id} has no lines` });
      block.lines.forEach((line, i) => {
        claim(line.id, [...bp, "lines", i]);
        checkNext(line.next, [...bp, "lines", i, "next"]);
      });
    }
  }
  return out;
}

function checkOrder(out: InvariantViolation[], field: string, order: string[], keys: string[]) {
  const set = new Set(order);
  if (set.size !== order.length) out.push({ path: [field], message: `${field} has duplicates` });
  const keySet = new Set(keys);
  if (set.size !== keySet.size || [...set].some((id) => !keySet.has(id))) {
    out.push({ path: [field], message: `${field} does not match record keys` });
  }
}
