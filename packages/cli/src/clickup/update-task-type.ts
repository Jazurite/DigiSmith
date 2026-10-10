import type { CommandModule } from "yargs";
import type { FrontdoorClient, FrontdoorTaskTypeBody } from "@digismith/clickup-client";
import { createFrontdoorClient } from "./lib.ts";
import { assertCustomType, assertNameFree, printCall } from "./task-type-write.ts";
import { resolveTaskType } from "./task-types.ts";

export function createUpdateTaskTypeCommand(
  clientFactory: () => FrontdoorClient = createFrontdoorClient
): CommandModule {
  return {
    command: "update-task-type",
    describe: "edit a workspace task type (Frontdoor); a dry run unless --yes",
    builder: (y) =>
      y
        .option("type", { type: "string", requiresArg: true, demandOption: true, describe: "task type, by name or id" })
        .option("name", { type: "string", requiresArg: true, describe: "new singular name" })
        .option("plural", { type: "string", requiresArg: true, describe: "new plural name" })
        .option("description", { type: "string", requiresArg: true, describe: "new description" })
        .option("icon", { type: "string", requiresArg: true, describe: "new Font Awesome solid icon name, e.g. flag" })
        .option("yes", { type: "boolean", default: false, describe: "send the call (without it, only print it)" }),
    handler: async (argv) => {
      try {
        const client = clientFactory();
        const types = await client.getTaskTypes();
        const type = resolveTaskType(types, argv.type as string);
        assertCustomType(type);
        const changes = [argv.name, argv.plural, argv.description, argv.icon];
        if (changes.every((c) => c === undefined)) {
          throw new Error("nothing to change: pass --name, --plural, --description or --icon");
        }
        const name = (argv.name as string | undefined) ?? type.name;
        const plural = (argv.plural as string | undefined) ?? type.name_plural ?? "";
        assertNameFree(types, [name, plural].filter(Boolean), type.id);
        // PUT is the full type, not a patch: send the current value for every field not changed.
        const body: FrontdoorTaskTypeBody = {
          avatar_source: type.avatar?.source ?? "fas",
          avatar_value: (argv.icon as string | undefined) ?? type.avatar?.value ?? "user-alt",
          description: (argv.description as string | undefined) ?? type.description ?? "",
          name,
          name_plural: plural,
        };
        if (!argv.yes) {
          printCall("PUT", `/tasks/v1/${client.teamId}/customItem/${type.id}`, body);
          console.log("nothing sent; add --yes to send");
        } else {
          console.log(JSON.stringify(await client.updateTaskType(type.id, body), null, 2));
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup update-task-type: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const updateTaskTypeCommand: CommandModule = createUpdateTaskTypeCommand();
