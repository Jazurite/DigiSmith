import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient, buildTaskWriteBody } from "./lib.ts";

export function createCreateTaskCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "create-task",
    describe: "create a new ClickUp task on a list",
    builder: (y) =>
      y
        .option("list", {
          type: "string",
          requiresArg: true,
          demandOption: true,
          describe: "ClickUp list ID",
        })
        .option("name", {
          type: "string",
          requiresArg: true,
          demandOption: true,
          describe: "task name",
        })
        .option("description", { type: "string", requiresArg: true, describe: "task description" })
        .option("status", { type: "string", requiresArg: true, describe: "status (must exist on the list)" })
        .option("start-date", { type: "string", requiresArg: true, describe: "start date, e.g. 2026-08-28" })
        .option("due-date", { type: "string", requiresArg: true, describe: "due date, e.g. 2026-08-28" })
        .option("priority", {
          type: "number",
          requiresArg: true,
          describe: "1=urgent, 2=high, 3=normal, 4=low",
        }),
    handler: async (argv) => {
      try {
        const client = clientFactory();
        const body = buildTaskWriteBody(argv as unknown as Parameters<typeof buildTaskWriteBody>[0]);
        const task = await client.createTask(argv.list as string, body);
        console.log(JSON.stringify(task, null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup create-task: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const createTaskCommand: CommandModule = createCreateTaskCommand();
