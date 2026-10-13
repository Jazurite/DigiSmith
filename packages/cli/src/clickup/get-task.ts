import type { CommandModule } from "yargs";
import type { ClickUpClient, ClickUpTask } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import { KEY } from "./refs.ts";

export function createGetTaskCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "get-task <task>",
    describe: "fetch a single ClickUp task by ID or key",
    builder: (y) =>
      y
        .positional("task", {
          type: "string",
          describe: "ClickUp task ID or key like DGS-411",
          demandOption: true,
        })
        .option("markdown", {
          type: "boolean",
          describe: "also return the description as Markdown (markdown_description)",
        }),
    handler: async (argv) => {
      try {
        const client = clientFactory();
        const ref = argv.task as string;
        const task = KEY.test(ref)
          ? await client.getTaskByRef(ref, argv.markdown ? { include_markdown_description: true } : undefined)
          : await client.get<ClickUpTask>(`/task/${ref}${argv.markdown ? "?include_markdown_description=true" : ""}`);
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
