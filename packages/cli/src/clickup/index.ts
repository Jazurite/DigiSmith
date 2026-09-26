import type { CommandModule } from "yargs";
import { checkCredentialsCommand } from "./check-credentials.ts";
import { listTasksCommand } from "./list-tasks.ts";
import { getTaskCommand } from "./get-task.ts";
import { getListsCommand } from "./get-lists.ts";
import { createTaskCommand } from "./create-task.ts";
import { updateTaskCommand } from "./update-task.ts";
import { createFolderCommand } from "./create-folder.ts";
import { uploadAttachmentCommand } from "./upload-attachment.ts";

const clickupCommand: CommandModule = {
  command: "clickup",
  describe: "read and write ClickUp tasks, lists, and folders",
  builder: (y) =>
    y
      .command(checkCredentialsCommand)
      .command(listTasksCommand)
      .command(getTaskCommand)
      .command(getListsCommand)
      .command(createTaskCommand)
      .command(updateTaskCommand)
      .command(createFolderCommand)
      .command(uploadAttachmentCommand)
      .demandCommand(1, ""),
  handler: () => {},
};

export default clickupCommand;
