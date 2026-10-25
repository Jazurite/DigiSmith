import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient, buildTaskWriteBody, withTaskFieldOptions, type TaskFieldArgv } from "./lib.ts";
import { resolveTaskType } from "./task-types.ts";
import { resolveFieldArgs, applyFields, findFieldMismatches } from "./field-set.ts";

export function createCreateTaskCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "create-task",
    describe: "create a new ClickUp task on a list",
    builder: (y) =>
      withTaskFieldOptions(
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
          }),
        { parentDescribe: "parent task id (a subtask must be in the parent's list)" }
      ),
    handler: async (argv) => {
      try {
        const body = buildTaskWriteBody(argv as unknown as TaskFieldArgv);
        const client = clientFactory();
        if (argv.type !== undefined) {
          body.custom_item_id = resolveTaskType(await client.getTaskTypes(), argv.type as string).id;
        }
        const resolved = await resolveFieldArgs(client, argv.list as string, (argv.field as string[] | undefined) ?? []);
        let task = await client.createTask(argv.list as string, body);
        if (resolved.length > 0) {
          await applyFields(client, task.id, resolved);
          task = await client.get<typeof task>(`/task/${task.id}`);
          let bad = findFieldMismatches(task, resolved);
          if (bad.length > 0) {
            await applyFields(client, task.id, resolved.filter((r) => bad.some((m) => m.field === r.field.name)));
            task = await client.get<typeof task>(`/task/${task.id}`);
            bad = findFieldMismatches(task, resolved);
          }
          if (bad.length > 0) {
            console.log(JSON.stringify(task, null, 2));
            throw new Error(`task ${task.id} was created, but ${bad.map((m) => `field "${m.field}" reads ${m.got}, wanted ${m.wanted}`).join("; ")}`);
          }
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
