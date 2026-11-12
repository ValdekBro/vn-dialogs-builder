import type { Project, SceneId } from "@vn/core";

/**
 * Pure helpers for the scene list (FLOWS.md, 11): drag-and-drop order and what deleting a scene affects.
 * No React, so they are easy to test.
 */

/**
 * New order after dragging `moved` onto `target`: above it (`after: false`) or below it.
 * Returns `null` if nothing changes.
 */
export function reorderedScenes(order: SceneId[], moved: SceneId, target: SceneId, after: boolean): SceneId[] | null {
  if (moved === target || !order.includes(moved) || !order.includes(target)) return null;
  const rest = order.filter((id) => id !== moved);
  const at = rest.indexOf(target) + (after ? 1 : 0);
  const next = [...rest.slice(0, at), moved, ...rest.slice(at)];
  return next.every((id, i) => id === order[i]) ? null : next;
}

/** What disappears with a scene: its blocks, and jumps into it from other scenes (they become dangling outputs). */
export function sceneDeleteImpact(project: Project, sceneId: SceneId): { blocks: number; jumpsIn: number } {
  const scene = project.scenes[sceneId];
  let jumpsIn = 0;
  for (const other of Object.values(project.scenes)) {
    if (other.id === sceneId) continue;
    for (const block of Object.values(other.blocks)) {
      for (const line of block.lines) if (line.next?.type === "scene" && line.next.sceneId === sceneId) jumpsIn++;
    }
  }
  return { blocks: scene ? Object.keys(scene.blocks).length : 0, jumpsIn };
}
