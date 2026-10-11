import type { CommandModule } from "yargs";
import type { FrontdoorClient, FrontdoorFieldCreateBody } from "@digismith/clickup-client";
import { createFrontdoorClient } from "./lib.ts";
import { printCall } from "./task-type-write.ts";

const DEFAULT_COLORS = ["#7C4DFF", "#1bbc9c", "#F9D900", "#e50000", "#0079bf", "#ff7800", "#81b1ff", "#b5bcc2"];
const HEX = /^(#([0-9a-f]{3}|[0-9a-f]{6})|[0-9a-f]{6})$/i;

/** "Name" or "Name:color": the colour counts only when the text after the last ":" is a hex colour: "#rgb", "#rrggbb" or "rrggbb" (a bare 3-digit tail stays part of the name). */
export function parseOption(input: string, position: number): { name: string; color: string } {
  const at = input.lastIndexOf(":");
  const tail = at < 0 ? "" : input.slice(at + 1).trim();
  if (at >= 0 && HEX.test(tail)) {
    return { name: input.slice(0, at).trim(), color: tail.startsWith("#") ? tail : `#${tail}` };
  }
  return { name: input.trim(), color: DEFAULT_COLORS[position % DEFAULT_COLORS.length] };
}

export function buildFieldCreateBody(
  name: string,
  optionArgs: string[],
  folder: string,
  description: string
): FrontdoorFieldCreateBody {
  const options = optionArgs.map((o, i) => parseOption(o, i));
  const seen = new Set<string>();
  for (const o of options) {
    if (o.name === "") throw new Error("option name must not be empty");
    const key = o.name.toLowerCase();
    if (seen.has(key)) throw new Error(`duplicate option "${key}"`);
    seen.add(key);
  }
  return {
    name,
    description,
    type: "drop_down",
    type_config: {
      new_drop_down: true,
      sorting: "manual",
      options: options.map((o) => ({ id: null, name: o.name, color: o.color, orderindex: null })),
    },
    category_id: folder,
    required: false,
    required_on_subtasks: false,
    pinned: false,
    private: false,
    hide_from_guests: false,
    permission_level: null,
    members: [],
    groups: [],
  };
}

export function createCreateFieldCommand(
  clientFactory: () => FrontdoorClient = createFrontdoorClient
): CommandModule {
  return {
    command: "create-field",
    describe: "create a dropdown custom field scoped to a folder (Frontdoor); a dry run unless --yes",
    builder: (y) =>
      y
        .option("name", { type: "string", requiresArg: true, demandOption: true, describe: "field name" })
        .option("type", { type: "string", choices: ["drop_down"], default: "drop_down", describe: "field type" })
        .option("option", {
          type: "string",
          array: true,
          requiresArg: true,
          describe: 'dropdown option: "<name>" or "<name>:<hex colour>"; repeat for more, in order',
        })
        .option("folder", { type: "string", requiresArg: true, describe: "folder id the field is scoped to" })
        .option("list", { type: "string", requiresArg: true, describe: "not supported yet" })
        .option("description", { type: "string", requiresArg: true, default: "", describe: "field description" })
        .option("yes", { type: "boolean", default: false, describe: "send the call (without it, only print it)" }),
    handler: async (argv) => {
      try {
        if (argv.list !== undefined) {
          throw new Error("--list is not supported yet: the list location type is not captured (DGS-134). Use --folder.");
        }
        if (argv.type !== "drop_down") throw new Error(`type "${argv.type}" is not supported; only drop_down`);
        for (const flag of ["name", "folder", "description"] as const) {
          if (Array.isArray(argv[flag])) throw new Error(`--${flag} was given more than once`);
        }
        const name = ((argv.name as string) ?? "").trim();
        if (name === "") throw new Error("--name must not be empty");
        const folder = argv.folder as string | undefined;
        if (folder === undefined) throw new Error("--folder is required");
        if (!/^\d+$/.test(folder)) throw new Error("--folder must be a numeric id");
        const optionArgs = (argv.option as string[] | undefined) ?? [];
        if (optionArgs.length === 0) throw new Error("at least one --option is required");
        const body = buildFieldCreateBody(name, optionArgs, folder, (argv.description as string) ?? "");
        if (!argv.yes) {
          printCall("POST", "/customFields/v2/field?ignore_existing=true", body);
          console.log("nothing sent; add --yes to send");
        } else {
          const field = await clientFactory().createField(body);
          console.log(`field ${field.id} (${field.type}) ${JSON.stringify(field.name)}`);
          for (const o of field.type_config.options ?? []) {
            console.log(`option ${o.id} ${o.name} (orderindex ${o.orderindex})`);
          }
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup create-field: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const createFieldCommand: CommandModule = createCreateFieldCommand();
