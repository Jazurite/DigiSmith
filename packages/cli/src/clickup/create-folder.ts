import type { CommandModule } from "yargs";
import type { Space } from "@digismith/clickup-client";
import { createDigiSmithSpace } from "./lib.ts";

export function createCreateFolderCommand(
  spaceFactory: () => Space = createDigiSmithSpace
): CommandModule {
  return {
    command: "create-folder",
    describe: "create a new Folder in the DigiSmith ClickUp space",
    builder: (y) =>
      y.option("name", {
        type: "string",
        requiresArg: true,
        demandOption: true,
        describe: "folder name",
      }),
    handler: async (argv) => {
      try {
        const space = spaceFactory();
        const folder = await space.createFolder(argv.name as string);
        console.log(JSON.stringify(folder, null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup create-folder: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const createFolderCommand: CommandModule = createCreateFolderCommand();
