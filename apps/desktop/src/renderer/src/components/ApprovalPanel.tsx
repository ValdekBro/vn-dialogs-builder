import { Bot, Eye } from "lucide-react";
import { useApp, selectScene } from "../store/app-store";
import { respondApproval, useAgent } from "../store/agent-store";
import { focusBlock } from "../canvas/canvas-store";
import { t } from "../strings/uk";
import { useNow } from "./AgentButton";

/**
 * Запит агента на видалення (FLOWS.md, 14; MCP.md, 5.9): панель поверх полотна, що не блокує роботу.
 * Що видаляється, причина, таймер і «Підтвердити» / «Відхилити». Блоки підсвічуються на полотні.
 */
export function ApprovalPanel() {
  const req = useAgent((s) => s.approval);
  const sceneId = useApp((s) => s.sceneId);
  const now = useNow(req ? 1000 : null);
  if (!req) return null;
  const left = Math.max(0, Math.ceil((req.expiresAt - now) / 1000));
  const canShow = req.sceneId !== null && req.blockIds.length > 0;

  return (
    <div
      role="alertdialog"
      aria-label={t.approval.heading}
      data-testid="approval-panel"
      className="fixed left-1/2 top-16 z-50 w-[28rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-amber-500/50 bg-zinc-900 p-4 text-sm shadow-2xl shadow-black/50"
    >
      <div className="mb-2 flex items-center gap-2 text-xs text-amber-300">
        <Bot size={14} />
        <span className="flex-1">{t.approval.heading}</span>
        <span className="tabular-nums text-zinc-400">{t.approval.timeLeft(left)}</span>
      </div>
      <div className="mb-2 font-medium text-zinc-100">{req.title}</div>
      <ul className="mb-2 max-h-40 space-y-1 overflow-y-auto text-zinc-300">
        {req.items.map((item, i) => (
          <li key={i} className="truncate">
            • {item}
          </li>
        ))}
      </ul>
      {req.reason && (
        <p className="mb-3 text-zinc-400">
          <span className="text-zinc-500">{t.approval.reason}:</span> {req.reason}
        </p>
      )}
      <div className="flex items-center gap-2">
        {canShow && (
          <button
            type="button"
            onClick={() => {
              if (req.sceneId !== sceneId) selectScene(req.sceneId!);
              focusBlock(req.blockIds[0]!, true);
            }}
            className="mr-auto flex items-center gap-1 rounded-md px-2 py-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <Eye size={14} /> {t.approval.show}
          </button>
        )}
        <button
          type="button"
          onClick={() => respondApproval(false)}
          className={`${canShow ? "" : "ml-auto "}rounded-md border border-zinc-600 px-3 py-1.5 text-zinc-200 hover:bg-zinc-800`}
        >
          {t.approval.reject}
        </button>
        <button type="button" onClick={() => respondApproval(true)} className="rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700">
          {t.approval.approve}
        </button>
      </div>
    </div>
  );
}
