import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  backupFileName,
  createProject,
  findInvariantViolations,
  migrateProject,
  parseProjectFile,
  Project,
  ProjectLoadError,
  randomId,
  serializeProject,
  sequentialIds,
} from "../src";

const fixture = readFileSync(new URL("./fixtures/project.v4.json", import.meta.url), "utf8");
const fixtureV3 = readFileSync(new URL("./fixtures/project.v3.json", import.meta.url), "utf8");
const fixtureV2 = readFileSync(new URL("./fixtures/project.v2.json", import.meta.url), "utf8");
const fixtureV1 = readFileSync(new URL("./fixtures/project.v1.json", import.meta.url), "utf8");
const BEN = "Привіт, ГГ! З самого ранку вже на ногах, хехе. Відра не надто важкі? Може, допомогти донести?";

describe("project schema", () => {
  it("accepts the SCHEMA.md example", () => {
    const { project, migrated, fromVersion } = parseProjectFile(fixture);
    expect(project.name).toBe("Ранок у селі");
    expect(migrated).toBe(false);
    expect(fromVersion).toBe(4);
    expect(project.scenes.scn_Qw8rT2yUiO!.blocks.blk_a1a1a1a1a1!.pos).toEqual({ x: 320, y: 180 });
  });

  it("serializes with stable key order and round-trips", () => {
    const { project } = parseProjectFile(fixture);
    const text = serializeProject(project);
    expect(text.endsWith("}\n")).toBe(true);
    expect(parseProjectFile(text).project).toEqual(project);
    // Перестановка ключів не змінює результат серіалізації.
    const shuffled = JSON.parse(text);
    const reversedScenes = Object.fromEntries(Object.entries(shuffled.scenes).reverse());
    expect(serializeProject({ ...project, scenes: reversedScenes as typeof project.scenes })).toBe(text);
  });

  it("createProject makes the author and an empty first scene", () => {
    const p = createProject({ name: "Літо в Заліссі", appVersion: "1.0.0", newId: sequentialIds() });
    expect(Project.safeParse(p).success).toBe(true);
    const chars = Object.values(p.characters);
    expect(chars).toHaveLength(1);
    expect(chars[0]).toMatchObject({ name: "Автор", builtIn: "author" });
    expect(p.sceneOrder).toHaveLength(1);
    expect(p.scenes[p.sceneOrder[0]!]).toMatchObject({ name: "Сцена 1", startBlockId: null, blocks: {} });
  });

  it("random ids match the id format", () => {
    for (let i = 0; i < 50; i++) expect(randomId("blk")).toMatch(/^blk_[A-Za-z0-9_-]{10}$/);
  });

  describe("invariants", () => {
    const base = () => JSON.parse(fixture);

    it.each([
      ["record key mismatch", (p: any) => (p.characters.chr_k3Jd9sQpLm.id = "chr_xxxxxxxxxx")],
      ["order mismatch", (p: any) => p.sceneOrder.push("scn_zzzzzzzzzz")],
      ["order duplicates", (p: any) => p.characterOrder.push("chr_k3Jd9sQpLm")],
      ["no author", (p: any) => delete p.characters.chr_author0001.builtIn],
      ["two authors", (p: any) => (p.characters.chr_k3Jd9sQpLm.builtIn = "author")],
      ["duplicate line id", (p: any) => (p.scenes.scn_Qw8rT2yUiO.blocks.blk_c3c3c3c3c3.lines[1].id = "ln_c3c3c3c3c3")],
      ["line id equal to another line", (p: any) => (p.scenes.scn_Qw8rT2yUiO.blocks.blk_d4d4d4d4d4.lines[0].id = "ln_a1a1a1a1a1")],
      ["block without lines", (p: any) => (p.scenes.scn_Qw8rT2yUiO.blocks.blk_d4d4d4d4d4.lines = [])],
      ["next outside scene", (p: any) => (p.scenes.scn_Qw8rT2yUiO.blocks.blk_d4d4d4d4d4.lines[0].next = { type: "block", blockId: "blk_zzzzzzzzzz" })],
      ["scene transition to a missing scene", (p: any) => (p.scenes.scn_Qw8rT2yUiO.blocks.blk_d4d4d4d4d4.lines[0].next = { type: "scene", sceneId: "scn_zzzzzzzzzz" })],
      ["scene transition to the same scene", (p: any) => (p.scenes.scn_Qw8rT2yUiO.blocks.blk_d4d4d4d4d4.lines[0].next = { type: "scene", sceneId: "scn_Qw8rT2yUiO" })],
      ["start outside scene", (p: any) => (p.scenes.scn_Qw8rT2yUiO.startBlockId = "blk_zzzzzzzzzz")],
      ["unknown character", (p: any) => (p.scenes.scn_Qw8rT2yUiO.blocks.blk_a1a1a1a1a1.characterId = "chr_zzzzzzzzzz")],
    ])("rejects %s", (_name, mutate) => {
      const p = base();
      mutate(p);
      expect(findInvariantViolations(p).length).toBeGreaterThan(0);
      expect(Project.safeParse(p).success).toBe(false);
    });

    it("allows a null character (deleted character)", () => {
      const p = base();
      p.scenes.scn_Qw8rT2yUiO.blocks.blk_a1a1a1a1a1.characterId = null;
      expect(Project.safeParse(p).success).toBe(true);
    });
  });
});

describe("project loading and migrations", () => {
  it("rejects invalid JSON", () => {
    expect(() => parseProjectFile("{nope")).toThrow(expect.objectContaining({ kind: "invalid_json" }));
  });

  it("rejects an unknown format", () => {
    expect(() => parseProjectFile(JSON.stringify({ format: "other", version: 1 }))).toThrow(
      expect.objectContaining({ kind: "unknown_format" }),
    );
  });

  it("refuses files from a newer app version", () => {
    const p = JSON.parse(fixture);
    p.version = 5;
    try {
      parseProjectFile(JSON.stringify(p));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ProjectLoadError);
      expect((e as ProjectLoadError).kind).toBe("too_new");
    }
  });

  it("reports validation errors", () => {
    const p = JSON.parse(fixture);
    p.characters.chr_k3Jd9sQpLm.color = "red";
    expect(() => parseProjectFile(JSON.stringify(p))).toThrow(expect.objectContaining({ kind: "invalid" }));
  });

  it("migrates v1 files: line blocks keep their text, choice prompts become a block before the choice", () => {
    const { project, migrated, fromVersion } = parseProjectFile(fixtureV1);
    expect({ migrated, fromVersion, version: project.version }).toEqual({ migrated: true, fromVersion: 1, version: 4 });
    const scene = project.scenes.scn_Qw8rT2yUiO!;
    expect(scene.blocks.blk_a1a1a1a1a1!.lines).toEqual([
      { id: "ln_a1a1a1a1a1", text: "[Бен — мисливець]", next: { type: "block", blockId: expect.stringMatching(/^blk_/) } },
    ]);
    // Питання Олі стало окремим блоком перед вибором, а варіанти — репліками блоку вибору.
    const promptId = (scene.blocks.blk_a1a1a1a1a1!.lines[0]!.next as { blockId: string }).blockId;
    expect(promptId).not.toBe("blk_b2b2b2b2b2");
    expect(scene.blocks[promptId]).toMatchObject({
      characterId: "chr_k3Jd9sQpLm",
      lines: [{ text: BEN, next: { type: "block", blockId: "blk_b2b2b2b2b2" } }],
    });
    expect(scene.blocks.blk_b2b2b2b2b2!.lines.map((l) => [l.id, l.text])).toEqual([
      ["ln_c3c3c3c3c3", "О, Бене, доброго ранку! Та ні, не надто важкі. Але якщо ти так хочеш допомогти, візьми одне відро."],
      ["ln_e5e5e5e5e5", "Доброго ранку, Бене! Дякую, але я сама впораюся."],
    ]);
    expect(scene.blocks.blk_d4d4d4d4d4!.lines[0]!.next).toEqual({ type: "end" });
  });

  it("migrates v2 files unchanged apart from the version", () => {
    const { project, migrated, fromVersion } = parseProjectFile(fixtureV2);
    expect({ migrated, fromVersion }).toEqual({ migrated: true, fromVersion: 2 });
    expect({ ...project, version: 2 }).toEqual(JSON.parse(fixtureV2));
  });

  it("migrates v3 files unchanged apart from the version: no block has a manual position", () => {
    const { project, migrated, fromVersion } = parseProjectFile(fixtureV3);
    expect({ migrated, fromVersion, version: project.version }).toEqual({ migrated: true, fromVersion: 3, version: 4 });
    expect({ ...project, version: 3 }).toEqual(JSON.parse(fixtureV3));
  });

  it("migration redirects a start that pointed at a choice block", () => {
    const p = JSON.parse(fixtureV1);
    p.scenes.scn_Qw8rT2yUiO.startBlockId = "blk_b2b2b2b2b2";
    const { project } = parseProjectFile(JSON.stringify(p));
    const scene = project.scenes.scn_Qw8rT2yUiO!;
    expect(scene.blocks[scene.startBlockId!]!.lines[0]!.text).toBe(BEN);
  });

  it("runs a migration chain and reports the source version", () => {
    const v1 = { format: "vn-dialogs-builder.project", version: 1, a: 1 };
    const result = migrateProject(
      v1,
      {
        1: (raw) => ({ ...raw, b: 2 }),
        2: (raw) => ({ ...raw, c: 3 }),
      },
      3,
    );
    expect(result).toEqual({ fromVersion: 1, data: { format: "vn-dialogs-builder.project", version: 3, a: 1, b: 2, c: 3 } });
  });

  it("fails loudly when a migration step is missing", () => {
    expect(() => migrateProject({ format: "vn-dialogs-builder.project", version: 1 }, {}, 3)).toThrow(/Missing/);
  });

  it("names backups by project and old version", () => {
    expect(backupFileName("prj_Zx7vB4nM2q", 1)).toBe("prj_Zx7vB4nM2q.v1.bak.json");
  });
});
