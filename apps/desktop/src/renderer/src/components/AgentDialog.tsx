import { Check, Copy, Eye, EyeOff, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ClaudeDesktopStatus } from "../../../shared/api";
import { call } from "../api";
import { openAgentDialog, useAgent } from "../store/agent-store";
import { t } from "../strings/uk";
import { Tip } from "./Tip";

/** "Connect an AI agent" (OVERVIEW.md, 5.8): URL, token, ready-made commands and server state. */
export function AgentDialog() {
  const open = useAgent((s) => s.dialogOpen);
  const mcp = useAgent((s) => s.mcp);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && openAgentDialog(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || !mcp) return null;
  const hidden = "•".repeat(Math.min(mcp.token.length, 24));
  const mask = (s: string) => (showToken ? s : s.split(mcp.token).join(hidden));
  const json = JSON.stringify(
    { mcpServers: { vnami: { type: "http", url: mcp.url, headers: { Authorization: `Bearer ${mcp.token}` } } } },
    null,
    2,
  );
  const prompt = t.agent.prompt(mcp.command, json);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onMouseDown={() => openAgentDialog(false)}>
      <div
        role="dialog"
        aria-label={t.agent.title}
        data-testid="agent-dialog"
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-3">
          <h2 className="flex-1 text-lg font-semibold">{t.agent.title}</h2>
          <span className={`flex items-center gap-1.5 text-xs ${mcp.running ? "text-emerald-400" : "text-red-400"}`}>
            <span className={`h-2 w-2 rounded-full ${mcp.running ? "bg-emerald-400" : "bg-red-500"}`} />
            {mcp.running ? t.agent.running : `${t.agent.stopped}${mcp.error ? `: ${mcp.error}` : ""}`}
          </span>
          <Tip label={t.agent.close}>
            <button type="button" onClick={() => openAgentDialog(false)} className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white">
              <X size={16} />
            </button>
          </Tip>
        </div>
        <p className="mb-5 text-sm text-zinc-400">{t.agent.intro}</p>

        <ClaudeDesktop />

        <Section label={t.agent.promptLabel}>
          <CodeBox text={prompt} shown={mask(prompt)} testId="agent-prompt" sans />
        </Section>
        <div className="mb-2 mt-5 text-xs uppercase tracking-wide text-zinc-500">{t.agent.manual}</div>
        <Section label={t.agent.claudeCode}>
          <CodeBox text={mcp.command} shown={mask(mcp.command)} testId="agent-command" />
        </Section>
        <Section label={t.agent.otherClients}>
          <CodeBox text={json} shown={mask(json)} />
        </Section>

        <dl className="mb-5 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
          <dt className="text-zinc-500">{t.agent.url}</dt>
          <dd className="font-mono text-zinc-200">{mcp.url}</dd>
          <dt className="text-zinc-500">{t.agent.token}</dt>
          <dd className="flex items-center gap-2 font-mono text-zinc-200">
            <span className="truncate">{showToken ? mcp.token : hidden}</span>
            <Tip label={showToken ? t.agent.hideToken : t.agent.showToken}>
              <button type="button" onClick={() => setShowToken((v) => !v)} className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white">
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </Tip>
          </dd>
        </dl>

        <div className="space-y-2 rounded-lg bg-zinc-800/50 p-3 text-xs text-zinc-400">
          <p>{t.agent.onlyWhileOpen}</p>
          <p>{t.agent.timeoutHint}</p>
          <p>
            {t.agent.tryIt} <span className="text-zinc-300">{t.agent.example}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The Claude desktop app (MCP.md, 2): it does not connect to the HTTP server directly,
 * so the button writes the VNami bridge into its config. Claude must be restarted afterwards.
 */
function ClaudeDesktop() {
  const [status, setStatus] = useState<ClaudeDesktopStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void call("claude.status").then(setStatus, () => setStatus(null));
  }, []);

  if (!status?.supported) return null;
  const install = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await call("claude.install"));
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const json = JSON.stringify({ mcpServers: { vnami: status.entry } }, null, 2);

  return (
    <div data-testid="claude-desktop" className="mb-5 rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
      <div className="mb-1 text-sm font-medium text-zinc-200">{t.agent.claudeDesktop.title}</div>
      <p className="mb-3 text-xs text-zinc-400">{t.agent.claudeDesktop.hint}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void install()}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {status.connected ? t.agent.claudeDesktop.reconnect : t.agent.claudeDesktop.connect}
        </button>
        {status.connected && !done && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <Check size={14} /> {t.agent.claudeDesktop.connected}
          </span>
        )}
        {!status.found && !done && <span className="text-xs text-amber-400">{t.agent.claudeDesktop.notFound}</span>}
      </div>
      {done && <p className="mt-3 text-xs text-emerald-400">{t.agent.claudeDesktop.done}</p>}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      <details className="mt-3 text-xs text-zinc-400">
        <summary className="cursor-pointer select-none hover:text-zinc-200">{t.agent.claudeDesktop.manual}</summary>
        <p className="my-2 break-all">{t.agent.claudeDesktop.manualHint(status.configPath ?? "")}</p>
        <CodeBox text={json} shown={json} />
      </details>
      <p className="mt-3 text-xs text-zinc-500">{t.agent.claudeDesktop.webNote}</p>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-sm text-zinc-300">{label}</div>
      {children}
    </div>
  );
}

/** Code with a "Copy" button: the full text is copied even if the token is hidden on screen. */
function CodeBox({ text, shown, testId, sans }: { text: string; shown: string; testId?: string; sans?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative">
      <pre data-testid={testId} className={`overflow-x-auto whitespace-pre-wrap rounded-lg border border-zinc-700 bg-zinc-950 p-3 pr-12 text-xs text-zinc-200 ${sans ? "max-h-56 overflow-y-auto break-words font-sans leading-relaxed" : "break-all font-mono"}`}>
        {shown}
      </pre>
      <Tip label={copied ? t.agent.copied : t.agent.copy}>
        <button
          type="button"
          onClick={() => void copy()}
          className="absolute right-2 top-2 rounded-md border border-zinc-700 bg-zinc-800 p-1.5 text-zinc-300 hover:bg-zinc-700 hover:text-white"
        >
          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
        </button>
      </Tip>
    </div>
  );
}
