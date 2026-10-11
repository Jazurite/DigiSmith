import type { CommandModule } from "yargs";
import type { ClickUpClient, ClickUpTask } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";

export function createGetTaskCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "get-task <task>",
    describe: "fetch a single ClickUp task by ID",
    builder: (y) =>
      y
        .positional("task", {
          type: "string",
          describe: "ClickUp task ID",
          demandOption: true,
        })
        .option("markdown", {
          type: "boolean",
          describe: "also return the description as Markdown (markdown_description)",
        }),
    handler: async (argv) => {
      try {
        const client = clientFactory();
        const task = await client.get<ClickUpTask>(`/task/${argv.task as string}${argv.markdown ? "?include_markdown_description=true" : ""}`);
        console.log(JSON.stringify(task, null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup get-task: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const getTaskCommand: CommandModule = createGetTaskCommand();
