import { sceneIssues } from "../issues";
import type { BlockId, Next, Project, SceneId } from "../schema/entities";
import { getScene, reachableBlocks } from "./index";

/**
 * Text tree of a scene for agents (MCP.md, section 6).
 * A block with convergence is expanded once; after that it is referenced with `↪`.
 */
export function sceneOutline(project: Project, sceneId: SceneId): string {
  const scene = getScene(project, sceneId);
  const lines: string[] = [];
  const issues = sceneIssues(scene, project).length;
  lines.push(`Сцена «${scene.name}» (${scene.id}), старт: ${scene.startBlockId ?? "—"}, проблем: ${issues}`);
  if (scene.description.trim() !== "") lines.push(`Опис: ${oneLine(scene.description)}`);
  if (Object.keys(scene.blocks).length === 0) {
    lines.push("(порожня сцена)");
    return lines.join("\n") + "\n";
  }

  const shown = new Set<BlockId>();
  const pad = (n: number) => " ".repeat(n);
  const speaker = (characterId: string | null) =>
    characterId === null ? "(без персонажа)" : (project.characters[characterId]?.name ?? characterId);

  const terminal = (next: Next, indent: number): BlockId | null => {
    if (next === null) lines.push(`${pad(indent)}⚠ НЕ ПІДКЛЮЧЕНО`);
    else if (next.type === "end") lines.push(`${pad(indent)}■ КІНЕЦЬ`);
    else if (next.type === "scene") {
      const target = project.scenes[next.sceneId];
      lines.push(`${pad(indent)}→ СЦЕНА «${target?.name ?? next.sceneId}» (${next.sceneId})`);
    } else return next.blockId;
    return null;
  };

  const chain = (startId: BlockId, indent: number) => {
    let current: BlockId | null = startId;
    while (current !== null) {
      if (shown.has(current)) {
        lines.push(`${pad(indent)}↪ ${current}`);
        return;
      }
      const block = scene.blocks[current];
      if (!block) return;
      shown.add(current);
      const who = speaker(block.characterId);
      if (block.lines.length === 1) {
        lines.push(`${pad(indent)}[${block.id}] ${who}: ${oneLine(block.lines[0]!.text)}`);
        current = terminal(block.lines[0]!.next, indent);
        continue;
      }
      // Several lines are a choice: each with its own id, because links point at the line.
      lines.push(`${pad(indent)}[${block.id}] ${who}, вибір:`);
      for (const line of block.lines) {
        lines.push(`${pad(indent + 2)}◇ [${line.id}] «${oneLine(line.text)}»`);
        const target = terminal(line.next, indent + 4);
        if (target !== null) chain(target, indent + 4);
      }
      return;
    }
  };

  if (scene.startBlockId !== null) chain(scene.startBlockId, 0);

  const reachable = reachableBlocks(scene);
  const rest = Object.keys(scene.blocks)
    .sort()
    .filter((id) => !reachable.has(id));
  if (rest.length > 0) {
    lines.push("Недосяжні:");
    for (const id of rest) if (!shown.has(id)) chain(id, 2);
  }
  return lines.join("\n") + "\n";
}

function oneLine(text: string): string {
  return text.replace(/\r?\n/g, " ⏎ ");
}
