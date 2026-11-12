import { countIssues, projectIssues, type Project } from "@vn/core";
import { useMemo } from "react";
import { execute } from "../api";
import { InlineEdit } from "../components/InlineEdit";
import { attempt } from "../store/toast";
import { t } from "../strings/uk";
import { Field } from "./CharactersView";

/** The "About project" section: name, lore and short stats (FLOWS.md, 15). */
export function ProjectInfoView({ project }: { project: Project }) {
  const stats = useMemo(() => {
    const blocks = Object.values(project.scenes).reduce((n, s) => n + Object.keys(s.blocks).length, 0);
    return { blocks, ...countIssues(projectIssues(project)) };
  }, [project]);

  return (
    <main className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-8 py-8">
        <InlineEdit
          value={project.name}
          required
          ariaLabel={t.project.name}
          className="-mx-1.5 w-full text-2xl font-semibold"
          onCommit={(name) => attempt(() => execute("updateProject", { name }))}
        />

        <dl className="grid grid-cols-4 gap-3">
          <Stat label={t.project.stats.scenes} value={project.sceneOrder.length} />
          <Stat label={t.project.stats.characters} value={project.characterOrder.length} />
          <Stat label={t.project.stats.lines} value={stats.blocks} />
          <Stat label={t.project.stats.issues} value={stats.errors} tone={stats.errors > 0 ? "bad" : undefined} />
        </dl>

        <Field label={t.project.lore} hint={t.project.loreHint}>
          <InlineEdit
            value={project.description}
            multiline
            placeholder={t.project.lorePlaceholder}
            ariaLabel={t.project.lore}
            className="min-h-96 w-full resize-y text-sm leading-6"
            onCommit={(description) => attempt(() => execute("updateProject", { description }))}
          />
        </Field>
      </div>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className={`text-2xl font-semibold ${tone === "bad" ? "text-red-400" : ""}`}>{value}</dd>
    </div>
  );
}
