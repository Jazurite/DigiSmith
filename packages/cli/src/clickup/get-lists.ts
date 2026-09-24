import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";

export function createGetListsCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "get-lists",
    describe: "list a ClickUp space's folders (with their lists) and folderless lists",
    builder: (y) =>
      y.option("space", {
        type: "string",
        requiresArg: true,
        demandOption: true,
        describe: "ClickUp space ID",
      }),
    handler: async (argv) => {
      try {
        const client = clientFactory();
        const spaceId = argv.space as string;
        const [folders, lists] = await Promise.all([
          client.getSpaceFolders(spaceId),
          client.getFolderlessLists(spaceId),
        ]);
        console.log(JSON.stringify({ folders, lists }, null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup get-lists: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const getListsCommand: CommandModule = createGetListsCommand();
