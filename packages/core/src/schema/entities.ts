import { z } from "zod";

/** Storage format (SCHEMA.md, sections 2–3). */

export const PROJECT_FORMAT = "vn-dialogs-builder.project";
export const PROJECT_VERSION = 4;

const id = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_-]{10}$`), `Expected a "${prefix}_" id`);

export const ProjectId = id("prj");
export const CharacterId = id("chr");
export const SceneId = id("scn");
export const BlockId = id("blk");
export const LineId = id("ln");

/**
 * Where a line leads: a block of this scene, a deliberate end, or a jump to the start of another scene.
 */
export const NextTarget = z.discriminatedUnion("type", [
  z.object({ type: z.literal("block"), blockId: BlockId }),
  z.object({ type: z.literal("end") }),
  z.object({ type: z.literal("scene"), sceneId: SceneId }),
]);
export const Next = NextTarget.nullable();

export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected a #RRGGBB color");

export const Character = z.object({
  id: CharacterId,
  name: z.string().min(1),
  color: HexColor,
  description: z.string(),
  speechStyle: z.string(),
  builtIn: z.literal("author").optional(),
});

/** A line: text and its own output. */
export const Line = z.object({
  id: LineId,
  text: z.string(),
  next: Next,
});

/** A point on the canvas. */
export const Position = z.object({ x: z.number().finite(), y: z.number().finite() });

/**
 * A block is one character's lines. One line is an ordinary dialogue step;
 * several are a choice: the player picks one, and each continues along its own path.
 */
export const Block = z.object({
  id: BlockId,
  characterId: CharacterId.nullable(),
  lines: z.array(Line).min(1),
  /**
   * Canvas position if the user moved the block manually. Without it the block
   * is laid out automatically. Does not affect dialogue logic and is not exported.
   */
  pos: Position.optional(),
});

export const Scene = z.object({
  id: SceneId,
  name: z.string().min(1),
  description: z.string(),
  startBlockId: BlockId.nullable(),
  blocks: z.record(BlockId, Block),
});

/** Schema without invariants. For full validation use `Project` from `./project.ts`. */
export const ProjectShape = z.object({
  format: z.literal(PROJECT_FORMAT),
  version: z.literal(PROJECT_VERSION),
  appVersion: z.string(),
  id: ProjectId,
  name: z.string().min(1),
  description: z.string(),
  characters: z.record(CharacterId, Character),
  characterOrder: z.array(CharacterId),
  scenes: z.record(SceneId, Scene),
  sceneOrder: z.array(SceneId),
});

export type ProjectId = z.infer<typeof ProjectId>;
export type CharacterId = z.infer<typeof CharacterId>;
export type SceneId = z.infer<typeof SceneId>;
export type BlockId = z.infer<typeof BlockId>;
export type LineId = z.infer<typeof LineId>;
export type NextTarget = z.infer<typeof NextTarget>;
export type Next = z.infer<typeof Next>;
export type Character = z.infer<typeof Character>;
export type Line = z.infer<typeof Line>;
export type Block = z.infer<typeof Block>;
export type Position = z.infer<typeof Position>;
export type Scene = z.infer<typeof Scene>;
export type Project = z.infer<typeof ProjectShape>;

/**
 * An output is a block's line: `{ blockId, lineId }`.
 * `lineId` may be omitted if the block has one line.
 */
export type Output = { blockId: BlockId; lineId?: LineId };
export const Output = z.object({ blockId: BlockId, lineId: LineId.optional() });
