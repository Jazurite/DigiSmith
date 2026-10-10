import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import type { FieldLike } from "./field-set.ts";

export function formatFields(fields: FieldLike[]): string[] {
  const lines: string[] = [];
  for (const f of fields) {
    lines.push(`${f.id}  ${f.name}  ${f.type}`);
    for (const o of f.type_config?.options ?? []) lines.push(`    ${o.name} (${o.id})`);
  }
  return lines;
}

export function createListFieldsCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "list-fields",
    describe: "list the custom fields of a ClickUp list (id, name, type, drop-down options)",
    builder: (y) =>
      y
        .option("list", { type: "string", requiresArg: true, demandOption: true, describe: "ClickUp list ID" })
        .option("json", { type: "boolean", default: false, describe: "print the raw field array" }),
    handler: async (argv) => {
      try {
        const fields = await clientFactory().getListFields(argv.list as string);
        if (argv.json) console.log(JSON.stringify(fields, null, 2));
        else for (const line of formatFields(fields as unknown as FieldLike[])) console.log(line);
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup list-fields: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const listFieldsCommand: CommandModule = createListFieldsCommand();
