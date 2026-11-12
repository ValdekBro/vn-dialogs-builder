import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  /** An empty value is not accepted (names). */
  required?: boolean;
  autoFocus?: boolean;
  onCancel?: () => void;
  ariaLabel?: string;
  rows?: number;
};

/**
 * An input that saves on Enter or on blur; Esc restores the previous value.
 * In multiline mode Enter saves and Shift+Enter inserts a line break (FLOWS.md, principles).
 */
export function InlineEdit({ value, onCommit, placeholder, multiline, className, required, autoFocus, onCancel, ariaLabel, rows = 3 }: Props) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const cancelled = useRef(false);

  // The value may have changed from outside (undo, agent): pick it up if the field is not being edited.
  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(value);
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.select();
  }, [autoFocus]);

  // A multiline field grows with its text, without inner scrolling.
  useEffect(() => {
    const el = ref.current;
    if (!multiline || !el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [draft, multiline]);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const next = multiline ? draft : draft.trim();
    if (required && next.trim() === "") {
      setDraft(value);
      onCancel?.();
      return;
    }
    if (next !== value) onCommit(next);
    else onCancel?.();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !(multiline && e.shiftKey)) {
      e.preventDefault();
      ref.current?.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelled.current = true;
      setDraft(value);
      onCancel?.();
      ref.current?.blur();
    }
  };

  const common = {
    ref,
    value: draft,
    placeholder,
    autoFocus,
    "aria-label": ariaLabel ?? placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown,
    className: `rounded border border-transparent bg-transparent px-1.5 py-0.5 outline-none hover:border-zinc-700 focus:border-blue-500 focus:bg-zinc-950 ${className ?? ""}`,
  };
  return multiline ? <textarea rows={rows} {...common} style={{ overflow: "hidden" }} /> : <input type="text" {...common} />;
}
