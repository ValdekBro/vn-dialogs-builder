import { PROJECT_FORMAT, PROJECT_VERSION } from "../../entities";
import { migrateV1toV2 } from "./v1-to-v2";

/**
 * Project file migrations (SCHEMA.md, section 7).
 *
 * The key is the version the function migrates FROM: `MIGRATIONS[1]` turns v1 into v2.
 * Every migration is a pure function over raw JSON and has a test on an old-version fixture.
 * When you bump PROJECT_VERSION, add the migration from the previous version here.
 */
type RawProject = Record<string, unknown>;
type Migration = (raw: RawProject) => RawProject;

export const PROJECT_MIGRATIONS: Record<number, Migration> = {
  1: migrateV1toV2,
  // v3 only added a new kind of `next` — a jump to a scene. Existing data does not change.
  2: (raw) => raw,
  // v4 only added an optional manual block position (`pos`). Existing data does not change.
  3: (raw) => raw,
};

export type ProjectMigrationResult = {
  data: RawProject;
  /** File version before migration. If it is lower than the current one, a backup is needed. */
  fromVersion: number;
};

export type ProjectLoadErrorKind = "invalid_json" | "unknown_format" | "too_new" | "invalid";

export class ProjectLoadError extends Error {
  readonly kind: ProjectLoadErrorKind;
  readonly details: unknown;

  constructor(kind: ProjectLoadErrorKind, message: string, details?: unknown) {
    super(message);
    this.name = "ProjectLoadError";
    this.kind = kind;
    this.details = details;
  }
}

export function migrateProject(raw: unknown, migrations = PROJECT_MIGRATIONS, target = PROJECT_VERSION): ProjectMigrationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ProjectLoadError("unknown_format", "Project file is not an object");
  }
  const obj = raw as RawProject;
  if (obj.format !== PROJECT_FORMAT) {
    throw new ProjectLoadError("unknown_format", `Unknown project format: ${String(obj.format)}`);
  }
  const fromVersion = obj.version;
  if (typeof fromVersion !== "number" || !Number.isInteger(fromVersion) || fromVersion < 1) {
    throw new ProjectLoadError("unknown_format", `Invalid project version: ${String(fromVersion)}`);
  }
  if (fromVersion > target) {
    throw new ProjectLoadError("too_new", `Project version ${fromVersion} is newer than supported ${target}`, {
      fromVersion,
      supported: target,
    });
  }

  let data = obj;
  for (let v = fromVersion; v < target; v++) {
    const migrate = migrations[v];
    if (!migrate) throw new Error(`Missing project migration v${v} -> v${v + 1}`);
    data = { ...migrate(data), version: v + 1 };
  }
  return { data, fromVersion };
}
