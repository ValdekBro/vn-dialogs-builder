import { Bot } from "lucide-react";
import { useEffect, useState } from "react";
import { AGENT_ONLINE_MS, openAgentDialog, useAgent } from "../store/agent-store";
import { t } from "../strings/uk";
import { Tip } from "./Tip";

/**
 * Agent indicator in the top bar (FLOWS.md, 14): grey — not connected, green — connected,
 * pulses when the agent just did something; red — the server did not start. Click — how to connect.
 */
export function AgentButton() {
  const mcp = useAgent((s) => s.mcp);
  const activity = useAgent((s) => s.activity);
  const now = useNow(activity ? 1000 : null);

  const age = activity ? now - activity.at : Infinity;
  const busy = age < 3000;
  const online = age < AGENT_ONLINE_MS;
  const error = mcp && !mcp.running;
  const label = error ? t.agent.statusError : busy ? t.agent.statusBusy(activity!.tool) : online ? t.agent.statusOn : t.agent.statusOff;
  const dot = error ? "bg-red-500" : online ? "bg-emerald-400" : "bg-zinc-600";

  return (
    <Tip label={label} side="bottom">
      <button
        type="button"
        data-testid="agent-button"
        onClick={() => openAgentDialog()}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 hover:bg-zinc-800 hover:text-white"
      >
        <Bot size={17} />
        <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${dot} ${busy ? "animate-ping" : ""}`} />
        {busy && <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${dot}`} />}
      </button>
    </Tip>
  );
}

/** Current time, refreshed at an interval (`null` — do not refresh). */
export function useNow(intervalMs: number | null): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (intervalMs === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
