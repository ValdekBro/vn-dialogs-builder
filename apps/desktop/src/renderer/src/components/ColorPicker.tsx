import { CHARACTER_PALETTE } from "@vn/core";
import { Check, Pipette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { t } from "../strings/uk";

/**
 * Character colour (FLOWS.md, 10): a round swatch that opens the palette plus "Custom colour…".
 * The native colour input is hidden: on macOS it draws its own frame around a square swatch.
 * A custom colour is committed once, when the system picker closes, so dragging in it is one undo step.
 */
export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const native = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // React's onChange fires on every move inside the system picker; the native `change` fires once at the end.
  useEffect(() => {
    const el = native.current;
    if (!el) return;
    const onCommit = () => {
      if (el.value.toLowerCase() !== value.toLowerCase()) onChange(el.value);
    };
    el.addEventListener("change", onCommit);
    return () => el.removeEventListener("change", onCommit);
  }, [value, onChange]);

  const pick = (color: string) => {
    setOpen(false);
    if (color.toLowerCase() !== value.toLowerCase()) onChange(color);
  };

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label={t.characters.color}
        aria-expanded={open}
        title={t.characters.color}
        onClick={() => setOpen(!open)}
        className="h-10 w-10 rounded-full ring-2 ring-zinc-900 ring-offset-2 ring-offset-zinc-700 transition hover:ring-offset-zinc-400"
        style={{ background: value }}
      />
      {open && (
        <div data-testid="color-palette" className="absolute left-0 top-12 z-30 w-52 rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-2xl">
          <div className="grid grid-cols-5 gap-2">
            {CHARACTER_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                onClick={() => pick(color)}
                className="flex h-7 w-7 items-center justify-center rounded-full hover:scale-110"
                style={{ background: color }}
              >
                {color.toLowerCase() === value.toLowerCase() && <Check size={14} className="text-white drop-shadow" />}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              native.current?.click();
            }}
            className="mt-3 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
          >
            <Pipette size={14} /> {t.characters.customColor}
          </button>
        </div>
      )}
      <input ref={native} type="color" value={value} onChange={() => {}} tabIndex={-1} aria-hidden className="pointer-events-none absolute left-0 top-10 h-0 w-0 opacity-0" />
    </div>
  );
}
