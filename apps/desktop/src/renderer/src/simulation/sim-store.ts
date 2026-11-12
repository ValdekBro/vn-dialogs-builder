import type { BlockId, LineId, SceneId } from "@vn/core";
import { create } from "zustand";
import { showView, useApp } from "../store/app-store";
import { pick, startAt, step, type Cursor, type Entry, type Step } from "./engine";

/** The log keeps only the latest entries: a cycle without choices can play forever. */
const MAX_LOG = 500;

export const SPEEDS = [0.5, 0.75, 1, 1.5, 2, 3] as const;

type Choice = Extract<Entry, { kind: "choice" }>;

/** Dialogue playback state (FLOWS.md, 17). Not part of the model and never saved. */
export type SimState = {
  /** Where playback started — for "Restart". `null` — nothing has been played yet. */
  origin: { projectId: string; sceneId: SceneId; blockId?: BlockId } | null;
  log: Entry[];
  /** Entries of the current step that are not shown yet. */
  queue: Entry[];
  cursor: Cursor | null;
  /** A choice waiting for the player. */
  waiting: Choice | null;
  /** The end of the story or a problem: nothing more to play. */
  finished: boolean;
  /** Autoplay is on. Off — the next line comes only by click or Space. */
  playing: boolean;
  speed: number;
};

export const useSim = create<SimState>(() => ({
  origin: null,
  log: [],
  queue: [],
  cursor: null,
  waiting: null,
  finished: false,
  playing: true,
  speed: 1,
}));

/** Start playback from a block (▶ on the block) or from the scene's start block, and open the Simulation section. */
export function startSimulation(sceneId: SceneId, blockId?: BlockId) {
  const project = useApp.getState().project;
  if (!project) return;
  useSim.setState({
    origin: { projectId: project.id, sceneId, blockId },
    log: [],
    queue: [],
    cursor: null,
    waiting: null,
    finished: false,
    playing: true,
  });
  take(startAt(project, sceneId, blockId));
  showView("simulation");
  advance();
}

export function restartSimulation() {
  const origin = useSim.getState().origin;
  if (origin) startSimulation(origin.sceneId, origin.blockId);
}

/** Show the next entry. Does nothing while a choice waits or after the end. */
export function advance() {
  const project = useApp.getState().project;
  const s = useSim.getState();
  if (!project || s.waiting || s.finished) return;
  let queue = s.queue;
  let cursor = s.cursor;
  if (queue.length === 0) {
    if (!cursor) {
      useSim.setState({ finished: true });
      return;
    }
    const next = step(project, cursor);
    queue = next.entries;
    cursor = next.next;
  }
  const [entry, ...rest] = queue;
  if (!entry) return;
  useSim.setState({
    log: [...s.log, entry].slice(-MAX_LOG),
    queue: rest,
    cursor,
    waiting: entry.kind === "choice" ? entry : null,
    finished: entry.kind === "end" || entry.kind === "problem",
  });
}

/** The player picked an option: it appears as the character's line, and the branch goes on. */
export function choose(lineId: LineId) {
  const project = useApp.getState().project;
  const waiting = useSim.getState().waiting;
  if (!project || !waiting) return;
  useSim.setState({ waiting: null, queue: [], cursor: null });
  take(pick(project, waiting, lineId));
  advance();
}

export function togglePlaying() {
  useSim.setState((s) => ({ playing: !s.playing }));
}

export function setSpeed(speed: number) {
  useSim.setState({ speed });
}

function take(next: Step) {
  useSim.setState((s) => ({ queue: [...s.queue, ...next.entries], cursor: next.next }));
}
