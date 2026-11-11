import type { z } from "zod";
import { randomId, type IdGenerator } from "../ids";
import {
  PROJECT_FORMAT,
  PROJECT_VERSION,
  ProjectShape,
  type Character,
  type Project as ProjectT,
  type Scene,
} from "./entities";
import { findInvariantViolations } from "./invariants";

/** Повна схема файлу проєкту: форма + інваріанти. */
export const Project = ProjectShape.superRefine((project, ctx) => {
  for (const v of findInvariantViolations(project)) {
    ctx.addIssue({ code: "custom", path: v.path, message: v.message });
  }
});

export type ProjectInput = z.input<typeof Project>;

export const AUTHOR_NAME = "Автор";
export const AUTHOR_COLOR = "#888888";
export const DEFAULT_SCENE_NAME = "Сцена 1";

/** Палітра для автоматичного вибору кольору нового персонажа. */
export const CHARACTER_PALETTE = [
  "#e5487a",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#84cc16",
  "#ec4899",
  "#f97316",
] as const;

export type CreateProjectArgs = {
  name: string;
  description?: string;
  appVersion: string;
  newId?: IdGenerator;
};

/**
 * Новий проєкт: лише назва, плюс «Автор» і порожня «Сцена 1» (FLOWS.md, розділ 15).
 */
export function createProject({ name, description = "", appVersion, newId = randomId }: CreateProjectArgs): ProjectT {
  const author: Character = {
    id: newId("chr"),
    name: AUTHOR_NAME,
    color: AUTHOR_COLOR,
    description: "",
    speechStyle: "",
    builtIn: "author",
  };
  const scene: Scene = {
    id: newId("scn"),
    name: DEFAULT_SCENE_NAME,
    description: "",
    startBlockId: null,
    blocks: {},
  };
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    appVersion,
    id: newId("prj"),
    name,
    description,
    characters: { [author.id]: author },
    characterOrder: [author.id],
    scenes: { [scene.id]: scene },
    sceneOrder: [scene.id],
  };
}

export function getAuthor(project: ProjectT): Character {
  const author = Object.values(project.characters).find((c) => c.builtIn === "author");
  if (!author) throw new Error("Project has no author character");
  return author;
}

/** Тип проєкту під тим самим ім'ям, що й схема: `Project` — і значення, і тип. */
export type Project = ProjectT;
