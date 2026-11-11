import { countBlocksOfCharacter, type Character, type Project } from "@vn/core";
import { useMemo } from "react";
import { Plus } from "lucide-react";
import { execute } from "../api";
import { Tip } from "../components/Tip";
import { InlineEdit } from "../components/InlineEdit";
import { openCharacter, selectScene, useApp } from "../store/app-store";
import { attempt } from "../store/toast";
import { t } from "../strings/uk";

/** Розділ «Персонажі»: список ліворуч, сторінка вибраного персонажа праворуч (FLOWS.md, 10). */
export function CharactersView({ project }: { project: Project }) {
  const selectedId = useApp((s) => s.characterId);
  const characterId = selectedId && project.characters[selectedId] ? selectedId : project.characterOrder[0]!;
  const character = project.characters[characterId]!;

  const add = () =>
    attempt(async () => {
      const { characterId: id } = await execute<{ characterId: string }>("createCharacter", { name: t.characters.newName });
      openCharacter(id);
    });

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-1 flex items-center justify-between px-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{t.characters.title}</h2>
          <Tip label={t.characters.add}>
            <button type="button" onClick={add} className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
              <Plus size={14} />
            </button>
          </Tip>
        </div>
        <ul className="flex flex-col gap-0.5">
          {project.characterOrder.map((id) => {
            const c = project.characters[id]!;
            const active = id === characterId;
            return (
              <li key={id}>
                <button
                  type="button"
                  data-testid={`character-${id}`}
                  aria-current={active}
                  onClick={() => openCharacter(id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${active ? "bg-blue-500/15 font-medium text-blue-300" : "hover:bg-zinc-800"}`}
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} />
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto text-xs text-zinc-500">{countBlocksOfCharacter(project, id)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">
        <CharacterPage key={character.id} project={project} character={character} />
      </main>
    </div>
  );
}

function CharacterPage({ project, character: c }: { project: Project; character: Character }) {
  const isAuthor = c.builtIn === "author";
  const update = (patch: Partial<Pick<Character, "name" | "color" | "description" | "speechStyle">>) =>
    attempt(() => execute("updateCharacter", { characterId: c.id, ...patch }));

  // У яких сценах говорить персонаж — щоб швидко перейти до його реплік.
  const scenes = useMemo(
    () =>
      project.sceneOrder
        .map((id) => project.scenes[id]!)
        .map((s) => ({ id: s.id, name: s.name, lines: Object.values(s.blocks).filter((b) => b.characterId === c.id).length }))
        .filter((s) => s.lines > 0),
    [project, c.id],
  );
  const total = scenes.reduce((n, s) => n + s.lines, 0);

  const remove = () => {
    // Без реплік — одразу (є undo), з репліками — після підтвердження (FLOWS.md, 10).
    if (total > 0 && !window.confirm(t.characters.deleteConfirm(c.name, total))) return;
    void attempt(() => execute("deleteCharacter", { characterId: c.id }));
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-8 py-8">
      <header className="flex items-center gap-3">
        <input
          type="color"
          value={c.color}
          aria-label={t.characters.color}
          title={t.characters.color}
          onChange={(e) => update({ color: e.target.value })}
          className="h-10 w-10 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0"
        />
        <InlineEdit
          value={c.name}
          required
          ariaLabel={t.characters.name}
          className="min-w-0 flex-1 text-2xl font-semibold"
          onCommit={(name) => update({ name })}
        />
        {isAuthor && <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs uppercase text-zinc-400">{t.characters.author}</span>}
      </header>

      <Field label={t.characters.description} hint={t.characters.descriptionHint}>
        <InlineEdit
          value={c.description}
          multiline
          placeholder={t.characters.descriptionPlaceholder}
          ariaLabel={t.characters.description}
          className="min-h-40 w-full resize-y text-sm"
          onCommit={(description) => update({ description })}
        />
      </Field>

      <Field label={t.characters.speechStyle} hint={t.characters.speechStyleHint}>
        <InlineEdit
          value={c.speechStyle}
          multiline
          placeholder={t.characters.speechStylePlaceholder}
          ariaLabel={t.characters.speechStyle}
          className="min-h-24 w-full resize-y text-sm"
          onCommit={(speechStyle) => update({ speechStyle })}
        />
      </Field>

      <Field label={t.characters.lines(total)}>
        {scenes.length === 0 ? (
          <p className="text-sm text-zinc-400">{t.characters.noLines}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {scenes.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => selectScene(s.id)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-zinc-800"
                >
                  <span>{s.name}</span>
                  <span className="text-xs text-zinc-500">{s.lines}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Field>

      {!isAuthor && (
        <div className="border-t border-zinc-800 pt-4">
          <button type="button" onClick={remove} className="rounded-md px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10">
            {t.characters.delete}
          </button>
        </div>
      )}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</h3>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      <div className="-mx-1.5 mt-1">{children}</div>
    </section>
  );
}
