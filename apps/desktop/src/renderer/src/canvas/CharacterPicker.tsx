import type { Character, CharacterId } from "@vn/core";
import { useMemo, useState } from "react";
import { useApp } from "../store/app-store";
import { t } from "../strings/uk";
import { createCharacterNamed } from "./actions";
import { useAutoFocus } from "./useAutoFocus";

type Props = {
  /**
   * Вибір зроблено. Для нового персонажа приходить проміс: створення йде у фоні,
   * а поле тексту відкривається одразу, щоб не губились перші натиснуті літери.
   */
  onPick: (characterId: CharacterId | Promise<CharacterId | undefined>, name: string) => void;
  onCancel: () => void;
  current?: CharacterId | null;
};

type Option = { kind: "character"; character: Character } | { kind: "create"; name: string };

/**
 * Вибір персонажа (FLOWS.md, 4): у порядку списку персонажів, фільтр під час набору,
 * ↑/↓ і Enter, а якщо такого імені немає — «+ Створити персонажа».
 * Точний збіг і збіг з початку імені стоять першими; якщо таких немає, першим іде «Створити».
 */
export function CharacterPicker({ onPick, onCancel, current }: Props) {
  const project = useApp((s) => s.project)!;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useAutoFocus<HTMLInputElement>();

  const options = useMemo((): Option[] => {
    const q = query.trim().toLocaleLowerCase();
    const all = project.characterOrder.map((id) => project.characters[id]!);
    if (q === "") return all.map((character) => ({ kind: "character", character }));
    const name = (c: Character) => c.name.toLocaleLowerCase();
    const exact = all.filter((c) => name(c) === q);
    const starts = all.filter((c) => name(c) !== q && name(c).startsWith(q));
    const contains = all.filter((c) => !name(c).startsWith(q) && name(c).includes(q));
    const chars: Option[] = [...exact, ...starts, ...contains].map((character) => ({ kind: "character", character }));
    if (exact.length > 0) return chars;
    const create: Option = { kind: "create", name: query.trim() };
    return starts.length > 0 ? [...chars, create] : [create, ...chars];
  }, [project, query]);

  const choose = (index: number) => {
    const o = options[index];
    if (!o) return;
    if (o.kind === "character") onPick(o.character.id, o.character.name);
    else onPick(createCharacterNamed(o.name), o.name);
  };

  return (
    <div className="nodrag nowheel flex flex-col gap-1" onMouseDown={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        value={query}
        placeholder={t.canvas.filterCharacters}
        aria-label={t.canvas.pickCharacter}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          const n = options.length;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (n === 0 ? 0 : (i + 1) % n));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (n === 0 ? 0 : (i - 1 + n) % n));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(active);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm outline-none focus:border-blue-500"
      />
      <ul role="listbox" aria-label={t.canvas.pickCharacter} className="max-h-48 overflow-y-auto">
        {options.map((o, i) => (
          <li
            key={o.kind === "character" ? o.character.id : "create"}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(i)}
            className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm ${i === active ? "bg-zinc-700" : ""}`}
          >
            {o.kind === "character" ? (
              <>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.character.color }} />
                <span className={`truncate ${o.character.id === current ? "font-semibold" : ""}`}>{o.character.name}</span>
              </>
            ) : (
              <span className="truncate text-blue-400">{t.canvas.createCharacter(o.name)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
