import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import { printCall } from "./task-type-write.ts";

const ID = /^\d+$/;
const SHOWN = 5;

export function createDeleteListCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "delete-list",
    describe: "delete an EMPTY list; a dry run unless --yes; refuses when the list holds any task",
    builder: (y) =>
      y
        .option("list", { type: "string", requiresArg: true, demandOption: true, describe: "id of the list to delete" })
        .option("yes", { type: "boolean", default: false, describe: "send the call (without it, only check and print it)" }),
    handler: async (argv) => {
      try {
        const list = String(argv.list ?? "");
        if (!ID.test(list)) throw new Error("--list must be a list id (digits only)");
        const client = clientFactory();
        // archived=true returns ONLY archived tasks (DGS-83 incident), so read both and merge by id.
        const base = { include_closed: true, subtasks: true };
        const live = await client.getListTasks(list, { params: { ...base, archived: false } });
        const archived = await client.getListTasks(list, { params: { ...base, archived: true } });
        const byId = new Map<string, (typeof live)[number]>();
        for (const t of [...live, ...archived]) if (!byId.has(t.id)) byId.set(t.id, t);
        const held = [...byId.values()];
        if (held.length > 0) {
          const lines = held.slice(0, SHOWN).map((t) => `  ${t.id}  ${t.name}`);
          if (held.length > SHOWN) lines.push(`  ... and ${held.length - SHOWN} more`);
          const noun = held.length === 1 ? "task" : "tasks";
          console.error(
            `clickup delete-list: list ${list} holds ${held.length} ${noun} (archived and closed included); delete refused. Move or delete them first.\n${lines.join("\n")}`
          );
          process.exitCode = 1;
          return;
        }
        if (!argv.yes) {
          printCall("DELETE", `/list/${list}`, undefined);
          console.log("would delete: list is empty");
          console.log("nothing sent; add --yes to send");
        } else {
          await client.deleteList(list);
          console.log(`deleted list ${list}; check it with dg clickup get-lists`);
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup delete-list: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const deleteListCommand: CommandModule = createDeleteListCommand();
