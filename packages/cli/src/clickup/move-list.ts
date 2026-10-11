import type { CommandModule } from "yargs";
import type { ClickUpClient, FrontdoorClient } from "@digismith/clickup-client";
import { createClient, createFrontdoorClient } from "./lib.ts";
import { printCall } from "./task-type-write.ts";

const ID = /^\d+$/;

export function createMoveListCommand(
  clientFactory: () => FrontdoorClient = createFrontdoorClient,
  readerFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "move-list",
    describe:
      "move a List into a Folder, or reorder it inside its own Folder (Frontdoor); a dry run unless --yes. Reads the List first (public API) to know its Folder; a reorder sends the position only",
    builder: (y) =>
      y
        .option("list", { type: "string", requiresArg: true, demandOption: true, describe: "id of the List to move" })
        .option("folder", { type: "string", requiresArg: true, describe: "id of the Folder to move it into; its own Folder (or left out) = reorder, --position then required" })
        .option("position", { type: "number", requiresArg: true, describe: "place in the Folder (0 = first; default 0 for a move into another Folder)" })
        .option("yes", { type: "boolean", default: false, describe: "send the call (without it, only print it)" }),
    handler: async (argv) => {
      try {
        const list = String(argv.list);
        const folder = argv.folder === undefined ? undefined : String(argv.folder);
        const given = argv.position as number | undefined;
        if (!ID.test(list)) throw new Error("--list must be a list id (digits only)");
        if (folder !== undefined && !ID.test(folder)) throw new Error("--folder must be a folder id (digits only)");
        if (given !== undefined && (!Number.isInteger(given) || given < 0)) throw new Error("--position must be a whole number, 0 or more");
        const detail = await readerFactory().getList(list);
        const current = detail.folder && !detail.folder.hidden ? detail.folder.id : undefined;
        const reorder = folder === undefined || folder === current;
        let position = given;
        if (reorder) {
          if (current === undefined) throw new Error(`list ${list} is not in a folder; give --folder to move it into one`);
          if (given === undefined) {
            throw new Error(`--position is required to reorder list ${list} inside its own folder ${current} (or give --folder to move it)`);
          }
        } else {
          position = given ?? 0;
        }
        const kind = reorder ? `reorder inside folder ${current}` : `folder change into ${folder}`;
        if (!argv.yes) {
          printCall(
            "PUT",
            `/hierarchy/v2/subcategory/${list}/position?v2=true&conflict_modal=true&return_conflict_on_cancel=true`,
            reorder ? { position, include_archived: false } : { position, include_archived: false, category: folder }
          );
          console.log(`this is a ${kind}`);
          console.log("nothing sent; add --yes to send");
        } else {
          await clientFactory().moveList(list, reorder ? { position: position as number } : { folderId: folder, position: position as number });
          console.log(`${reorder ? `reordered list ${list} inside folder ${current}` : `moved list ${list} into folder ${folder}`} at position ${position}; check it with dg clickup get-lists`);
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
