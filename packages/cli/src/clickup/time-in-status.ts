import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import { resolveTaskId } from "./refs.ts";

export function createTimeInStatusCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "time-in-status <task>",
    describe: "read how long a ClickUp task spent in each status (Time in Status)",
    builder: (y) =>
      y.positional("task", { type: "string", demandOption: true, describe: "ClickUp task ID or key like DGS-549" }),
    handler: async (argv) => {
      try {
        const client = clientFactory();
        const id = await resolveTaskId(client, argv.task as string);
        console.log(JSON.stringify(await client.get(`/task/${id}/time_in_status`), null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup time-in-status: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const timeInStatusCommand: CommandModule = createTimeInStatusCommand();
