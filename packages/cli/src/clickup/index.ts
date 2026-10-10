import type { CommandModule } from "yargs";
import { checkCredentialsCommand } from "./check-credentials.ts";
import { listTasksCommand } from "./list-tasks.ts";
import { getTaskCommand } from "./get-task.ts";
import { getListsCommand } from "./get-lists.ts";
import { createTaskCommand } from "./create-task.ts";
import { updateTaskCommand } from "./update-task.ts";
import { moveTaskCommand } from "./move-task.ts";
import { createFolderCommand } from "./create-folder.ts";
import { createListCommand } from "./create-list.ts";
import { updateListCommand } from "./update-list.ts";
import { listTaskTypesCommand } from "./list-task-types.ts";
import { createTaskTypeCommand } from "./create-task-type.ts";
import { updateTaskTypeCommand } from "./update-task-type.ts";
import { deleteTaskTypeCommand } from "./delete-task-type.ts";
import { updateFieldCommand } from "./update-field.ts";
import frontdoorCommand from "./frontdoor/index.ts";
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
      .command(moveTaskCommand)
      .command(createFolderCommand)
      .command(createListCommand)
      .command(updateListCommand)
      .command(uploadAttachmentCommand)
      .command(listTaskTypesCommand)
      .command(createTaskTypeCommand)
      .command(updateTaskTypeCommand)
      .command(deleteTaskTypeCommand)
      .command(updateFieldCommand)
      .command(frontdoorCommand)
      .demandCommand(1, ""),
  handler: () => {},
};

export default clickupCommand;
