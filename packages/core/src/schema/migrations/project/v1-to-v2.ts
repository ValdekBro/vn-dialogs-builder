import { randomId } from "../../../ids";

/**
 * v1 → v2: a block no longer has `line` / `choice` types. A block is now a list of lines,
 * each with its own output; several lines mean a choice.
 *
 * - a `line` block becomes a block with one line (same text and `next`);
 * - the options of a `choice` block become lines;
 * - the text of the `choice` block itself (the "question" before the options) is not lost: it becomes a separate block
 *   of the same character before the choice, and every link that led into the choice now leads into it.
 */
type Raw = Record<string, any>;

const suffix = (id: string) => id.slice(id.indexOf("_") + 1);

export function migrateV1toV2(project: Raw): Raw {
  const scenes: Raw = {};
  for (const [sceneId, scene] of Object.entries<Raw>(project.scenes ?? {})) {
    const blocks: Raw = {};
    /** Where to redirect links: choice block id → id of the new block with its text. */
    const redirect = new Map<string, string>();

    for (const [blockId, block] of Object.entries<Raw>(scene.blocks ?? {})) {
      if (block.kind === "choice") {
        const options: Raw[] = Array.isArray(block.choices) ? block.choices : [];
        const lines = options.map((c) => ({ id: `ln_${suffix(c.id)}`, text: c.text ?? "", next: c.next ?? null }));
        if (lines.length === 0) lines.push({ id: `ln_${suffix(blockId)}`, text: "", next: null });
        blocks[blockId] = { id: blockId, characterId: block.characterId ?? null, lines };
        if (typeof block.text === "string" && block.text.trim() !== "") {
          const promptId = randomId("blk");
          redirect.set(blockId, promptId);
          blocks[promptId] = {
            id: promptId,
            characterId: block.characterId ?? null,
            lines: [{ id: randomId("ln"), text: block.text, next: { type: "block", blockId } }],
          };
        }
      } else {
        blocks[blockId] = {
          id: blockId,
          characterId: block.characterId ?? null,
          lines: [{ id: `ln_${suffix(blockId)}`, text: block.text ?? "", next: block.next ?? null }],
        };
      }
    }

    if (redirect.size > 0) {
      for (const block of Object.values<Raw>(blocks)) {
        for (const line of block.lines as Raw[]) {
          const target = line.next?.type === "block" ? redirect.get(line.next.blockId) : undefined;
          // The link inside the "question → choice" pair is left alone.
          if (target && target !== block.id) line.next = { type: "block", blockId: target };
        }
      }
    }
    const start = scene.startBlockId;
    scenes[sceneId] = { ...scene, startBlockId: start && redirect.has(start) ? redirect.get(start) : start, blocks };
  }
  return { ...project, scenes };
}
