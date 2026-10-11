import type { CommandModule } from "yargs";
import type { ClickUpClient, ClickUpTask, ClickUpTaskWriteBody } from "@digismith/clickup-client";
import { createClient, buildTaskWriteBody, withTaskFieldOptions, type TaskFieldArgv } from "./lib.ts";
import { resolveTaskType } from "./task-types.ts";
import { assertDateOrder } from "./parse-date.ts";
import { resolveFieldArgs, applyFields } from "./field-set.ts";

export function createUpdateTaskCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "update-task",
    describe: "update an existing ClickUp task",
    builder: (y) =>
      withTaskFieldOptions(
        y
          .option("task", {
            type: "string",
            requiresArg: true,
            demandOption: true,
            describe: "ClickUp task ID",
          })
          .option("name", { type: "string", requiresArg: true, describe: "task name" }),
        { parentDescribe: "parent task id (moves the task into the parent's list); empty value clears it" }
      ),
    handler: async (argv) => {
      try {
        const body = buildTaskWriteBody(argv as unknown as TaskFieldArgv);
        const client = clientFactory();
        await checkAgainstStoredDate(client, argv.task as string, body);
        if (argv.type !== undefined) {
          body.custom_item_id = resolveTaskType(await client.getTaskTypes(), argv.type as string).id;
        }
        const fieldArgs = (argv.field as string[] | undefined) ?? [];
        const taskId = argv.task as string;
        const resolved = fieldArgs.length
          ? await resolveFieldArgs(client, (await client.get<ClickUpTask>(`/task/${taskId}`)).list.id, fieldArgs)
          : [];
        // With --field and no task flag, the PUT would carry an empty body: skip it.
        let task = fieldArgs.length && Object.keys(body).length === 0 ? undefined : await client.updateTask(taskId, body);
        if (resolved.length > 0) {
          await applyFields(client, taskId, resolved);
          task = await client.get<ClickUpTask>(`/task/${taskId}`);
        }
        console.log(JSON.stringify(task, null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup update-task: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

/** With only one of start or due given, read the task and check the order against the stored other date. */
async function checkAgainstStoredDate(client: ClickUpClient, taskId: string, body: ClickUpTaskWriteBody): Promise<void> {
  const startGiven = body.start_date !== undefined;
  const dueGiven = body.due_date !== undefined;
  if (startGiven === dueGiven) return;
  const stored = await client.get<ClickUpTask>(`/task/${taskId}`);
  const storedMs = (value: string | null | undefined) => (value ? Number(value) : undefined);
  if (startGiven) assertDateOrder(body.start_date, storedMs(stored.due_date));
  else assertDateOrder(storedMs(stored.start_date), body.due_date);
}

export const updateTaskCommand: CommandModule = createUpdateTaskCommand();
