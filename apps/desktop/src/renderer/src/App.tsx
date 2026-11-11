import { useEffect } from "react";
import { UpdateBanner } from "./components/UpdateBanner";
import { ProjectScreen } from "./screens/ProjectScreen";
import { ProjectsScreen } from "./screens/ProjectsScreen";
import { useApp } from "./store/app-store";
import { dismissToast, useToasts } from "./store/toast";
import { t } from "./strings/uk";

export function App() {
  const ready = useApp((s) => s.ready);
  const project = useApp((s) => s.project);

  useEffect(() => {
    document.title = project ? `${project.name} — ${t.appName}` : t.appName;
  }, [project?.name]);

  if (!ready) return <div className="flex h-full items-center justify-center text-zinc-400">{t.loading}</div>;
  return (
    <>
      {project ? <ProjectScreen /> : <ProjectsScreen />}
      <Toasts />
      <UpdateBanner />
    </>
  );
}

function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto flex items-center gap-3 rounded-md px-4 py-2 text-sm shadow-lg ${toast.tone === "error" ? "bg-red-600 text-white" : "border border-zinc-700 bg-zinc-800 text-zinc-100"}`}
        >
          <span>{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action!.run();
                dismissToast(toast.id);
              }}
              className="font-medium text-blue-400 hover:text-blue-300"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
