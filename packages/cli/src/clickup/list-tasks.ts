import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";

export function createListTasksCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "list-tasks",
    describe: "list every task on a ClickUp list, including closed and subtasks",
    builder: (y) =>
      y.option("list", {
        type: "string",
        requiresArg: true,
        demandOption: true,
        describe: "ClickUp list ID",
      }),
    handler: async (argv) => {
      try {
        const client = clientFactory();
        const tasks = await client.getAllListTasks(argv.list as string);
        console.log(JSON.stringify(tasks, null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup list-tasks: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const listTasksCommand: CommandModule = createListTasksCommand();
