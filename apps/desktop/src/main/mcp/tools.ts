import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  countBlocksOfCharacter,
  countIssues,
  findBlocks,
  getBlock,
  getCharacter,
  getLine,
  getScene,
  incomingOf,
  linesRemovedByUpdate,
  projectIssues,
  resolveCharacter,
  sceneIssues,
  sceneOutline,
  type Block,
  type Project,
  type Scene,
} from "@vn/core";
import { z } from "zod";
import type { CommandName } from "../../shared/api";
import { AppError, toApiError } from "../project-store/errors";
import type { ProjectStore } from "../project-store/project-store";
import type { Approvals } from "./approvals";

export type ToolContext = {
  store: ProjectStore;
  approvals: Approvals;
  /** Кожен виклик інструмента — для індикатора агента у вікні. */
  onActivity?: (tool: string) => void;
};

/** Інструкції сервера (MCP.md, 3): коротко пояснюють агенту модель. */
export const SERVER_INSTRUCTIONS = `VNami is a branching visual-novel dialogue editor. The project consists of characters and scenes and has a lore description: read it with get_project before writing content.
A scene is a graph of blocks. A block is one character and their lines; every line has its own output "next". One line is an ordinary dialogue step; several lines are a player choice. "next" is: null (not connected, an issue), {type:"block",blockId} (a block of the same scene), {type:"end"} (a deliberate end of the story) or {type:"scene",sceneId} (jump to the start of another scene). Branching is only possible via several lines in a block. Several outputs may lead into one block (convergence) and links may go back (cycles).
To read a scene use get_scene with format "outline". To create a linear dialogue use add_chain, for a branching part use add_tree. Check list_issues after changes.
Deletions run only after a human approves them in the app: if the result is "rejected" or "timeout", tell the user and do not retry without a new request from them.
The "Автор" (Author) character always exists and is used for narration. Respect characters' description and speechStyle when writing their lines. Dialogue content is usually Ukrainian.`;

// ── Спільні схеми (MCP.md, 4) ───────────────────────────────

const Next = z
  .union([
    z.null(),
    z.object({ type: z.literal("block"), blockId: z.string() }),
    z.object({ type: z.literal("end") }),
    z.object({ type: z.literal("scene"), sceneId: z.string() }),
  ])
  .describe('null | {type:"block",blockId} | {type:"end"} | {type:"scene",sceneId}');
const Output = z
  .object({ blockId: z.string(), lineId: z.string().optional() })
  .describe("An output is a line of a block; lineId may be omitted when the block has a single line");
const CharacterRef = z.string().describe('Character id ("chr_…") or exact name');
const Reason = z.string().optional().describe("Why — shown to the human in the approval request");

// add_tree: рекурсивна структура (MCP.md, 5.7).
type TreeNodeIn = {
  label?: string;
  character: string;
  text?: string;
  next?: TreeTargetIn;
  lines?: { text: string; next?: TreeTargetIn }[];
};
type TreeTargetIn = TreeNodeIn | { ref: string } | { blockId: string } | { end: true } | { scene: string } | null;
const TreeTarget: z.ZodType<TreeTargetIn> = z.lazy(() =>
  z.union([
    z.null(),
    z.object({ ref: z.string() }).strict(),
    z.object({ blockId: z.string() }).strict(),
    z.object({ end: z.literal(true) }).strict(),
    z.object({ scene: z.string() }).strict(),
    TreeNode,
  ]),
);
const TreeNode: z.ZodType<TreeNodeIn> = z.lazy(() =>
  z.object({
    label: z.string().optional().describe("Local label for { ref } links within this call"),
    character: CharacterRef,
    text: z.string().optional().describe("A single line… (use either text or lines)"),
    next: TreeTarget.optional(),
    lines: z.array(z.object({ text: z.string(), next: TreeTarget.optional() })).min(1).optional().describe("…or several lines — a choice"),
  }),
);

// ── Відповіді ──────────────────────────────────────────────

function ok(data: Record<string, unknown>, text?: string): CallToolResult {
  return { content: [{ type: "text", text: text ?? JSON.stringify(data) }], structuredContent: data };
}

function fail(e: unknown): CallToolResult {
  const err = toApiError(e);
  return { isError: true, content: [{ type: "text", text: JSON.stringify(err) }] };
}

/** Регістр інструментів: обробник отримує активний проєкт або помилку NO_PROJECT_OPEN. */
export function registerTools(server: McpServer, ctx: ToolContext) {
  const { store, approvals } = ctx;

  const project = (): Project => {
    const p = store.activeProject;
    if (!p) throw new AppError("NO_PROJECT_OPEN", "No project is open in the app. Ask the user to open one.");
    return p;
  };
  const run = <R>(command: CommandName, args: unknown) => store.execute(command, args, "agent") as R;
  const issues = () => countIssues(projectIssues(project()));
  const charId = (ref: string | null | undefined) => (ref === null || ref === undefined ? ref : resolveCharacter(project(), ref).id);
  const blockOut = (blockId: string) => {
    const { scene, block } = getBlock(project(), blockId);
    return { ...block, sceneId: scene.id };
  };
  const sceneSummary = (s: Scene) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    startBlockId: s.startBlockId,
    blockCount: Object.keys(s.blocks).length,
    issueCount: sceneIssues(s, project()).length,
  });
  const sceneNoBlocks = (s: Scene) => ({ id: s.id, name: s.name, description: s.description, startBlockId: s.startBlockId });
  const preview = (b: Block) => {
    const p = project();
    const who = b.characterId ? (p.characters[b.characterId]?.name ?? "?") : "(без персонажа)";
    const text = b.lines.map((l) => l.text).join(" / ");
    return `${who}: ${text.length > 90 ? text.slice(0, 89) + "…" : text}`;
  };

  type Shape = z.ZodRawShape;
  function tool<S extends Shape>(
    name: string,
    description: string,
    shape: S,
    handler: (args: z.infer<z.ZodObject<S>>) => Promise<CallToolResult> | CallToolResult,
    readOnly = false,
  ) {
    server.registerTool(
      name,
      { description, inputSchema: shape, annotations: { readOnlyHint: readOnly } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (args: any) => {
        ctx.onActivity?.(name);
        try {
          return await handler(args ?? {});
        } catch (e) {
          return fail(e);
        }
      }) as never,
    );
  }

  /** Видалення лише після схвалення людиною (MCP.md, 5.9). */
  async function approve(input: Parameters<Approvals["request"]>[0], action: () => Record<string, unknown>): Promise<CallToolResult> {
    const status = await approvals.request(input);
    if (status !== "approved") {
      const text =
        status === "rejected"
          ? "The user rejected the deletion. Nothing was changed. Do not retry unless the user asks."
          : "The user did not answer in time. Nothing was changed. Tell the user and do not retry automatically.";
      return ok({ status }, text);
    }
    return ok({ status, ...action(), issues: issues() });
  }

  // ── 5.1 Читання ──────────────────────────────────────────

  tool("list_projects", "List all projects in the app. Only the open (active) one can be read or edited; only the human switches projects.", {}, async () => {
    const active = store.activeProject?.id ?? null;
    const projects = (await store.listProjects()).map((p) => ({ id: p.id, name: p.name, isActive: p.id === active, sceneCount: p.sceneCount }));
    return ok({ projects });
  }, true);

  tool("get_project", "The active project: name, lore description, characters and scenes. Read this before writing content.", {}, () => {
    const p = project();
    return ok({
      id: p.id,
      name: p.name,
      description: p.description,
      characters: p.characterOrder.map((id) => p.characters[id]!),
      scenes: p.sceneOrder.map((id) => {
        const s = sceneSummary(p.scenes[id]!);
        return { id: s.id, name: s.name, description: s.description, blockCount: s.blockCount, issueCount: s.issueCount };
      }),
    });
  }, true);

  tool("list_characters", "All characters in display order.", {}, () => {
    const p = project();
    return ok({ characters: p.characterOrder.map((id) => p.characters[id]!) });
  }, true);

  tool("get_character", "One character with all details and the number of blocks they speak in.", { character: CharacterRef }, ({ character }) => {
    const ch = resolveCharacter(project(), character);
    return ok({ ...ch, blockCount: countBlocksOfCharacter(project(), ch.id) });
  }, true);

  tool("list_scenes", "Scenes in display order with block and issue counts.", {}, () => {
    const p = project();
    return ok({ scenes: p.sceneOrder.map((id) => sceneSummary(p.scenes[id]!)) });
  }, true);

  tool(
    "get_scene",
    'A scene. format "outline" (default) is a compact text tree for reading; "json" is the exact structure.',
    { sceneId: z.string(), format: z.enum(["outline", "json"]).optional() },
    ({ sceneId, format }) => {
      const scene = getScene(project(), sceneId);
      if (format === "json") return ok({ scene });
      const outline = sceneOutline(project(), scene.id);
      return ok({ outline }, outline);
    },
    true,
  );

  tool("get_block", "A block with its scene, incoming links and whether it is the scene start.", { blockId: z.string() }, ({ blockId }) => {
    const { scene, block } = getBlock(project(), blockId);
    return ok({ ...block, sceneId: scene.id, incoming: incomingOf(scene, block.id), isStart: scene.startBlockId === block.id });
  }, true);

  tool(
    "find_blocks",
    "Search blocks: case-insensitive substring in line text, by character, by scene; choicesOnly — blocks with several lines.",
    {
      query: z.string().optional(),
      character: CharacterRef.optional(),
      sceneId: z.string().optional(),
      choicesOnly: z.boolean().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    },
    ({ character, ...rest }) => {
      const results = findBlocks(project(), { ...rest, characterId: charId(character) ?? undefined });
      return ok({ results });
    },
    true,
  );

  tool("list_issues", "Problems in the project or one scene (unconnected outputs, unreachable blocks, empty text…).", { sceneId: z.string().optional() }, ({ sceneId }) => {
    if (sceneId) getScene(project(), sceneId);
    const list = projectIssues(project(), sceneId);
    return ok({ issues: list, counts: countIssues(list) });
  }, true);

  // ── 5.1a Проєкт ──────────────────────────────────────────

  tool("update_project", "Change the active project's name and/or lore description.", { name: z.string().optional(), description: z.string().optional() }, (args) => {
    run("updateProject", args);
    const p = project();
    return ok({ id: p.id, name: p.name, description: p.description });
  });

  // ── 5.2 Персонажі ────────────────────────────────────────

  tool(
    "create_character",
    "Create a character. A color is picked automatically if omitted.",
    { name: z.string(), color: z.string().optional().describe("#RRGGBB"), description: z.string().optional(), speechStyle: z.string().optional() },
    (args) => {
      const { characterId } = run<{ characterId: string }>("createCharacter", args);
      return ok({ ...getCharacter(project(), characterId), issues: issues() });
    },
  );

  tool(
    "update_character",
    "Change a character's name, color, description or speech style.",
    { character: CharacterRef, name: z.string().optional(), color: z.string().optional(), description: z.string().optional(), speechStyle: z.string().optional() },
    ({ character, ...rest }) => {
      const characterId = resolveCharacter(project(), character).id;
      run("updateCharacter", { characterId, ...rest });
      return ok({ ...getCharacter(project(), characterId), issues: issues() });
    },
  );

  tool(
    "delete_character",
    "Delete a character (needs the human's approval). Their blocks stay but lose the character. The Author cannot be deleted.",
    { character: CharacterRef, reason: Reason },
    async ({ character, reason }) => {
      const ch = resolveCharacter(project(), character);
      if (ch.builtIn === "author") throw new AppError("FORBIDDEN", "The built-in Author character cannot be deleted");
      const n = countBlocksOfCharacter(project(), ch.id);
      return approve(
        {
          tool: "delete_character",
          title: `Видалити персонажа «${ch.name}»`,
          items: [n > 0 ? `Його блоки (${n}) лишаться без персонажа` : "Блоків у нього немає"],
          reason: reason ?? null,
          sceneId: null,
          blockIds: [],
        },
        () => run("deleteCharacter", { characterId: ch.id }),
      );
    },
  );

  // ── 5.3 Сцени ────────────────────────────────────────────

  tool("create_scene", "Create an empty scene.", { name: z.string(), description: z.string().optional() }, (args) => {
    const { sceneId } = run<{ sceneId: string }>("createScene", args);
    return ok({ ...getScene(project(), sceneId), issues: issues() });
  });

  tool(
    "update_scene",
    "Change a scene's name, description or start block.",
    { sceneId: z.string(), name: z.string().optional(), description: z.string().optional(), startBlockId: z.string().nullable().optional() },
    (args) => {
      run("updateScene", args);
      return ok({ ...sceneNoBlocks(getScene(project(), args.sceneId)), issues: issues() });
    },
  );

  tool("delete_scene", "Delete a scene with all its blocks (needs the human's approval).", { sceneId: z.string(), reason: Reason }, async ({ sceneId, reason }) => {
    const scene = getScene(project(), sceneId);
    const n = Object.keys(scene.blocks).length;
    return approve(
      { tool: "delete_scene", title: `Видалити сцену «${scene.name}»`, items: [`Блоків у сцені: ${n}`], reason: reason ?? null, sceneId: null, blockIds: [] },
      () => run("deleteScene", { sceneId }),
    );
  });

  tool("duplicate_scene", "Copy a scene with new ids.", { sceneId: z.string(), name: z.string().optional() }, (args) => {
    const { sceneId } = run<{ sceneId: string }>("duplicateScene", args);
    return ok({ ...getScene(project(), sceneId), issues: issues() });
  });

  // ── 5.4 Блоки ────────────────────────────────────────────

  tool(
    "add_block",
    "Add a block: one line via text (+ next) or a choice via lines. from connects it to an output; insert puts it between from and its old next. The first block of an empty scene becomes its start.",
    {
      sceneId: z.string(),
      character: CharacterRef,
      text: z.string().optional(),
      next: Next.optional(),
      lines: z.array(z.object({ text: z.string(), next: Next.optional() })).min(1).optional(),
      from: Output.optional(),
      insert: z.boolean().optional(),
    },
    ({ sceneId, character, text, next, lines, from, insert }) => {
      if ((text === undefined) === (lines === undefined)) throw new AppError("INVALID_ARGUMENT", "Pass either text or lines");
      const items = lines ?? [{ text: text!, ...(next !== undefined ? { next } : {}) }];
      const { blockId } = run<{ blockId: string }>("addBlock", { sceneId, characterId: charId(character), lines: items, from, insert });
      return ok({ ...blockOut(blockId), issues: issues() });
    },
  );

  tool(
    "update_block",
    "Edit a block in one step: character and/or the FULL new list of lines ({id?, text, next?}). Items with id update a line (next kept if omitted), items without id add lines, the order becomes the new order, missing lines are deleted (needs the human's approval).",
    {
      blockId: z.string(),
      character: CharacterRef.optional(),
      lines: z.array(z.object({ id: z.string().optional(), text: z.string(), next: Next.optional() })).min(1).optional(),
      reason: Reason,
    },
    async ({ blockId, character, lines, reason }) => {
      const args = { blockId, ...(character !== undefined ? { characterId: charId(character) } : {}), ...(lines ? { lines } : {}) };
      const removed = linesRemovedByUpdate(project(), args);
      const act = () => {
        run("updateBlock", args);
        return blockOut(blockId);
      };
      if (removed.length === 0) return ok({ ...act(), issues: issues() });
      const { scene, block } = getBlock(project(), blockId);
      return approve(
        {
          tool: "update_block",
          title: removed.length === 1 ? "Видалити репліку" : `Видалити репліки (${removed.length})`,
          items: block.lines.filter((l) => removed.includes(l.id)).map((l) => `«${l.text}»`),
          reason: reason ?? null,
          sceneId: scene.id,
          blockIds: [blockId],
        },
        act,
      );
    },
  );

  tool(
    "delete_blocks",
    "Delete one or more blocks with one approval request (needs the human's approval). Links into them become unconnected.",
    { blockIds: z.array(z.string()).min(1), reason: Reason },
    async ({ blockIds, reason }) => {
      const found = blockIds.map((id) => getBlock(project(), id));
      return approve(
        {
          tool: "delete_blocks",
          title: found.length === 1 ? "Видалити блок" : `Видалити блоки (${found.length})`,
          items: found.map((f) => preview(f.block)),
          reason: reason ?? null,
          sceneId: found[0]!.scene.id,
          blockIds,
        },
        () => run("deleteBlocks", { blockIds }),
      );
    },
  );

  // ── 5.5 Репліки ──────────────────────────────────────────

  tool(
    "add_line",
    "Add a line to a block; a second line makes the block a choice.",
    { blockId: z.string(), text: z.string(), index: z.number().int().min(0).optional(), next: Next.optional() },
    (args) => {
      run("addLine", args);
      return ok({ ...blockOut(args.blockId), issues: issues() });
    },
  );

  tool("update_line", "Change a line's text.", { lineId: z.string(), text: z.string() }, (args) => {
    const { blockId } = run<{ blockId: string }>("updateLine", args);
    return ok({ ...blockOut(blockId), issues: issues() });
  });

  tool("delete_line", "Delete a line (needs the human's approval). The last line of a block cannot be deleted — delete the block.", { lineId: z.string(), reason: Reason }, async ({ lineId, reason }) => {
    const { scene, block, line } = getLine(project(), lineId);
    if (block.lines.length === 1) throw new AppError("INVALID_ARGUMENT", "Cannot delete the only line of a block; delete the block instead");
    return approve(
      { tool: "delete_line", title: "Видалити репліку", items: [`«${line.text}»`], reason: reason ?? null, sceneId: scene.id, blockIds: [block.id] },
      () => {
        run("deleteLine", { lineId });
        return { block: blockOut(block.id) };
      },
    );
  });

  tool("reorder_lines", "Reorder a block's lines; lineIds must be a permutation of the existing ids.", { blockId: z.string(), lineIds: z.array(z.string()) }, (args) => {
    run("reorderLines", args);
    return ok({ ...blockOut(args.blockId), issues: issues() });
  });

  // ── 5.6 Зв'язки ──────────────────────────────────────────

  tool("set_next", "Connect, disconnect (null), mark the end ({type:\"end\"}) or jump to another scene's start for one output.", { from: Output, next: Next }, (args) => {
    const { blockId } = run<{ blockId: string }>("setNext", args);
    return ok({ ...blockOut(blockId), issues: issues() });
  });

  // ── 5.7 Пакетні ──────────────────────────────────────────

  tool(
    "add_chain",
    "Create a linear dialogue in one undo step. from connects the first block; end is the last block's next (default null).",
    {
      sceneId: z.string(),
      from: Output.optional(),
      insert: z.boolean().optional(),
      lines: z.array(z.object({ character: CharacterRef, text: z.string() })).min(1),
      end: Next.optional(),
    },
    (args) => {
      const { blockIds } = run<{ blockIds: string[] }>("addChain", args);
      return ok({ blockIds, issues: issues() });
    },
  );

  tool(
    "add_tree",
    "Create a branching part in one undo step. Nodes have text (+ next) or lines (a choice). Targets: a new node, {ref:label} (convergence within the call), {blockId}, {end:true}, {scene:sceneId} or null.",
    { sceneId: z.string(), from: Output.optional(), insert: z.boolean().optional(), root: TreeNode },
    (args) => {
      const r = run<{ blockIds: Record<string, string>; rootBlockId: string }>("addTree", args);
      return ok({ ...r, issues: issues() });
    },
  );

  // ── 5.8 Історія ──────────────────────────────────────────

  tool("undo", "Undo the last change (by the human or the agent).", {}, () => ok({ undone: store.undo() }));
  tool("redo", "Redo the last undone change.", {}, () => ok({ redone: store.redo() }));
}
