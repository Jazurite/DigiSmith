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

const LOCATION = /^([1-9]\d?):(\d+)$/;

/** "<type>:<id>" as printed by get-field: a location type number and a numeric id. */
export function parseLocation(input: string): { type: number; id: string } {
  const m = LOCATION.exec(input.trim());
  if (!m) throw new Error(`--location "${input}" must look like "<type>:<id>" with a type from 1 to 99 and a numeric id (read them with dg clickup get-field on a field that already has the place)`);
  return { type: Number(m[1]), id: m[2] };
}

export function buildFieldCreateBody(
  name: string,
  optionArgs: string[],
  scope: { folder: string } | { teamId: string },
  description: string,
  fieldType: "drop_down" | "date" = "drop_down"
): FrontdoorFieldCreateBody {
  if (fieldType === "date") {
    return {
      name,
      description,
      type: "date",
      type_config: {},
      ...("folder" in scope ? { category_id: scope.folder } : { team_id: scope.teamId }),
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
    ...("folder" in scope ? { category_id: scope.folder } : { team_id: scope.teamId }),
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
    describe: "create a dropdown or date custom field at a folder or at locations read with get-field (Frontdoor); a dry run unless --yes",
    builder: (y) =>
      y
        .option("name", { type: "string", requiresArg: true, demandOption: true, describe: "field name" })
        .option("type", { type: "string", choices: ["drop_down", "date"], default: "drop_down", describe: "field type" })
        .option("option", {
          type: "string",
          array: true,
          requiresArg: true,
          describe: 'dropdown option: "<name>" or "<name>:<hex colour>"; repeat for more, in order',
        })
        .option("folder", { type: "string", requiresArg: true, describe: "folder id the field is scoped to" })
        .option("location", {
          type: "string",
          array: true,
          requiresArg: true,
          describe: 'a place the field shows: "<type>:<id>" as printed by get-field; repeat for more; not with --folder',
        })
        .option("list", { type: "string", requiresArg: true, describe: "not supported yet" })
        .option("description", { type: "string", requiresArg: true, default: "", describe: "field description" })
        .option("yes", { type: "boolean", default: false, describe: "send the call (without it, only print it)" }),
    handler: async (argv) => {
      try {
        if (argv.list !== undefined) {
          throw new Error("--list is not supported yet: the list location type is not captured (DGS-134). Use --folder or --location.");
        }
        if (argv.type !== "drop_down" && argv.type !== "date") throw new Error(`type "${argv.type}" is not supported; only drop_down and date`);
        const fieldType = argv.type as "drop_down" | "date";
        for (const flag of ["name", "folder", "description"] as const) {
          if (Array.isArray(argv[flag])) throw new Error(`--${flag} was given more than once`);
        }
        const name = ((argv.name as string) ?? "").trim();
        if (name === "") throw new Error("--name must not be empty");
        const folder = argv.folder as string | undefined;
        const optionArgs = (argv.option as string[] | undefined) ?? [];
        if (fieldType === "date" && optionArgs.length > 0) throw new Error("--option is only for --type drop_down");
        if (fieldType === "drop_down" && optionArgs.length === 0) throw new Error("at least one --option is required");
        const locationArgs = (argv.location as string[] | undefined) ?? [];
        if (folder !== undefined && locationArgs.length > 0) throw new Error("use --folder or --location, not both");
        if (folder === undefined && locationArgs.length === 0) throw new Error("--folder or --location is required");
        if (folder !== undefined && !/^\d+$/.test(folder)) throw new Error("--folder must be a numeric id");
        const locations = [...new Set(locationArgs.map((l) => l.trim()))]
          .map(parseLocation)
          .map((parent) => ({ parent, required: false as const, required_on_subtasks: false as const, hide_from_guests: false as const }));
        const client = clientFactory();
        const body = buildFieldCreateBody(name, optionArgs, folder !== undefined ? { folder } : { teamId: client.teamId }, (argv.description as string) ?? "", fieldType);
        if (!argv.yes) {
          printCall("POST", "/customFields/v2/field?ignore_existing=true", body);
          if (locations.length > 0) {
            printCall("PUT", `/field/v3/experience/workspaces/${client.teamId}/fields/<new field id>/locations`, { new_locations: locations });
          }
          console.log("nothing sent; add --yes to send");
        } else {
          let field;
          try {
            field = await client.createField(body);
          } catch (e) {
            const m = (e as Error).message;
            throw new Error(fieldType === "date" ? `${m} (the date body is not captured yet: create one date field in the ClickUp web app with Proxyman on, then compare with dg clickup frontdoor dump --match customFields)` : m);
          }
          console.log(`field ${field.id} (${field.type}) ${JSON.stringify(field.name)}`);
          for (const o of field.type_config.options ?? []) {
            console.log(`option ${o.id} ${o.name} (orderindex ${o.orderindex})`);
          }
          if (locations.length > 0) {
            try {
              await client.setFieldLocations(field.id, locations);
            } catch (e) {
              throw new Error(`field ${field.id} was created, but setting its locations failed: ${(e as Error).message}. Run get-field ${field.id} and set the locations again; do not create the field twice.`);
            }
            try {
              const back = await client.getFieldLocations(field.id);
              console.log(`locations read back: ${(back.locations ?? []).length}`);
            } catch (e) {
              throw new Error(`field ${field.id} was created and its locations were set, but the read-back failed: ${(e as Error).message}. Run get-field ${field.id} to check the locations; do not create the field twice.`);
            }
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
