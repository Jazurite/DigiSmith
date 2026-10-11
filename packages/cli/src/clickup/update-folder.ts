import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import { printCall } from "./task-type-write.ts";

const ID = /^\d+$/;

export function createUpdateFolderCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "update-folder",
    describe: "rename a ClickUp folder; a dry run unless --yes",
    builder: (y) =>
      y
        .option("folder", { type: "string", requiresArg: true, demandOption: true, describe: "id of the folder to rename" })
        .option("name", { type: "string", requiresArg: true, demandOption: true, describe: "new folder name" })
        .option("yes", { type: "boolean", default: false, describe: "send the call (without it, only print it)" }),
    handler: async (argv) => {
      try {
        const folder = String(argv.folder);
        const name = String(argv.name);
        if (!ID.test(folder)) throw new Error("--folder must be a folder id (digits only)");
        if (name.trim() === "") throw new Error("--name needs a non-empty name");
        if (!argv.yes) {
          printCall("PUT", `/folder/${folder}`, { name });
          console.log("nothing sent; add --yes to send");
        } else {
          const client = clientFactory();
          await client.updateFolder(folder, name);
          const back = await client.getFolder(folder);
          if (back.name !== name) {
            throw new Error(`sent "${name}" but read back "${back.name}" for folder ${folder}`);
          }
          console.log(`renamed folder ${folder} to "${back.name}"; check it with dg clickup get-lists`);
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup update-folder: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const updateFolderCommand: CommandModule = createUpdateFolderCommand();
