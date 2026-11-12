import { create } from "zustand";
import type { AgentActivity, ApprovalRequest, McpInfo, SessionEvent } from "../../../shared/api";
import { call } from "../api";

/** How long after the last call the agent counts as "connected" (the server is stateless). */
export const AGENT_ONLINE_MS = 2 * 60 * 1000;
/** How long blocks changed by the agent glow (FLOWS.md, 14). */
const AGENT_GLOW_MS = 4000;

type AgentStore = {
  mcp: McpInfo | null;
  activity: AgentActivity | null;
  approval: ApprovalRequest | null;
  /** Blocks the agent just changed: they glow for a few seconds. */
  glowing: Set<string>;
  dialogOpen: boolean;
};

export const useAgent = create<AgentStore>(() => ({
  mcp: null,
  activity: null,
  approval: null,
  glowing: new Set(),
  dialogOpen: false,
}));

let glowTimer: ReturnType<typeof setTimeout> | null = null;

function onEvent(event: SessionEvent) {
  switch (event.type) {
    case "mcp":
      useAgent.setState({ mcp: event.mcp });
      return;
    case "agent":
      useAgent.setState({ activity: event.activity });
      return;
    case "approval":
      useAgent.setState({ approval: event.request });
      return;
    case "changed": {
      if (event.source !== "agent") return;
      // Patch path: ["scenes", sceneId, "blocks", blockId, ...] — the block the agent changed.
      const ids = new Set(useAgent.getState().glowing);
      for (const p of event.patches) {
        if (p.path[0] === "scenes" && p.path[2] === "blocks" && typeof p.path[3] === "string" && p.op !== "remove") ids.add(p.path[3]);
        if (p.path[0] === "scenes" && p.path[2] === "blocks" && p.path.length === 3 && p.value && typeof p.value === "object") {
          for (const id of Object.keys(p.value as object)) ids.add(id);
        }
      }
      useAgent.setState({ glowing: ids });
      if (glowTimer) clearTimeout(glowTimer);
      glowTimer = setTimeout(() => useAgent.setState({ glowing: new Set() }), AGENT_GLOW_MS);
      return;
    }
  }
}

let started = false;

export async function startAgentStore() {
  if (started) return;
  started = true;
  window.vn.onEvent(onEvent);
  const [mcp, approval] = await Promise.all([call("mcp.info"), call("approval.current")]);
  useAgent.setState({ mcp, approval });
}

export function respondApproval(approved: boolean) {
  const req = useAgent.getState().approval;
  if (!req) return;
  void call("approval.respond", req.id, approved);
}

export function openAgentDialog(open = true) {
  useAgent.setState({ dialogOpen: open });
}
