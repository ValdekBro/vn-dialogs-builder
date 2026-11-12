import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  backupFileName,
  createProject,
  fromExport,
  parseProjectFile,
  ProjectLoadError,
  randomId,
  serializeProject,
  type IdGenerator,
  type Project,
} from "@vn/core";
import type { ProjectSummary } from "../../shared/api";
import { writeFileAtomic } from "./fs-atomic";

const PROJECT_FILE = /^(prj_[A-Za-z0-9_-]{10})\.json$/;

export type ProjectRepositoryOptions = {
  /** The `projects/` folder in the app's storage. */
  dir: string;
  appVersion: string;
  /** How to delete a project file. In the app — to the system trash, so it can be restored. */
  trash?: (path: string) => Promise<void>;
  newId?: IdGenerator;
};

/**
 * Project files (ARCHITECTURE.md, section 5). One project — one `<projectId>.json` file.
 * There is no separate index: the list is built by scanning the folder.
 */
export class ProjectRepository {
  readonly dir: string;
  #appVersion: string;
  #trash: (path: string) => Promise<void>;
  #newId: IdGenerator;

  constructor(options: ProjectRepositoryOptions) {
    this.dir = options.dir;
    this.#appVersion = options.appVersion;
    this.#trash = options.trash ?? ((path) => rm(path, { force: true }));
    this.#newId = options.newId ?? randomId;
  }

  pathOf(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  async list(): Promise<ProjectSummary[]> {
    await this.init();
    const out: ProjectSummary[] = [];
    for (const file of await readdir(this.dir)) {
      const match = PROJECT_FILE.exec(file);
      if (!match) continue;
      const path = join(this.dir, file);
      const [text, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
      out.push(summarize(match[1]!, text, info.mtimeMs));
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async exists(id: string): Promise<boolean> {
    try {
      await stat(this.pathOf(id));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reads a project. If the file is an older version, a backup of the original is put next to it right away
   * (SCHEMA.md, section 7), and the first write is already in the new format.
   */
  async load(id: string): Promise<Project> {
    const text = await readFile(this.pathOf(id), "utf8");
    const loaded = parseProjectFile(text);
    if (loaded.project.id !== id) {
      throw new ProjectLoadError("invalid", `File ${id}.json contains project ${loaded.project.id}`);
    }
    if (loaded.migrated) {
      const backup = join(this.dir, backupFileName(id, loaded.fromVersion));
      await writeFile(backup, text, { encoding: "utf8", flag: "wx" }).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== "EEXIST") throw e;
      });
    }
    return loaded.project;
  }

  async save(project: Project): Promise<void> {
    await this.init();
    await writeFileAtomic(this.pathOf(project.id), serializeProject({ ...project, appVersion: this.#appVersion }));
  }

  async create(name: string): Promise<Project> {
    const project = createProject({ name: requireName(name), appVersion: this.#appVersion, newId: this.#newId });
    await this.save(project);
    return project;
  }

  async rename(id: string, name: string): Promise<void> {
    const project = await this.load(id);
    await this.save({ ...project, name: requireName(name) });
  }

  /** A copy with a new project ID. IDs inside (characters, scenes, blocks) are unique only within a project, so they stay. */
  async duplicate(id: string): Promise<Project> {
    const project = await this.load(id);
    const copy: Project = { ...project, id: this.#newId("prj"), name: `${project.name} (копія)` };
    await this.save(copy);
    return copy;
  }

  /** Import (SCHEMA.md, section 8): a new project with a new ID from an export file of any supported version. */
  async importExport(raw: unknown): Promise<Project> {
    const project = fromExport(raw, { appVersion: this.#appVersion, newId: this.#newId });
    // Two projects with the same name in the list are hard to tell apart, so a clash gets a suffix.
    const taken = new Set((await this.list()).map((p) => p.name));
    if (taken.has(project.name)) {
      let n = 1;
      const suffixed = () => `${project.name} (імпорт${n > 1 ? ` ${n}` : ""})`;
      while (taken.has(suffixed())) n++;
      project.name = suffixed();
    }
    await this.save(project);
    return project;
  }

  async delete(id: string): Promise<void> {
    await this.#trash(this.pathOf(id));
  }
}

function summarize(id: string, text: string, updatedAt: number): ProjectSummary {
  try {
    const { project } = parseProjectFile(text);
    return {
      id,
      name: project.name,
      description: project.description,
      sceneCount: project.sceneOrder.length,
      updatedAt,
    };
  } catch (e) {
    // A file that cannot be opened is still listed, so the person knows about it.
    const raw = safeJson(text);
    return {
      id,
      name: typeof raw?.name === "string" && raw.name !== "" ? raw.name : id,
      description: typeof raw?.description === "string" ? raw.description : "",
      sceneCount: Array.isArray(raw?.sceneOrder) ? raw.sceneOrder.length : 0,
      updatedAt,
      problem: e instanceof ProjectLoadError && e.kind === "too_new" ? "too_new" : "invalid",
    };
  }
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    return typeof v === "object" && v !== null ? v : null;
  } catch {
    return null;
  }
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") throw new Error("Project name must not be empty");
  return trimmed;
}
