import { reachableBlocks } from "../queries";
import type { BlockId, LineId, Project, Scene, SceneId } from "../schema/entities";

/** Проблеми (SCHEMA.md, розділ 5). Не зберігаються, завжди обчислюються з моделі. */
export type IssueCode =
  | "missing_start"
  | "unreachable"
  | "dangling_output"
  | "missing_character"
  | "empty_text"
  | "empty_target_scene";

export type IssueSeverity = "error" | "warning";

export type Issue = {
  code: IssueCode;
  severity: IssueSeverity;
  sceneId: SceneId;
  blockId?: BlockId;
  lineId?: LineId;
  /** Людський опис українською: його бачить і людина в UI, і агент. */
  message: string;
};

export const ISSUE_SEVERITY: Record<IssueCode, IssueSeverity> = {
  missing_start: "error",
  unreachable: "error",
  dangling_output: "error",
  missing_character: "error",
  empty_text: "error",
  empty_target_scene: "error",
};

/**
 * Проблеми сцени. `project` потрібен лише для перевірки переходів в інші сцени:
 * перехід у сцену без стартового блоку нікуди не веде.
 */
export function sceneIssues(scene: Scene, project?: Project): Issue[] {
  const out: Issue[] = [];
  const add = (code: IssueCode, message: string, ids: { blockId?: BlockId; lineId?: LineId } = {}) =>
    out.push({ code, severity: ISSUE_SEVERITY[code], sceneId: scene.id, ...ids, message });

  const blockIds = Object.keys(scene.blocks).sort();
  if (blockIds.length === 0) return out;

  if (scene.startBlockId === null) add("missing_start", "У сцени немає стартового блоку");
  const reachable = reachableBlocks(scene);

  for (const id of blockIds) {
    const block = scene.blocks[id]!;
    const ids = { blockId: block.id };
    // Без старту недосяжне все, але це вже покриває missing_start.
    if (scene.startBlockId !== null && !reachable.has(block.id)) {
      add("unreachable", "Блок недосяжний від стартового", ids);
    }
    if (block.characterId === null) add("missing_character", "У блоку не вибрано персонажа", ids);
    const multi = block.lines.length > 1;
    for (const line of block.lines) {
      const lids = { blockId: block.id, lineId: line.id };
      if (line.text.trim() === "") add("empty_text", multi ? "Порожній варіант" : "Порожній текст репліки", lids);
      if (line.next === null) add("dangling_output", multi ? "Варіант нікуди не веде" : "Репліка нікуди не веде", lids);
      if (line.next?.type === "scene" && project) {
        const target = project.scenes[line.next.sceneId];
        if (target && target.startBlockId === null) {
          add("empty_target_scene", `Сцена «${target.name}» ще порожня або без стартового блоку`, lids);
        }
      }
    }
  }
  return out;
}

/** Усі проблеми проєкту в порядку сцен або однієї сцени. */
export function projectIssues(project: Project, sceneId?: SceneId): Issue[] {
  const ids = sceneId !== undefined ? [sceneId] : project.sceneOrder;
  return ids.flatMap((id) => {
    const scene = project.scenes[id];
    return scene ? sceneIssues(scene, project) : [];
  });
}

export type IssueCounts = { errors: number; warnings: number };

export function countIssues(issues: Issue[]): IssueCounts {
  let errors = 0;
  let warnings = 0;
  for (const i of issues) {
    if (i.severity === "error") errors++;
    else warnings++;
  }
  return { errors, warnings };
}

/** Експорт дозволений лише без помилок; попередження не блокують. */
export function canExport(project: Project): boolean {
  return projectIssues(project).every((i) => i.severity !== "error");
}
