import type { Project } from "@vn/core";
import { applyPatches, enablePatches } from "immer";
import { create } from "zustand";
import type { HistoryState, ProjectSummary, SaveState, SessionEvent, SessionSnapshot } from "../../../shared/api";
import { call } from "../api";

enablePatches();

const EMPTY_HISTORY: HistoryState = { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null };

export type AppState = {
  ready: boolean;
  projects: ProjectSummary[];
  /** Mirror of the model from the main process. Changed only by patches, never directly. */
  project: Project | null;
  version: number;
  history: HistoryState;
  save: SaveState;
  /** The selected scene — editor state, not model state. */
  sceneId: string | null;
  /** Which project section is open: dialogue builder, characters or project info. */
  view: ProjectView;
  /** The character open in the "Characters" section. */
  characterId: string | null;
};

export type ProjectView = "builder" | "characters" | "project" | "simulation";

export const useApp = create<AppState>(() => ({
  ready: false,
  projects: [],
  project: null,
  version: 0,
  history: EMPTY_HISTORY,
  save: "saved",
  sceneId: null,
  view: "builder",
  characterId: null,
}));

function applySnapshot(s: SessionSnapshot) {
  const prevScene = useApp.getState().sceneId;
  useApp.setState({
    project: s.project,
    version: s.version,
    history: s.history,
    save: s.save,
    sceneId: pickScene(s.project, prevScene),
  });
}

/** Keeps the selected scene if it still exists, otherwise takes the first. */
function pickScene(project: Project, current: string | null): string | null {
  if (current && project.scenes[current]) return current;
  return project.sceneOrder[0] ?? null;
}

async function resync() {
  const snapshot = await call("session.get");
  if (snapshot) applySnapshot(snapshot);
  else useApp.setState({ project: null, version: 0, history: EMPTY_HISTORY, sceneId: null });
}

function onEvent(event: SessionEvent) {
  const state = useApp.getState();
  switch (event.type) {
    case "opened":
      if (state.project?.id !== event.snapshot.project.id) useApp.setState({ view: "builder", characterId: null });
      applySnapshot(event.snapshot);
      return;
    case "closed":
      useApp.setState({ project: null, version: 0, history: EMPTY_HISTORY, sceneId: null });
      return;
    case "changed": {
      // A missed event means the mirror has diverged from the model: reload the whole snapshot.
      if (!state.project || event.version !== state.version + 1) {
        void resync();
        return;
      }
      const project = applyPatches(state.project, event.patches);
      useApp.setState({
        project,
        version: event.version,
        history: event.history,
        sceneId: pickScene(project, state.sceneId),
      });
      return;
    }
    case "save":
      useApp.setState({ save: event.save });
      return;
    case "projects":
      useApp.setState({ projects: event.projects });
      return;
  }
}

let started = false;

/** Subscribes to main-process events and does the initial load. Called once. */
export async function startAppStore() {
  if (started) return;
  started = true;
  window.vn.onEvent(onEvent);
  const [projects] = await Promise.all([call("projects.list"), resync()]);
  useApp.setState({ projects, ready: true });
}

export function selectScene(sceneId: string) {
  useApp.setState({ sceneId, view: "builder" });
}

export function showView(view: ProjectView) {
  useApp.setState({ view });
}

/** Open a character's page in the "Characters" section. */
export function openCharacter(characterId: string) {
  useApp.setState({ view: "characters", characterId });
}

export async function refreshProjects() {
  useApp.setState({ projects: await call("projects.list") });
}
