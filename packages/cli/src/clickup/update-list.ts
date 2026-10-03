import { readFileSync } from "node:fs";
import type { CommandModule } from "yargs";
import type { ClickUpClient, ClickUpListWriteBody } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";

export function createUpdateListCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "update-list",
    describe: "rename a ClickUp List and set its description",
    builder: (y) =>
      y
        .option("list", {
          type: "string",
          requiresArg: true,
          demandOption: true,
          describe: "ClickUp list ID",
        })
        .option("name", { type: "string", requiresArg: true, describe: "new list name" })
        .option("description", {
          type: "string",
          requiresArg: true,
          describe: "new list description; an empty string clears it",
        })
        .option("description-file", {
          type: "string",
          requiresArg: true,
          describe: "read the new list description from this UTF-8 file",
        }),
    handler: async (argv) => {
      try {
        const listId = argv.list as string;
        const name = argv.name as string | undefined;
        const description = argv.description as string | undefined;
        const descriptionFile = argv.descriptionFile as string | undefined;
        if (listId.trim() === "") throw new Error("--list needs a list ID");
        if (name !== undefined && name.trim() === "") throw new Error("--name needs a non-empty name");
        if (description !== undefined && descriptionFile !== undefined) {
          throw new Error("use --description or --description-file, not both");
        }
        if (name === undefined && description === undefined && descriptionFile === undefined) {
          throw new Error("nothing to update — pass --name, --description or --description-file");
        }
        let content = description;
        if (descriptionFile !== undefined) {
          try {
            content = readFileSync(descriptionFile, "utf8");
          } catch (err) {
            throw new Error(`cannot read --description-file ${descriptionFile}: ${(err as Error).message}`);
          }
        }
        const body: ClickUpListWriteBody = {};
        if (name !== undefined) body.name = name;
        if (content !== undefined) body.content = content;
        const list = await clientFactory().updateList(listId, body);
        console.log(JSON.stringify(list, null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup update-list: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const updateListCommand: CommandModule = createUpdateListCommand();
