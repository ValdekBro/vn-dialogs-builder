import { randomId } from "../../../ids";

/**
 * v1 → v2: блок більше не має типів `line` / `choice`. Тепер блок — це список реплік,
 * кожна зі своїм виходом; кілька реплік означає вибір.
 *
 * - `line`-блок стає блоком з однією реплікою (той самий текст і `next`);
 * - варіанти `choice`-блоку стають репліками;
 * - текст самого `choice`-блоку («питання» перед варіантами) не губиться: він стає окремим блоком
 *   того ж персонажа перед вибором, і всі зв'язки, що вели у вибір, ведуть тепер у нього.
 */
type Raw = Record<string, any>;

const suffix = (id: string) => id.slice(id.indexOf("_") + 1);

export function migrateV1toV2(project: Raw): Raw {
  const scenes: Raw = {};
  for (const [sceneId, scene] of Object.entries<Raw>(project.scenes ?? {})) {
    const blocks: Raw = {};
    /** Куди перенаправити зв'язки: id choice-блоку → id нового блоку з його текстом. */
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
          // Зв'язок усередині пари «питання → вибір» не чіпаємо.
          if (target && target !== block.id) line.next = { type: "block", blockId: target };
        }
      }
    }
    const start = scene.startBlockId;
    scenes[sceneId] = { ...scene, startBlockId: start && redirect.has(start) ? redirect.get(start) : start, blocks };
  }
  return { ...project, scenes };
}
