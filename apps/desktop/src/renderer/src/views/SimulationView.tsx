import type { Character, Project } from "@vn/core";
import { ArrowUpRight, Pause, Play, RotateCcw, SkipForward, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { focusBlock } from "../canvas/canvas-store";
import { Tip } from "../components/Tip";
import { readingDelayMs, type Entry } from "../simulation/engine";
import { advance, choose, restartSimulation, setSpeed, SPEEDS, startSimulation, togglePlaying, useSim } from "../simulation/sim-store";
import { selectScene } from "../store/app-store";
import { t } from "../strings/uk";

/**
 * The "Simulation" section (OVERVIEW.md, 5.9; FLOWS.md, 17): a scene played as a chat.
 * Scenes on the left start from their start block; ▶ on a block in the builder starts from that block.
 */
export function SimulationView({ project }: { project: Project }) {
  const origin = useSim((s) => s.origin);
  const active = origin?.projectId === project.id ? origin : null;
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-zinc-800 bg-zinc-900 p-3">
        <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">{t.sim.scenes}</h2>
        <ul>
          {project.sceneOrder.map((id) => {
            const scene = project.scenes[id]!;
            const current = active?.sceneId === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  data-testid={`sim-scene-${id}`}
                  onClick={() => startSimulation(id)}
                  className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${current ? "bg-zinc-800 text-white" : "text-zinc-300 hover:bg-zinc-800/60"}`}
                >
                  <Play size={12} className="shrink-0 text-zinc-500 group-hover:text-emerald-400" />
                  <span className="truncate">{scene.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">{active ? <Player project={project} /> : <Empty />}</main>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center text-zinc-400">
        <Play size={32} className="mx-auto mb-3 text-zinc-600" />
        <p className="mb-1 text-zinc-200">{t.sim.emptyTitle}</p>
        <p className="text-sm">{t.sim.emptyHint}</p>
      </div>
    </div>
  );
}

function Player({ project }: { project: Project }) {
  const { log, waiting, finished, playing, speed, origin } = useSim();
  const bottom = useRef<HTMLDivElement>(null);
  useAutoplay();
  usePlayerKeys();

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [log.length, waiting]);

  const startScene = origin ? project.scenes[origin.sceneId] : undefined;
  const ctl = "flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-zinc-800 px-3">
        <span className="mr-2 truncate text-sm text-zinc-300">
          {startScene ? t.sim.playing(startScene.name, origin?.blockId !== undefined) : ""}
        </span>
        <span className="flex-1" />
        <Tip label={playing ? t.sim.pause : t.sim.play} side="bottom">
          <button type="button" aria-label={playing ? t.sim.pause : t.sim.play} className={ctl} disabled={finished} onClick={togglePlaying}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
        </Tip>
        <Tip label={t.sim.next} side="bottom">
          <button type="button" aria-label={t.sim.next} className={ctl} disabled={finished || !!waiting} onClick={advance}>
            <SkipForward size={16} />
          </button>
        </Tip>
        <Tip label={t.sim.restart} side="bottom">
          <button type="button" aria-label={t.sim.restart} className={ctl} onClick={restartSimulation}>
            <RotateCcw size={16} />
          </button>
        </Tip>
        <div role="group" aria-label={t.sim.speed} className="ml-2 flex rounded-lg bg-zinc-800 p-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => setSpeed(s)}
              className={`rounded-md px-2 py-0.5 text-xs tabular-nums ${speed === s ? "bg-zinc-900 font-medium text-white shadow-sm" : "text-zinc-400 hover:text-zinc-100"}`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* A click on the chat shows the next line right away, like in a visual novel. */}
      <div className="min-h-0 flex-1 overflow-y-auto" onClick={() => !waiting && advance()} data-testid="sim-log">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 px-6 py-8">
          {log.map((entry, i) => (
            <EntryView key={i} entry={entry} project={project} current={entry === waiting} />
          ))}
          <div ref={bottom} />
        </div>
      </div>
      <div className="shrink-0 border-t border-zinc-800 px-4 py-2 text-center text-xs text-zinc-500">
        {waiting ? t.sim.hintChoice : finished ? t.sim.hintFinished : t.sim.hint}
      </div>
    </>
  );
}

function EntryView({ entry, project, current }: { entry: Entry; project: Project; current: boolean }) {
  switch (entry.kind) {
    case "line":
    case "picked": {
      const ch = project.characters[entry.characterId];
      const reveal = <RevealButton sceneId={entry.sceneId} blockId={entry.blockId} />;
      if (ch?.builtIn === "author" && entry.kind === "line") {
        return (
          <div className="group relative px-8 text-center text-sm italic leading-relaxed text-zinc-400">
            <span className="whitespace-pre-wrap">{entry.text}</span>
            {reveal}
          </div>
        );
      }
      return (
        <div className="group relative" data-testid="sim-line">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium" style={{ color: ch?.color }}>
            {ch?.name ?? "?"}
            {entry.kind === "picked" && <span className="font-normal text-violet-300">◇ {t.sim.picked}</span>}
          </div>
          <div
            className={`whitespace-pre-wrap rounded-lg border-l-2 px-4 py-2.5 leading-relaxed text-zinc-100 ${entry.kind === "picked" ? "bg-violet-500/10" : "bg-zinc-800/70"}`}
            style={{ borderColor: ch?.color }}
          >
            {entry.text}
          </div>
          {reveal}
        </div>
      );
    }
    case "choice":
      return current ? <ChoiceView entry={entry} character={project.characters[entry.characterId]} /> : null;
    case "scene":
      return (
        <div className="my-2 flex items-center gap-3 text-xs text-zinc-400">
          <span className="h-px flex-1 bg-zinc-800" />→ {t.sim.scene(entry.name)}
          <span className="h-px flex-1 bg-zinc-800" />
        </div>
      );
    case "end":
      return (
        <div className="mt-4 flex flex-col items-center gap-3 text-zinc-400">
          <span className="text-sm font-semibold tracking-wide">■ {t.sim.end}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              restartSimulation();
            }}
            className="flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
          >
            <RotateCcw size={14} /> {t.sim.restart}
          </button>
        </div>
      );
    case "problem":
      return (
        <div data-testid="sim-problem" className="mt-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <div className="flex items-start gap-2">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-red-400" />
            <div className="flex-1">
              <p className="font-medium">{t.sim.broken}</p>
              <p className="text-red-200/80">{t.sim.problem[entry.code](entry.name ?? "")}</p>
            </div>
          </div>
          {entry.blockId || entry.code === "missing_start" ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                reveal(entry.sceneId, entry.blockId);
              }}
              className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"
            >
              {t.sim.showInBuilder}
            </button>
          ) : null}
        </div>
      );
  }
}

/** A choice waits for the player: options as buttons, 1–9 on the keyboard. */
function ChoiceView({ entry, character }: { entry: Extract<Entry, { kind: "choice" }>; character: Character | undefined }) {
  return (
    <div data-testid="sim-choice" className="mt-2 rounded-lg border border-violet-500/40 bg-violet-500/5 p-3">
      <div className="mb-2 text-xs text-zinc-400">
        <span style={{ color: character?.color }}>{character?.name ?? "?"}</span> {t.sim.chooses}
      </div>
      <div className="flex flex-col gap-2">
        {entry.options.map((o, i) => (
          <button
            key={o.lineId}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              choose(o.lineId);
            }}
            className="flex items-start gap-3 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-left text-sm text-zinc-100 hover:border-violet-400 hover:bg-violet-500/10"
          >
            <span className="mt-0.5 text-xs tabular-nums text-violet-300">{i + 1}</span>
            <span className="whitespace-pre-wrap">{o.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RevealButton({ sceneId, blockId }: { sceneId: string; blockId: string }) {
  return (
    <span className="absolute -right-8 top-0 hidden group-hover:block">
      <Tip label={t.sim.showInBuilder}>
        <button
          type="button"
          aria-label={t.sim.showInBuilder}
          onClick={(e) => {
            e.stopPropagation();
            reveal(sceneId, blockId);
          }}
          className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <ArrowUpRight size={14} />
        </button>
      </Tip>
    </span>
  );
}

/** Open the block in the builder and highlight it. The canvas resets its focus on mount, so focus comes after. */
function reveal(sceneId: string, blockId: string | undefined) {
  selectScene(sceneId);
  if (blockId) setTimeout(() => focusBlock(blockId, true), 50);
}

/** Autoplay: the next entry after a pause that depends on the length of the last one and the speed. */
function useAutoplay() {
  const { log, playing, waiting, finished, speed } = useSim();
  const last = log.at(-1);
  useEffect(() => {
    if (!playing || waiting || finished || !last) return;
    const timer = setTimeout(advance, readingDelayMs(last) / speed);
    return () => clearTimeout(timer);
  }, [last, playing, waiting, finished, speed]);
}

/** Space — next line (or pause/play with Shift); 1–9 — pick an option. */
function usePlayerKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      const waiting = useSim.getState().waiting;
      if (e.key === " ") {
        e.preventDefault();
        if (e.shiftKey) togglePlaying();
        else if (!waiting) advance();
        return;
      }
      const n = Number(e.key);
      if (waiting && Number.isInteger(n) && n >= 1 && n <= waiting.options.length) choose(waiting.options[n - 1]!.lineId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
