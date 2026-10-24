import type { CommandModule } from "yargs";
import type { ClickUpClient, ClickUpViewCreateBody } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import { printCall } from "./task-type-write.ts";

export function buildViewBody(name: string, status: string, sortFieldId: string, columnFieldIds: string[]): ClickUpViewCreateBody {
  return {
    name,
    type: "list",
    filters: { op: "AND", fields: [{ field: "status", op: "EQ", values: [status] }], search: "", show_closed: false },
    sorting: { fields: [{ field: `cf_${sortFieldId}`, dir: 1 }] },
    columns: { fields: columnFieldIds.map((id) => ({ field: `cf_${id}`, hidden: false as const })) },
  };
}

export function createCreateViewCommand(clientFactory: () => ClickUpClient = createClient): CommandModule {
  return {
    command: "create-view",
    describe: "create a list view at a space, filtered on one status and sorted by one custom field (public API); a dry run unless --yes",
    builder: (y) =>
      y
        .option("space", { type: "string", requiresArg: true, demandOption: true, describe: "space id" })
        .option("name", { type: "string", requiresArg: true, demandOption: true, describe: "view name" })
        .option("status", { type: "string", requiresArg: true, demandOption: true, describe: "show only tasks in this status" })
        .option("sort-field-id", { type: "string", requiresArg: true, demandOption: true, describe: "custom field id to sort by, ascending" })
        .option("column-field-id", { type: "string", array: true, requiresArg: true, default: [], describe: "custom field id to show as a column; repeat for more" })
        .option("yes", { type: "boolean", default: false, describe: "send the call (without it, only print it)" }),
    handler: async (argv) => {
      try {
        const space = argv.space as string;
        if (!/^\d+$/.test(space)) throw new Error("--space must be a numeric id");
        const name = ((argv.name as string) ?? "").trim();
        if (name === "") throw new Error("--name must not be empty");
        const status = ((argv.status as string) ?? "").trim();
        if (status === "") throw new Error("--status must not be empty");
        const sortFieldId = ((argv.sortFieldId as string) ?? "").trim();
        if (sortFieldId === "") throw new Error("--sort-field-id must not be empty");
        const body = buildViewBody(name, status, sortFieldId, (argv.columnFieldId as string[]) ?? []);
        const client = clientFactory();
        const clash = (await client.getSpaceViews(space)).find((v) => v.name.trim().toLowerCase() === name.toLowerCase());
        if (clash) throw new Error(`the space already has a view named "${clash.name}" (${clash.id}); nothing sent`);
        if (!argv.yes) {
          printCall("POST", `/space/${space}/view`, body);
          console.log("nothing sent; add --yes to send");
        } else {
          const view = await client.createSpaceView(space, body);
          const back = (await client.getSpaceViews(space)).some((v) => v.id === view.id);
          if (!back) throw new Error(`view ${view.id} was created but is not in the space's views on read-back`);
          console.log(`view ${view.id} (${view.type}) ${JSON.stringify(view.name)}, read back`);
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup create-view: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const createViewCommand: CommandModule = createCreateViewCommand();
