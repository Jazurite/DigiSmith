import type { CommandModule } from "yargs";
import type { ClickUpClient, FrontdoorClient } from "@digismith/clickup-client";
import { createClient, createFrontdoorClient } from "./lib.ts";
import { deleteFolderWithContents } from "./delete-with-contents.ts";

const ID = /^\d+$/;

export function createDeleteFolderCommand(
  clientFactory: () => ClickUpClient = createClient,
  frontdoorFactory: () => FrontdoorClient = createFrontdoorClient
): CommandModule {
  return {
    command: "delete-folder",
    describe: "delete an EMPTY folder (no lists, archived included); a dry run unless --yes. --with-contents deletes the folder with its lists and tasks (Frontdoor)",
    builder: (y) =>
      y
        .option("folder", { type: "string", requiresArg: true, demandOption: true, describe: "id of the folder to delete" })
        .option("yes", { type: "boolean", default: false, describe: "send the DELETE (without it, only read and report)" })
        .option("with-contents", { type: "boolean", default: false, describe: "delete the folder WITH its lists, nested folders and tasks (Frontdoor); the dry run lists what would go" }),
    handler: async (argv) => {
      try {
        const folder = String(argv.folder);
        if (!ID.test(folder)) throw new Error("--folder must be a folder id (digits only)");
        if (argv["with-contents"]) {
          await deleteFolderWithContents({ id: folder, yes: Boolean(argv.yes), reader: clientFactory, frontdoor: frontdoorFactory });
          process.exitCode = process.exitCode === 1 ? 1 : 0;
          return;
        }
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
