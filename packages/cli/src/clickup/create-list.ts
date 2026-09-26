import type { CommandModule } from "yargs";
import type { ClickUpClient, Space } from "@digismith/clickup-client";
import { createClient, createDigiSmithSpace } from "./lib.ts";

export function createCreateListCommand(
  clientFactory: () => ClickUpClient = createClient,
  spaceFactory: () => Space = createDigiSmithSpace
): CommandModule {
  return {
    command: "create-list",
    describe: "create a new List, in a Folder or folderless in the DigiSmith space",
    builder: (y) =>
      y
        .option("name", {
          type: "string",
          requiresArg: true,
          demandOption: true,
          describe: "list name",
        })
        .option("folder", {
          type: "string",
          requiresArg: true,
          describe: "ClickUp folder ID — omit to create a folderless list in the DigiSmith space",
        }),
    handler: async (argv) => {
      try {
        const name = argv.name as string;
        const folderId = argv.folder as string | undefined;
        if (folderId?.trim() === "") throw new Error("--folder needs a folder ID");
        const list = folderId
          ? await clientFactory().createListInFolder(folderId, name)
          : await spaceFactory().createList(name);
        console.log(JSON.stringify(list, null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup create-list: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const createListCommand: CommandModule = createCreateListCommand();
