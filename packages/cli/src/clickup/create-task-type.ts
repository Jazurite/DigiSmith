import type { CommandModule } from "yargs";
import type { FrontdoorClient, FrontdoorTaskTypeBody } from "@digismith/clickup-client";
import { createFrontdoorClient } from "./lib.ts";
import { assertNameFree, printCall } from "./task-type-write.ts";

export function createCreateTaskTypeCommand(
  clientFactory: () => FrontdoorClient = createFrontdoorClient
): CommandModule {
  return {
    command: "create-task-type",
    describe: "create a workspace task type (Frontdoor); a dry run unless --yes",
    builder: (y) =>
      y
        .option("name", { type: "string", requiresArg: true, demandOption: true, describe: "singular name" })
        .option("plural", { type: "string", requiresArg: true, demandOption: true, describe: "plural name" })
        .option("description", { type: "string", requiresArg: true, describe: "description" })
        .option("icon", { type: "string", requiresArg: true, default: "user-alt", describe: "Font Awesome solid icon name, e.g. bolt" })
        .option("yes", { type: "boolean", default: false, describe: "send the call (without it, only print it)" }),
    handler: async (argv) => {
      try {
        const client = clientFactory();
        const name = argv.name as string;
        const plural = argv.plural as string;
        assertNameFree(await client.getTaskTypes(), [name, plural]);
        const body: FrontdoorTaskTypeBody = {
          avatar_source: "fas",
          avatar_value: (argv.icon as string | undefined) ?? "user-alt",
          description: (argv.description as string | undefined) ?? "",
          name,
          name_plural: plural,
        };
        if (!argv.yes) {
          printCall("POST", `/tasks/v1/${client.teamId}/customItem`, body);
          console.log("nothing sent; add --yes to send");
        } else {
          console.log(JSON.stringify(await client.createTaskType(body), null, 2));
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup create-task-type: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const createTaskTypeCommand: CommandModule = createCreateTaskTypeCommand();
