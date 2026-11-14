import type { CommandModule } from "yargs";
import type { ClickUpClient, FrontdoorClient } from "@digismith/clickup-client";
import { buildFieldCreateBody, parseOption } from "./create-field.ts";
import { createClient, createFrontdoorClient } from "./lib.ts";
import { SPACES } from "./spaces.ts";
import { printCall } from "./task-type-write.ts";

/** The fields the factory claims by. Same names, options, order and colours as the DigiSmith space (read 2026-11-14). */
export const FACTORY_FIELDS = [
  { name: "Mode", options: ["Autonomous:#2ecd6f", "Manual:#e67e22"] },
  { name: "Sign-off", options: ["Auto:#1bbc9c", "Jack:#e67e22"] },
] as const;

/** Location type 4 = a space (read from get-field on DigiSmith's Mode field). */
const SPACE_LOCATION_TYPE = 4;

interface ListedField { id: string; name: string; type_config?: { options?: { name: string; orderindex: number }[] } }

async function fieldsOfSpace(client: ClickUpClient, space: string): Promise<Map<string, ListedField>> {
  const [folders, loose] = await Promise.all([client.getSpaceFolders(space), client.getFolderlessLists(space)]);
  const lists = [...folders.flatMap((f) => f.lists ?? []), ...loose];
  const found = new Map<string, ListedField>();
  for (const l of lists) {
    for (const f of (await client.getListFields(l.id)) as unknown as ListedField[]) if (!found.has(f.name)) found.set(f.name, f);
  }
  return found;
}

const optionNames = (f: ListedField): string[] =>
  [...(f.type_config?.options ?? [])].sort((a, b) => a.orderindex - b.orderindex).map((o) => o.name);

export function createCreateFactoryFieldsCommand(
  readFactory: () => ClickUpClient = createClient,
  fieldFactory: () => FrontdoorClient = createFrontdoorClient
): CommandModule {
  return {
    command: "create-factory-fields",
    describe: "create the Mode and Sign-off fields the factory claims by in a space (same options as DigiSmith's); a dry run unless --yes; skips a field that exists",
    builder: (y) =>
      y
        .option("space", { type: "string", requiresArg: true, demandOption: true, describe: "space id (must be in the factory space list)" })
        .option("yes", { type: "boolean", default: false, describe: "send the calls (without it, only print them)" }),
    handler: async (argv) => {
      try {
        const space = String(argv.space ?? "").trim();
        if (!SPACES.some((s) => s.id === space)) {
          throw new Error(`"${space}" is not a known space (${SPACES.map((s) => `${s.name} ${s.id}`).join(", ")})`);
        }
        const existing = await fieldsOfSpace(readFactory(), space);
        const plan: (typeof FACTORY_FIELDS)[number][] = [];
        for (const want of FACTORY_FIELDS) {
          const have = existing.get(want.name);
          const names = want.options.map((o, i) => parseOption(o, i).name);
          if (!have) { plan.push(want); continue; }
          const got = optionNames(have);
          if (got.join("|") !== names.join("|")) {
            throw new Error(`"${want.name}" exists with options ${got.join(", ")}; expected ${names.join(", ")}. Nothing created; fix it by hand.`);
          }
          console.log(`skip ${want.name}: exists (${have.id})`);
        }
        const client = fieldFactory();
        const location = [{ parent: { type: SPACE_LOCATION_TYPE, id: space }, required: false as const, required_on_subtasks: false as const, hide_from_guests: false as const }];
        for (const want of plan) {
          const body = buildFieldCreateBody(want.name, [...want.options], { teamId: client.teamId }, "", "drop_down");
          if (!argv.yes) {
            printCall("POST", "/customFields/v2/field?ignore_existing=true", body);
            printCall("PUT", `/field/v3/experience/workspaces/${client.teamId}/fields/<new field id>/locations`, { new_locations: location });
            continue;
          }
          const created = await client.createField(body);
          console.log(`field ${created.id} (${created.type}) ${JSON.stringify(created.name)}`);
          try {
            await client.setFieldLocations(created.id, location);
          } catch (e) {
            throw new Error(`field ${created.id} was created, but setting its locations failed: ${(e as Error).message}. Run get-field ${created.id} and set the locations again; do not create the field twice.`);
          }
          const back = await client.getFieldLocations(created.id);
          console.log(`locations read back: ${(back.locations ?? []).length}`);
        }
        if (!argv.yes && plan.length > 0) console.log("nothing sent; add --yes to send");
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup create-factory-fields: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const createFactoryFieldsCommand: CommandModule = createCreateFactoryFieldsCommand();
