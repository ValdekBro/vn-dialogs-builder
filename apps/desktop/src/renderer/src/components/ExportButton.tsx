import { projectIssues, type Project } from "@vn/core";
import { FileDown } from "lucide-react";
import { useMemo } from "react";
import { ApiCallError, call } from "../api";
import { showToast } from "../store/toast";
import { t } from "../strings/uk";
import { openProjectIssues } from "./IssuesButton";
import { Tip } from "./Tip";

/**
 * JSON export in the top bar (FLOWS.md, 12 and 15). While the project has errors the button looks disabled,
 * its tooltip gives the error count, and a click opens the issues list instead of exporting.
 */
export function ExportButton({ project }: { project: Project }) {
  const errors = useMemo(() => projectIssues(project).filter((i) => i.severity === "error").length, [project]);
  const blocked = errors > 0;

  const run = async () => {
    if (blocked) return openProjectIssues();
    try {
      const path = await call("projects.export");
      if (path) showToast(t.transfer.exported(baseName(path)));
    } catch (e) {
      showTransferError(e);
    }
  };

  return (
    <Tip label={blocked ? t.transfer.exportBlocked(errors) : t.transfer.exportTip} side="bottom">
      <button
        type="button"
        data-testid="export-button"
        // Not aria-disabled: the button still works — it opens the issues list — so its name says so.
        aria-label={blocked ? t.transfer.exportBlocked(errors) : t.transfer.export}
        onClick={() => void run()}
        className={`flex h-8 w-8 items-center justify-center rounded-md ${blocked ? "text-zinc-600 hover:bg-zinc-800/60" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}
      >
        <FileDown size={16} />
      </button>
    </Tip>
  );
}

/** Export and import errors in the user's words; anything unexpected — the generic text. */
export function showTransferError(e: unknown) {
  console.error(e);
  const known = e instanceof ApiCallError ? t.transfer.errors[e.code] : undefined;
  showToast(known ?? (e instanceof ApiCallError ? e.message : t.errors.generic), "error", 6000);
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
