import { resolveOutput } from "../queries";
import type { Next, Output } from "../schema/entities";
import { defineCommand, validateNext } from "./util";

export type SetNextArgs = { from: Output; next: Next };

/** Connect, disconnect (`null`), mark the end of the story (`{ type: "end" }`) or jump to another scene (`{ type: "scene" }`). */
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
