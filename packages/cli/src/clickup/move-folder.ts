import type { CommandModule } from "yargs";
import type { ClickUpClient, MoveFolderTarget } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import { printCall } from "./task-type-write.ts";

const ID = /^\d+$/;

export function createMoveFolderCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "move-folder",
    describe: "move a folder into another folder, or to the top level of a space; a dry run unless --yes",
    builder: (y) =>
      y
        .option("folder", { type: "string", requiresArg: true, demandOption: true, describe: "id of the folder to move" })
        .option("parent", { type: "string", requiresArg: true, describe: "id of the folder to move it into" })
        .option("space", { type: "string", requiresArg: true, describe: "id of the space to move it to (top level)" })
        .option("position", { type: "number", requiresArg: true, describe: "place in the target (default: ClickUp's own)" })
        .option("yes", { type: "boolean", default: false, describe: "send the call (without it, only print it)" }),
    handler: async (argv) => {
      try {
        const folder = String(argv.folder);
        const parent = argv.parent === undefined ? undefined : String(argv.parent);
        const space = argv.space === undefined ? undefined : String(argv.space);
        const position = argv.position as number | undefined;
        if (!ID.test(folder)) throw new Error("--folder must be a folder id (digits only)");
        if (parent !== undefined && space !== undefined) throw new Error("--parent and --space cannot be used together");
        if (parent === undefined && space === undefined) throw new Error("give --parent <folder id> or --space <space id>");
        if (parent !== undefined && !ID.test(parent)) {
          throw new Error("--parent must be a folder id (digits only); to move to the space top level use --space <id>");
        }
        if (space !== undefined && !ID.test(space)) throw new Error("--space must be a space id (digits only)");
        if (parent === folder) throw new Error("cannot move a folder into itself");
        if (position !== undefined && (!Number.isInteger(position) || position < 0)) {
          throw new Error("--position must be a whole number, 0 or more");
        }
        const pos = position === undefined ? {} : { position };
        const target: MoveFolderTarget = parent !== undefined ? { parentFolderId: parent, ...pos } : { spaceId: space as string, ...pos };
        if (!argv.yes) {
          const body = {
            ...(parent !== undefined ? { parent_folder_id: parent } : { space_id: space }),
            ...pos,
          };
          printCall("PUT", `/folder/${folder}/position`, body);
          console.log("nothing sent; add --yes to send");
        } else {
          await clientFactory().moveFolder(folder, target);
          const where = parent !== undefined ? `into folder ${parent}` : `to the top level of space ${space}`;
          console.log(`moved folder ${folder} ${where}; check it with dg clickup get-lists (parent_folder)`);
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup move-folder: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const moveFolderCommand: CommandModule = createMoveFolderCommand();
