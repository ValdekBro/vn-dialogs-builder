import type { Issue, Scene } from "@vn/core";
import { createContext, useContext } from "react";

/** Дані сцени, спільні для всіх вузлів полотна. */
export type CanvasData = {
  scene: Scene;
  /** Проблеми за id блоку або за ключем виходу `blk_…:ln_…`. */
  issuesByBlock: Map<string, Issue[]>;
  issuesByOutput: Map<string, Issue[]>;
};

export const CanvasContext = createContext<CanvasData | null>(null);

export function useCanvasData(): CanvasData {
  const v = useContext(CanvasContext);
  if (!v) throw new Error("CanvasContext is missing");
  return v;
}

export function indexIssues(issues: Issue[]) {
  const issuesByBlock = new Map<string, Issue[]>();
  const issuesByOutput = new Map<string, Issue[]>();
  const push = (m: Map<string, Issue[]>, k: string, i: Issue) => {
    const list = m.get(k);
    if (list) list.push(i);
    else m.set(k, [i]);
  };
  for (const i of issues) {
    if (!i.blockId) continue;
    push(issuesByBlock, i.blockId, i);
    if (i.lineId) push(issuesByOutput, `${i.blockId}:${i.lineId}`, i);
  }
  return { issuesByBlock, issuesByOutput };
}
