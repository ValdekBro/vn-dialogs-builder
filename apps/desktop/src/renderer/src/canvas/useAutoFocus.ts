import { useLayoutEffect, useRef } from "react";

/**
 * Focus on an input inside a canvas node. React Flow hides a node (visibility: hidden) until it measures it,
 * and a hidden input does not accept focus. So we retry for a few frames until focus sticks.
 */
export function useAutoFocus<T extends HTMLInputElement | HTMLTextAreaElement>(select = false) {
  const ref = useRef<T>(null);
  // useLayoutEffect: focus is set before the browser handles the next key press,
  // so the first letter after picking a character is not lost.
  useLayoutEffect(() => {
    let frames = 0;
    let id = 0;
    const tryFocus = () => {
      const el = ref.current;
      if (!el) return;
      if (document.activeElement !== el) {
        el.focus({ preventScroll: true });
        if (document.activeElement === el) {
          if (select) el.select();
          else el.setSelectionRange(el.value.length, el.value.length);
        }
      }
      if (document.activeElement !== el && frames++ < 30) id = requestAnimationFrame(tryFocus);
    };
    tryFocus();
    return () => cancelAnimationFrame(id);
  }, [select]);
  return ref;
}
