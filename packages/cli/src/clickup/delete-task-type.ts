import type { CommandModule } from "yargs";
import type { ClickUpClient, FrontdoorClient } from "@digismith/clickup-client";
import { createClient, createFrontdoorClient } from "./lib.ts";
import { assertCustomType } from "./task-type-write.ts";
import { resolveTaskType } from "./task-types.ts";

export function createDeleteTaskTypeCommand(
  frontdoorFactory: () => FrontdoorClient = createFrontdoorClient,
  publicFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "delete-task-type",
    describe: "remove a workspace task type by merging its tasks into another type (Frontdoor)",
    builder: (y) =>
      y
        .option("type", { type: "string", requiresArg: true, demandOption: true, describe: "task type to remove, by name or id" })
        .option("merge-into", { type: "string", requiresArg: true, describe: "type that takes its tasks; 0 = plain task (required)" })
        .option("yes", { type: "boolean", default: false, describe: "send the merge (needs --confirm-count)" })
        .option("confirm-count", { type: "number", requiresArg: true, describe: "the task count the dry run printed" }),
    handler: async (argv) => {
      try {
        if (argv.mergeInto === undefined) {
          throw new Error("--merge-into is required; name 0 for the plain task on purpose");
        }
        const frontdoor = frontdoorFactory();
        const types = await frontdoor.getTaskTypes();
        const type = resolveTaskType(types, argv.type as string);
        assertCustomType(type);
        const target = resolveTaskType(types, String(argv.mergeInto));
        if (target.id === type.id) throw new Error("the target type must differ from the type being removed");
        const count = await publicFactory().countTasksOfType(type.id);
        if (!argv.yes) {
          console.log(`${type.name} (${type.id}) has ${count} tasks. They move to ${target.name} (${target.id}), then the type is removed.`);
          console.log("Task types are workspace-wide. Tasks are not deleted. Nothing sent.");
          console.log(`To send: add --yes --confirm-count ${count}`);
        } else {
          if (argv.confirmCount !== count) {
            throw new Error(
              `${type.name} (${type.id}) has ${count} tasks, not ${argv.confirmCount ?? "(no --confirm-count)"}; run without --yes to see the count again`
            );
          }
          await frontdoor.mergeTaskType(type.id, target.id);
          console.log(`clickup delete-task-type: removed ${type.name} (${type.id}); ${count} tasks moved to ${target.name} (${target.id})`);
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup delete-task-type: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const deleteTaskTypeCommand: CommandModule = createDeleteTaskTypeCommand();
