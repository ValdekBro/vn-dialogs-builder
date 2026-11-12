import { CoreError } from "../errors";
import { getCharacter } from "../queries";
import type { Character, CharacterId, Project } from "../schema/entities";
import { CHARACTER_PALETTE } from "../schema/project";
import { defineCommand, requireName, requirePermutation, validateColor } from "./util";

export type CreateCharacterArgs = {
  name: string;
  color?: string;
  description?: string;
  speechStyle?: string;
};

/** The first palette colour not yet used in the project; if all are taken, wrap around. */
export function pickCharacterColor(project: Project): string {
  const used = new Set(Object.values(project.characters).map((c) => c.color.toLowerCase()));
  const free = CHARACTER_PALETTE.find((c) => !used.has(c));
  return free ?? CHARACTER_PALETTE[project.characterOrder.length % CHARACTER_PALETTE.length]!;
}

export const createCharacter = defineCommand({
  name: "createCharacter",
  label: (a: CreateCharacterArgs) => `Створити персонажа «${a.name}»`,
  run(draft, args: CreateCharacterArgs, ctx) {
    const character: Character = {
      id: ctx.newId("chr"),
      name: requireName(args.name, "Character"),
      color: args.color !== undefined ? validateColor(args.color) : pickCharacterColor(draft),
      description: args.description ?? "",
      speechStyle: args.speechStyle ?? "",
    };
    draft.characters[character.id] = character;
    draft.characterOrder.push(character.id);
    return { characterId: character.id };
  },
});

export type UpdateCharacterArgs = {
  characterId: CharacterId;
  name?: string;
  color?: string;
  description?: string;
  speechStyle?: string;
};

export const updateCharacter = defineCommand({
  name: "updateCharacter",
  label: () => "Змінити персонажа",
  run(draft, args: UpdateCharacterArgs) {
    const ch = getCharacter(draft, args.characterId);
    if (args.name !== undefined) ch.name = requireName(args.name, "Character");
    if (args.color !== undefined) ch.color = validateColor(args.color);
    if (args.description !== undefined) ch.description = args.description;
    if (args.speechStyle !== undefined) ch.speechStyle = args.speechStyle;
    return { characterId: ch.id };
  },
});

export type DeleteCharacterArgs = { characterId: CharacterId };

/** The character's blocks stay: their `characterId` becomes `null` and they are flagged as an issue. */
export const deleteCharacter = defineCommand({
  name: "deleteCharacter",
  label: () => "Видалити персонажа",
  run(draft, args: DeleteCharacterArgs) {
    const ch = getCharacter(draft, args.characterId);
    if (ch.builtIn === "author") throw new CoreError("FORBIDDEN", "The built-in Author character cannot be deleted");
    const affectedBlockIds: string[] = [];
    for (const sceneId of draft.sceneOrder) {
      for (const block of Object.values(draft.scenes[sceneId]!.blocks)) {
        if (block.characterId === ch.id) {
          block.characterId = null;
          affectedBlockIds.push(block.id);
        }
      }
    }
    delete draft.characters[ch.id];
    draft.characterOrder = draft.characterOrder.filter((id) => id !== ch.id);
    return { deletedId: args.characterId, affectedBlockIds };
  },
});

export type ReorderCharactersArgs = { characterIds: CharacterId[] };

export const reorderCharacters = defineCommand({
  name: "reorderCharacters",
  label: () => "Змінити порядок персонажів",
  run(draft, args: ReorderCharactersArgs) {
    requirePermutation(args.characterIds, draft.characterOrder, "characterIds");
    draft.characterOrder = [...args.characterIds];
    return {};
  },
});
