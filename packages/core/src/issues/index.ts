import { reachableBlocks } from "../queries";
import type { BlockId, LineId, Project, Scene, SceneId } from "../schema/entities";

/** Issues (SCHEMA.md, section 5). Never stored, always computed from the model. */
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
  /** Human-readable description (UI language): both the user in the UI and the agent see it. */
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
 * Scene issues. `project` is needed only to check jumps to other scenes:
 * a jump to a scene without a start block leads nowhere.
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
    // Without a start everything is unreachable, but missing_start already covers that.
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

/** All project issues in scene order, or for one scene. */
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

/** Export is allowed only without errors; warnings do not block it. */
export function canExport(project: Project): boolean {
  return projectIssues(project).every((i) => i.severity !== "error");
}
