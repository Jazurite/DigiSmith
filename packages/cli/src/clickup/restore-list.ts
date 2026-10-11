import type { CommandModule } from "yargs";
import type { FrontdoorClient } from "@digismith/clickup-client";
import { createFrontdoorClient } from "./lib.ts";
import { printCall } from "./task-type-write.ts";

const ID = /^\d+$/;

export function createRestoreListCommand(clientFactory: () => FrontdoorClient = createFrontdoorClient): CommandModule {
  return {
    command: "restore-list",
    describe: "restore a deleted List from the ClickUp Trash, with its tasks (Frontdoor); a dry run unless --yes",
    builder: (y) =>
      y
        .option("list", { type: "string", requiresArg: true, demandOption: true, describe: "id of the deleted List to restore" })
        .option("yes", { type: "boolean", default: false, describe: "send the call (without it, only print it)" }),
    handler: async (argv) => {
      try {
        const list = String(argv.list);
        if (!ID.test(list)) throw new Error("--list must be a list id (digits only)");
        if (!argv.yes) {
          printCall("PUT", `/v1/subcategory/${list}/undo`, { method: "delete" });
          console.log("nothing sent; add --yes to send");
        } else {
          await clientFactory().restoreList(list);
          console.log(`restored list ${list}; check with dg clickup get-lists (the list is back, task count)`);
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup restore-list: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const restoreListCommand: CommandModule = createRestoreListCommand();
