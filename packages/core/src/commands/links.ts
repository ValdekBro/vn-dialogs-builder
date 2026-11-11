import { resolveOutput } from "../queries";
import type { Next, Output } from "../schema/entities";
import { defineCommand, validateNext } from "./util";

export type SetNextArgs = { from: Output; next: Next };

/** Підключити, відключити (`null`), позначити кінець сцени (`{ type: "end" }`) або перейти до іншої сцени (`{ type: "scene" }`). */
export const setNext = defineCommand({
  name: "setNext",
  label: (a: SetNextArgs) =>
    a.next === null
      ? "Відключити зв'язок"
      : a.next.type === "end"
        ? "Позначити кінець сцени"
        : a.next.type === "scene"
          ? "Перехід до сцени"
          : "Підключити зв'язок",
  run(draft, args: SetNextArgs) {
    const { scene, block, line } = resolveOutput(draft, args.from);
    line.next = validateNext(draft, scene, args.next);
    return { blockId: block.id, lineId: line.id };
  },
});
