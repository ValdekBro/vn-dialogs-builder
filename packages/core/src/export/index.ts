import { z } from "zod";
import { randomId, type IdGenerator } from "../ids";
import { projectIssues, type Issue } from "../issues";
import { traversalOrder } from "../queries";
import {
  BlockId,
  CharacterId,
  LineId,
  PROJECT_FORMAT,
  PROJECT_VERSION,
  ProjectId,
  SceneId,
  type Block,
  type Character,
  type Project as ProjectT,
  type Scene,
} from "../schema/entities";
import { Project } from "../schema/project";
import { migrateExport } from "./migrations";

/** Формат експорту (SCHEMA.md, розділ 8). Версіонується незалежно від сховища. */
export const EXPORT_FORMAT = "vn-dialogs-builder.export";
export const EXPORT_VERSION = 1;

export const ExportNext = z.discriminatedUnion("type", [
  z.object({ type: z.literal("block"), blockId: BlockId }),
  z.object({ type: z.literal("end") }),
  // Перехід на початок іншої сцени; та сцена гарантовано є в експорті (порожні сцени дають помилку).
  z.object({ type: z.literal("scene"), sceneId: SceneId }),
]);

export const ExportLine = z.object({ id: LineId, text: z.string().min(1), next: ExportNext });

/** Блок експорту: персонаж і репліки. Кілька реплік — вибір гравця. */
export const ExportBlock = z.object({
  id: BlockId,
  characterId: CharacterId,
  lines: z.array(ExportLine).min(1),
});

export const ExportCharacter = z.object({
  id: CharacterId,
  name: z.string(),
  color: z.string(),
  description: z.string(),
  speechStyle: z.string(),
  isAuthor: z.boolean(),
});

export const ExportScene = z.object({
  id: SceneId,
  name: z.string(),
  description: z.string(),
  startBlockId: BlockId,
  blocks: z.array(ExportBlock),
});

export const ExportV1 = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(1),
  appVersion: z.string(),
  exportedAt: z.iso.datetime(),
  project: z.object({ id: ProjectId, name: z.string(), description: z.string() }),
  characters: z.array(ExportCharacter),
  scenes: z.array(ExportScene),
});

export type ExportV1 = z.infer<typeof ExportV1>;
export type ExportBlock = z.infer<typeof ExportBlock>;

/** Поточна версія формату експорту. */
export const ExportFile = ExportV1;
export type ExportFile = ExportV1;

export class ExportBlockedError extends Error {
  constructor(readonly issues: Issue[]) {
    super(`Export is blocked by ${issues.length} error(s)`);
    this.name = "ExportBlockedError";
  }
}

export class ImportError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

export type ToExportOptions = { appVersion: string; now?: Date };

/** Будує файл експорту. Кидає `ExportBlockedError`, якщо в проєкті є помилки. */
export function toExport(project: ProjectT, { appVersion, now = new Date() }: ToExportOptions): ExportFile {
  const errors = projectIssues(project).filter((i) => i.severity === "error");
  if (errors.length > 0) throw new ExportBlockedError(errors);

  const file: ExportFile = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    appVersion,
    exportedAt: now.toISOString(),
    project: { id: project.id, name: project.name, description: project.description },
    characters: project.characterOrder.map((id) => exportCharacter(project.characters[id]!)),
    scenes: project.sceneOrder
      .map((id) => project.scenes[id]!)
      .filter((s) => s.startBlockId !== null && Object.keys(s.blocks).length > 0)
      .map(exportScene),
  };
  return ExportFile.parse(file);
}

function exportCharacter(c: Character) {
  return {
    id: c.id,
    name: c.name,
    color: c.color,
    description: c.description,
    speechStyle: c.speechStyle,
    isAuthor: c.builtIn === "author",
  };
}

function exportScene(scene: Scene) {
  return {
    id: scene.id,
    name: scene.name,
    description: scene.description,
    startBlockId: scene.startBlockId!,
    // Без помилок недосяжних блоків немає, тож обхід охоплює всі блоки.
    blocks: traversalOrder(scene).map((id) => exportBlock(scene.blocks[id]!)),
  };
}

function exportBlock(b: Block): ExportBlock {
  // null-значення тут неможливі: їх відсіяла перевірка помилок, а ExportFile.parse це підтвердить.
  return {
    id: b.id,
    characterId: b.characterId!,
    lines: b.lines.map((l) => ({ id: l.id, text: l.text, next: l.next! })),
  };
}

export function serializeExport(file: ExportFile): string {
  return JSON.stringify(file, null, 2) + "\n";
}

export type FromExportOptions = { appVersion: string; newId?: IdGenerator };

/**
 * Імпорт: приймає файл експорту будь-якої підтримуваної версії й створює **новий** проєкт
 * з новим `prj_` ID. ID персонажів, сцен, блоків і варіантів зберігаються.
 */
export function fromExport(raw: unknown, { appVersion, newId = randomId }: FromExportOptions): ProjectT {
  const migrated = migrateExport(raw);
  const parsed = ExportFile.safeParse(migrated);
  if (!parsed.success) throw new ImportError("Export file failed validation", parsed.error.issues);
  const file = parsed.data;

  const characters: Record<string, Character> = {};
  for (const c of file.characters) {
    const ch: Character = {
      id: c.id,
      name: c.name,
      color: c.color,
      description: c.description,
      speechStyle: c.speechStyle,
    };
    if (c.isAuthor) ch.builtIn = "author";
    characters[c.id] = ch;
  }
  const scenes: Record<string, Scene> = {};
  for (const s of file.scenes) {
    const blocks: Record<string, Block> = {};
    for (const b of s.blocks) blocks[b.id] = structuredClone(b);
    scenes[s.id] = { id: s.id, name: s.name, description: s.description, startBlockId: s.startBlockId, blocks };
  }
  const project: ProjectT = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    appVersion,
    id: newId("prj"),
    name: file.project.name.trim() === "" ? "Імпортований проєкт" : file.project.name,
    description: file.project.description,
    characters,
    characterOrder: file.characters.map((c) => c.id),
    scenes,
    sceneOrder: file.scenes.map((s) => s.id),
  };
  const checked = Project.safeParse(project);
  if (!checked.success) throw new ImportError("Imported project is inconsistent", checked.error.issues);
  return checked.data;
}
