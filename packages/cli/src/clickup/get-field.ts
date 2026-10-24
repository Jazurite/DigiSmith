import type { CommandModule } from "yargs";
import type { FrontdoorClient } from "@digismith/clickup-client";
import { createFrontdoorClient } from "./lib.ts";

export function createGetFieldCommand(clientFactory: () => FrontdoorClient = createFrontdoorClient): CommandModule {
  return {
    command: "get-field <id>",
    describe: "read a custom field with its options and locations (Frontdoor, read only)",
    builder: (y) =>
      y
        .positional("id", { type: "string", demandOption: true, describe: "field id" })
        .option("json", { type: "boolean", default: false, describe: "print the whole answer as JSON" }),
    handler: async (argv) => {
      try {
        const f = await clientFactory().getFieldLocations(argv.id as string);
        if (argv.json) {
          console.log(JSON.stringify(f, null, 2));
        } else {
          console.log(`field ${f.id} (${f.type}) ${JSON.stringify(f.name)}`);
          for (const o of f.type_config.options ?? []) console.log(`option ${o.id} ${o.name} (orderindex ${o.orderindex})`);
          const locations = f.locations ?? [];
          console.log(locations.length === 0 ? "locations: none" : `locations:\n${JSON.stringify(locations, null, 2)}`);
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup get-field: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const getFieldCommand: CommandModule = createGetFieldCommand();
