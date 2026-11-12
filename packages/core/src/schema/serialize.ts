import type { Block, Character, Line, Next, Project, Scene } from "./entities";
import { Project as ProjectSchema } from "./project";
import { migrateProject, ProjectLoadError } from "./migrations/project";

/**
 * Serialization with a stable key order (SCHEMA.md, section 7):
 * fields in schema order, `Record` entries sorted by ID.
 */
export function serializeProject(project: Project): string {
  return JSON.stringify(normalizeProject(project), null, 2) + "\n";
}

export function normalizeProject(p: Project): Project {
  return {
    format: p.format,
    version: p.version,
    appVersion: p.appVersion,
    id: p.id,
    name: p.name,
    description: p.description,
    characters: sortRecord(p.characters, normalizeCharacter),
    characterOrder: [...p.characterOrder],
    scenes: sortRecord(p.scenes, normalizeScene),
    sceneOrder: [...p.sceneOrder],
  };
}

function normalizeCharacter(c: Character): Character {
  const out: Character = {
    id: c.id,
    name: c.name,
    color: c.color,
    description: c.description,
    speechStyle: c.speechStyle,
  };
  if (c.builtIn) out.builtIn = c.builtIn;
  return out;
}

function normalizeScene(s: Scene): Scene {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    startBlockId: s.startBlockId,
    blocks: sortRecord(s.blocks, normalizeBlock),
  };
}

function normalizeBlock(b: Block): Block {
  const out: Block = { id: b.id, characterId: b.characterId, lines: b.lines.map(normalizeLine) };
  if (b.pos) out.pos = { x: b.pos.x, y: b.pos.y };
  return out;
}

function normalizeLine(l: Line): Line {
  return { id: l.id, text: l.text, next: normalizeNext(l.next) };
}

function normalizeNext(n: Next): Next {
  if (n === null) return null;
  if (n.type === "block") return { type: "block", blockId: n.blockId };
  if (n.type === "scene") return { type: "scene", sceneId: n.sceneId };
  return { type: "end" };
}

function sortRecord<T>(rec: Record<string, T>, map: (v: T) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(rec).sort()) out[key] = map(rec[key] as T);
  return out;
}

export type LoadedProject = {
  project: Project;
  /** File version before migration. */
  fromVersion: number;
  /** true if the file was migrated: a backup is needed before the first write. */
  migrated: boolean;
};

/** Loading: `JSON.parse` → migrations → schema validation with invariants. */
export function parseProjectFile(text: string): LoadedProject {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ProjectLoadError("invalid_json", "Project file is not valid JSON", e);
  }
  const { data, fromVersion } = migrateProject(raw);
  const parsed = ProjectSchema.safeParse(data);
  if (!parsed.success) {
    throw new ProjectLoadError("invalid", "Project file failed validation", parsed.error.issues);
  }
  return { project: parsed.data, fromVersion, migrated: fromVersion !== parsed.data.version };
}

/** Backup name before migration: `<projectId>.v<old version>.bak.json`. */
export function backupFileName(projectId: string, fromVersion: number): string {
  return `${projectId}.v${fromVersion}.bak.json`;
}
