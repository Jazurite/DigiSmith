import type { CommandModule } from "yargs";
import type {
  ClickUpClient,
  ClickUpMoveTaskOptions,
  ClickUpMoveTaskStatusMapping,
} from "@digismith/clickup-client";
import { createClient } from "./lib.ts";

function parseStatusMap(values: string[]): ClickUpMoveTaskStatusMapping[] {
  return values.map((value) => {
    const at = value.indexOf("=");
    const source = at === -1 ? "" : value.slice(0, at).trim();
    const destination = at === -1 ? "" : value.slice(at + 1).trim();
    if (source === "" || destination === "") {
      throw new Error(
        `--status-map "${value}" must look like <sourceStatusId>=<destinationStatusId>`,
      );
    }
    return { source_status: source, destination_status: destination };
  });
}

export function createMoveTaskCommand(
  clientFactory: () => ClickUpClient = createClient,
): CommandModule {
  return {
    command: "move-task",
    describe: "move a ClickUp task to another List (public API v3)",
    builder: (y) =>
      y
        .option("task", {
          type: "string",
          requiresArg: true,
          demandOption: true,
          describe: "ClickUp task ID",
        })
        .option("list", {
          type: "string",
          requiresArg: true,
          demandOption: true,
          describe: "ClickUp ID of the destination List",
        })
        .option("status-map", {
          type: "string",
          array: true,
          requiresArg: true,
          describe:
            "<sourceStatusId>=<destinationStatusId>, repeatable, for a destination List that lacks the task's status",
        })
        .option("move-custom-fields", {
          type: "boolean",
          describe: "move the task's custom fields to the destination List",
        }),
    handler: async (argv) => {
      try {
        const taskId = (argv.task as string).trim();
        const listId = (argv.list as string).trim();
        if (taskId === "") throw new Error("--task needs a task ID");
        if (listId === "") throw new Error("--list needs a list ID");

        const options: ClickUpMoveTaskOptions = {};
        const statusMap = (argv.statusMap as string[] | undefined) ?? [];
        if (statusMap.length > 0) options.status_mappings = parseStatusMap(statusMap);
        if (argv.moveCustomFields === true) options.move_custom_fields = true;

        const result = await clientFactory().moveTask(taskId, listId, options);
        console.log(JSON.stringify(result, null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup move-task: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const moveTaskCommand: CommandModule = createMoveTaskCommand();
