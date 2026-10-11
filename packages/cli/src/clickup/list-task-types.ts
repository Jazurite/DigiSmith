import type { CommandModule } from "yargs";
import type { ClickUpClient, ClickUpTaskType } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import { PLAIN_TASK_TYPE } from "./task-types.ts";

/** The icon as "source value" (e.g. "fas flag"); "-" when the type has none. */
function formatIcon(avatar: ClickUpTaskType["avatar"]): string {
  const icon = [avatar?.source, avatar?.value].filter(Boolean).join(" ");
  return icon || "-";
}

export function createListTaskTypesCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "list-task-types",
    describe: "list the workspace's task types (id, name, plural name, description, icon)",
    handler: async () => {
      try {
        const types = [PLAIN_TASK_TYPE, ...(await clientFactory().getTaskTypes())];
        for (const t of types) {
          console.log([t.id, t.name, t.name_plural ?? "", t.description ?? "", formatIcon(t.avatar)].join("\t"));
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup list-task-types: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const listTaskTypesCommand: CommandModule = createListTaskTypesCommand();
