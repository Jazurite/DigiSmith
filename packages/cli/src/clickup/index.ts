import type { CommandModule } from "yargs";
import { checkCredentialsCommand } from "./check-credentials.ts";
import { listTasksCommand } from "./list-tasks.ts";
import { getTaskCommand } from "./get-task.ts";
import { getListsCommand } from "./get-lists.ts";
import { createTaskCommand } from "./create-task.ts";

const clickupCommand: CommandModule = {
  command: "clickup",
  describe: "read ClickUp tasks, lists, and folders",
  builder: (y) =>
    y
      .command(checkCredentialsCommand)
      .command(listTasksCommand)
      .command(getTaskCommand)
      .command(getListsCommand)
      .command(createTaskCommand)
      .demandCommand(1, ""),
  handler: () => {},
};

export default clickupCommand;
