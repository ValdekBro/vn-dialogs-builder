import { defineCommand, requireName } from "./util";

export type UpdateProjectArgs = { name?: string; description?: string };

export const updateProject = defineCommand({
  name: "updateProject",
  label: () => "Змінити проєкт",
  run(draft, args: UpdateProjectArgs) {
    if (args.name !== undefined) draft.name = requireName(args.name, "Project");
    if (args.description !== undefined) draft.description = args.description;
    return { projectId: draft.id };
  },
});
