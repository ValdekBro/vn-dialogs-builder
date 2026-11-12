import { cloneElement, useEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

type Side = "top" | "bottom" | "left" | "right";

type Props = {
  /** Short, one or a few words: what the button does. */
  label: string;
  children: ReactElement<React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement> }>;
  side?: Side;
};

const DELAY_MS = 350;

/**
 * Tooltip on button hover. Rendered above everything (portal), so it does not scale
 * with the canvas and is not clipped by panel edges.
 */
export function Tip({ label, children, side = "top" }: Props) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const child = cloneElement(children, {
    "aria-label": children.props["aria-label"] ?? label,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      children.props.onMouseEnter?.(e);
      const target = e.currentTarget;
      clear();
      timer.current = setTimeout(() => setRect(target.getBoundingClientRect()), DELAY_MS);
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      children.props.onMouseLeave?.(e);
      clear();
      setRect(null);
    },
    onMouseDown: (e: React.MouseEvent<HTMLElement>) => {
      children.props.onMouseDown?.(e);
      clear();
      setRect(null);
    },
  });

  return (
    <>
      {child}
      {rect && createPortal(<Bubble rect={rect} side={side} label={label} />, document.body)}
    </>
  );
}

function Bubble({ rect, side, label }: { rect: DOMRect; side: Side; label: string }) {
  const gap = 6;
  const style: React.CSSProperties =
    side === "top"
      ? { left: rect.left + rect.width / 2, top: rect.top - gap, transform: "translate(-50%, -100%)" }
      : side === "bottom"
        ? { left: rect.left + rect.width / 2, top: rect.bottom + gap, transform: "translateX(-50%)" }
        : side === "left"
          ? { left: rect.left - gap, top: rect.top + rect.height / 2, transform: "translate(-100%, -50%)" }
          : { left: rect.right + gap, top: rect.top + rect.height / 2, transform: "translateY(-50%)" };
  return (
    <div
      role="tooltip"
      style={style}
      className="pointer-events-none fixed z-[100] whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 shadow-lg"
    >
      {label}
    </div>
  );
}
