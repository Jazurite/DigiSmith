import type { CommandModule } from "yargs";
import type { FrontdoorClient } from "@digismith/clickup-client";
import { createFrontdoorClient } from "./lib.ts";
import { printCall } from "./task-type-write.ts";

const ID = /^\d+$/;

export function createMoveListCommand(
  clientFactory: () => FrontdoorClient = createFrontdoorClient
): CommandModule {
  return {
    command: "move-list",
    describe: "move a List into a Folder (Frontdoor); a dry run unless --yes",
    builder: (y) =>
      y
        .option("list", { type: "string", requiresArg: true, demandOption: true, describe: "id of the List to move" })
        .option("folder", { type: "string", requiresArg: true, demandOption: true, describe: "id of the Folder to move it into" })
        .option("position", { type: "number", requiresArg: true, default: 0, describe: "place in the Folder (0 = first)" })
        .option("yes", { type: "boolean", default: false, describe: "send the call (without it, only print it)" }),
    handler: async (argv) => {
      try {
        const list = String(argv.list);
        const folder = String(argv.folder);
        const position = (argv.position as number | undefined) ?? 0;
        if (!ID.test(list)) throw new Error("--list must be a list id (digits only)");
        if (!ID.test(folder)) throw new Error("--folder must be a folder id (digits only)");
        if (!Number.isInteger(position) || position < 0) throw new Error("--position must be a whole number, 0 or more");
        if (!argv.yes) {
          printCall(
            "PUT",
            `/hierarchy/v2/subcategory/${list}/position?v2=true&conflict_modal=true&return_conflict_on_cancel=true`,
            { position, include_archived: false, category: folder }
          );
          console.log("nothing sent; add --yes to send");
        } else {
          await clientFactory().moveList(list, { folderId: folder, position });
          console.log(`moved list ${list} into folder ${folder} at position ${position}; check it with dg clickup get-lists`);
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup move-list: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const moveListCommand: CommandModule = createMoveListCommand();
