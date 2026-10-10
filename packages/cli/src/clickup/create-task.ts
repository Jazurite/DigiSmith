import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient, buildTaskWriteBody } from "./lib.ts";
import { resolveTaskType } from "./task-types.ts";
import { resolveFieldArgs, applyFields } from "./field-set.ts";

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
        })
        .option("parent", {
          type: "string",
          requiresArg: true,
          describe: "parent task id (a subtask must be in the parent's list)",
        })
        .option("type", {
          type: "string",
          requiresArg: true,
          describe: "task type, by name (singular or plural) or id; 0 = plain task",
        })
        .option("field", {
          type: "string",
          array: true,
          requiresArg: true,
          describe: 'set a custom field: "<field name or id>=<value>" (split at the first =); repeat for more',
        }),
    handler: async (argv) => {
      try {
        const client = clientFactory();
        const body = buildTaskWriteBody(argv as unknown as Parameters<typeof buildTaskWriteBody>[0]);
        if (argv.type !== undefined) {
          body.custom_item_id = resolveTaskType(await client.getTaskTypes(), argv.type as string).id;
        }
        const resolved = await resolveFieldArgs(client, argv.list as string, (argv.field as string[] | undefined) ?? []);
        let task = await client.createTask(argv.list as string, body);
        if (resolved.length > 0) {
          await applyFields(client, task.id, resolved);
          task = await client.get<typeof task>(`/task/${task.id}`);
        }
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
