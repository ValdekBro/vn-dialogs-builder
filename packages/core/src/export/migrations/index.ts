/**
 * Міграції файлу експорту (SCHEMA.md, розділ 8).
 *
 * Ключ — версія, з якої мігрує функція: `EXPORT_MIGRATIONS[1]` перетворює v1 на v2.
 * Імпорт приймає будь-яку версію, що колись виходила, тож міграції ніколи не видаляються.
 * Кожну нову версію запишіть у журнал змін у SCHEMA.md і покрийте тестом на фікстурі.
 */
type RawExport = Record<string, unknown>;
type Migration = (raw: RawExport) => RawExport;

export const EXPORT_MIGRATIONS: Record<number, Migration> = {};

const FORMAT = "vn-dialogs-builder.export";
const CURRENT = 1;

export class ExportFormatError extends Error {
  constructor(
    readonly kind: "unknown_format" | "too_new",
    message: string,
  ) {
    super(message);
    this.name = "ExportFormatError";
  }
}

export function migrateExport(raw: unknown, migrations = EXPORT_MIGRATIONS, target = CURRENT): RawExport {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ExportFormatError("unknown_format", "Export file is not an object");
  }
  const obj = raw as RawExport;
  if (obj.format !== FORMAT) throw new ExportFormatError("unknown_format", `Unknown export format: ${String(obj.format)}`);
  const version = obj.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new ExportFormatError("unknown_format", `Invalid export version: ${String(version)}`);
  }
  if (version > target) {
    throw new ExportFormatError("too_new", `Export version ${version} is newer than supported ${target}`);
  }
  let data = obj;
  for (let v = version; v < target; v++) {
    const migrate = migrations[v];
    if (!migrate) throw new Error(`Missing export migration v${v} -> v${v + 1}`);
    data = { ...migrate(data), version: v + 1 };
  }
  return data;
}
