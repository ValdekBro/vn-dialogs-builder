import { useLayoutEffect, useRef } from "react";

/**
 * Фокус на полі всередині вузла полотна. React Flow ховає вузол (visibility: hidden), доки не виміряє його,
 * а приховане поле фокус не приймає. Тому пробуємо кілька кадрів, доки фокус не «встане».
 */
export function useAutoFocus<T extends HTMLInputElement | HTMLTextAreaElement>(select = false) {
  const ref = useRef<T>(null);
  // useLayoutEffect: фокус ставиться ще до того, як браузер обробить наступне натискання клавіші,
  // тож перша літера після вибору персонажа не губиться.
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
