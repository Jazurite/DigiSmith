import { readFileSync } from "node:fs";
import type { CommandModule } from "yargs";
import { folderDescriptionDelta } from "@digismith/clickup-client";
import type { ClickUpClient, FrontdoorClient } from "@digismith/clickup-client";
import { createClient, createFrontdoorClient } from "./lib.ts";
import { printCall } from "./task-type-write.ts";

const ID = /^\d+$/;

/** The description the folder should hold, or undefined when none was asked for. */
function descriptionOf(argv: Record<string, unknown>, read: (path: string) => string): string | undefined {
  for (const [key, flag] of [["description", "--description"], ["descriptionFile", "--description-file"]] as const) {
    if (Array.isArray(argv[key])) throw new Error(`${flag} was given more than once`);
  }
  if (argv.description !== undefined && argv.descriptionFile !== undefined) {
    throw new Error("--description and --description-file cannot be used together");
  }
  if (argv.description !== undefined) {
    const text = String(argv.description);
    if (text.trim() === "") throw new Error("--description needs a non-empty text");
    return text.replace(/\r\n/g, "\n");
  }
  if (argv.descriptionFile !== undefined) {
    const text = read(String(argv.descriptionFile));
    if (text.trim() === "") throw new Error("--description-file is empty");
    return text.replace(/\r\n/g, "\n");
  }
  return undefined;
}

export function createUpdateFolderCommand(
  clientFactory: () => ClickUpClient = createClient,
  frontdoorFactory: () => FrontdoorClient = createFrontdoorClient,
  readFile: (path: string) => string = (p) => readFileSync(p, "utf8")
): CommandModule {
  return {
    command: "update-folder",
    describe:
      "rename a ClickUp folder and/or set its description (Frontdoor, plain text); a dry run unless --yes. With both, the rename goes first. A description needs the Frontdoor session (dg clickup frontdoor import-auth)",
    builder: (y) =>
      y
        .option("folder", { type: "string", requiresArg: true, demandOption: true, describe: "id of the folder to update" })
        .option("name", { type: "string", requiresArg: true, describe: "new folder name (optional when a description is given)" })
        .option("description", { type: "string", requiresArg: true, describe: "new folder description, plain text (replaces the old one); a text starting with - needs --description=<text> or --description-file" })
        .option("description-file", { type: "string", requiresArg: true, describe: "read the description from this UTF-8 file; not with --description" })
        .option("yes", { type: "boolean", default: false, describe: "send the call (without it, only print it)" }),
    handler: async (argv) => {
      try {
        if (Array.isArray(argv.name)) throw new Error("--name was given more than once");
        const folder = String(argv.folder);
        const name = argv.name === undefined ? undefined : String(argv.name).trim();
        if (!ID.test(folder)) throw new Error("--folder must be a folder id (digits only)");
        if (name === "") throw new Error("--name needs a non-empty name");
        const description = descriptionOf(argv, readFile);
        if (name === undefined && description === undefined) {
          throw new Error("give --name, --description or --description-file");
        }
        if (!argv.yes) {
          if (name !== undefined) printCall("PUT", `/folder/${folder}`, { name });
          if (description !== undefined) {
            printCall("PUT", `/hierarchy/v1/category/${folder}`, { content: folderDescriptionDelta(description) });
          }
          console.log("nothing sent; add --yes to send");
        } else {
          if (name !== undefined) {
            const client = clientFactory();
            await client.updateFolder(folder, name);
            const back = await client.getFolder(folder);
            if (typeof back.name !== "string") throw new Error(`no name in the response for folder ${folder}`);
            if (back.name !== name) {
              throw new Error(`sent "${name}" but read back "${back.name}" for folder ${folder}`);
            }
            console.log(`renamed folder ${folder} to "${back.name}"; check it with dg clickup get-lists`);
          }
          if (description !== undefined) {
            const fd = frontdoorFactory();
            await fd.setFolderDescription(folder, description);
            const back = await fd.getFolderDescription(folder);
            // The editor keeps one final newline, so a text without one reads back with it.
            const want = description.endsWith("\n") ? description : `${description}\n`;
            if (back !== want) {
              throw new Error(`sent a description of ${want.length} characters but read back ${back.length} for folder ${folder}`);
            }
            console.log(`set the description of folder ${folder} (${back.length} characters); check it in the web app`);
          }
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup update-folder: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const updateFolderCommand: CommandModule = createUpdateFolderCommand();
