import type { CommandModule } from "yargs";
import type { FrontdoorClient } from "@digismith/clickup-client";
import { createFrontdoorClient } from "./lib.ts";
import { printCall } from "./task-type-write.ts";
import { buildFieldPutBody, describeFieldDiff, resolveOptionAdds, resolveOptionRenames } from "./field-write.ts";

export function createUpdateFieldCommand(
  clientFactory: () => FrontdoorClient = createFrontdoorClient
): CommandModule {
  return {
    command: "update-field",
    describe: "rename a dropdown custom field, rename and add its options (Frontdoor); a dry run unless --yes",
    builder: (y) =>
      y
        .option("field", { type: "string", requiresArg: true, demandOption: true, describe: "custom field id (uuid)" })
        .option("name", { type: "string", requiresArg: true, describe: "new field name" })
        .option("option", {
          type: "string",
          array: true,
          requiresArg: true,
          describe: 'rename an option: "<current name or id>=<new name>" (split at the last =); repeat for more',
        })
        .option("add-option", {
          type: "string",
          array: true,
          requiresArg: true,
          describe: "add an option with this name (at the end); repeat for more",
        })
        .option("color", { type: "string", requiresArg: true, describe: 'color of the added options, "#rrggbb" (default #cecece)' })
        .option("yes", { type: "boolean", default: false, describe: "send the call (without it, only print it)" }),
    handler: async (argv) => {
      try {
        const name = argv.name as string | undefined;
        const optionArgs = (argv.option as string[] | undefined) ?? [];
        const addArgs = (argv.addOption as string[] | undefined) ?? [];
        if (name === undefined && optionArgs.length === 0 && addArgs.length === 0) {
          throw new Error("nothing to change: pass --name, --option or --add-option");
        }
        if (name !== undefined && name.trim() === "") throw new Error("--name must not be empty");
        const client = clientFactory();
        const field = await client.getField(argv.field as string);
        if (field.type !== "drop_down") {
          throw new Error(`field "${field.name}" is ${field.type}; only drop_down fields are supported`);
        }
        const renames = resolveOptionRenames(field, optionArgs);
        const adds = resolveOptionAdds(field, addArgs, argv.color as string | undefined);
        const body = buildFieldPutBody(field, name?.trim(), renames, adds);
        if (!argv.yes) {
          for (const line of describeFieldDiff(field, name?.trim(), renames, adds)) console.log(line);
          printCall("PUT", `/customFields/v2/field/${field.id}`, body);
          console.log("nothing sent; add --yes to send");
        } else {
          console.log(JSON.stringify(await client.updateField(field.id, body), null, 2));
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup update-field: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const updateFieldCommand: CommandModule = createUpdateFieldCommand();
