import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";

const ID = /^\d+$/;

export function createDeleteFolderCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "delete-folder",
    describe: "delete an EMPTY folder (no lists, archived included); a dry run unless --yes",
    builder: (y) =>
      y
        .option("folder", { type: "string", requiresArg: true, demandOption: true, describe: "id of the folder to delete" })
        .option("yes", { type: "boolean", default: false, describe: "send the DELETE (without it, only read and report)" }),
    handler: async (argv) => {
      try {
        const folder = String(argv.folder);
        if (!ID.test(folder)) throw new Error("--folder must be a folder id (digits only)");
        const client = clientFactory();
        // A task lives in a list, so a folder with no list (archived included) holds no task.
        const lists = await client.getFolderLists(folder);
        const left = lists.map((l) => `  ${l.id}  ${l.name}`).join("\n");
        if (!argv.yes) {
          if (lists.length === 0) console.log(`would delete: folder ${folder} has no lists`);
          else console.log(`would refuse: folder ${folder} still holds ${lists.length} list(s):\n${left}`);
          console.log("nothing sent; add --yes to delete");
        } else if (lists.length > 0) {
          console.error(`clickup delete-folder: folder ${folder} still holds ${lists.length} list(s), nothing deleted:\n${left}`);
          process.exitCode = 1;
          return;
        } else {
          await client.deleteFolder(folder);
          console.log(`deleted folder ${folder}; check it with dg clickup get-lists (it must be gone)`);
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup delete-folder: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const deleteFolderCommand: CommandModule = createDeleteFolderCommand();
