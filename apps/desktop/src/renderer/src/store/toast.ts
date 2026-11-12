import { create } from "zustand";
import { ApiCallError } from "../api";
import { t } from "../strings/uk";

export type ToastAction = { label: string; run: () => void };
export type Toast = { id: number; text: string; tone: "info" | "error"; action?: ToastAction };

export const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));

let nextId = 1;

export function dismissToast(id: number) {
  useToasts.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
}

export function showToast(text: string, tone: Toast["tone"] = "info", ms = 4000, action?: ToastAction) {
  const id = nextId++;
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, tone, action }] }));
  setTimeout(() => dismissToast(id), ms);
}

/** Wrapper for UI actions: shows an error as a toast instead of losing it in the console. */
export async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    showToast(e instanceof ApiCallError ? e.message : t.errors.generic, "error", 6000);
    return undefined;
  }
}
