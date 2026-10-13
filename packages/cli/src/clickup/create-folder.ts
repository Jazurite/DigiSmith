import type { CommandModule } from "yargs";
import type { ClickUpClient, Space } from "@digismith/clickup-client";
import { createClient, createDigiSmithSpace, DIGISMITH_SPACE_ID } from "./lib.ts";
import { printCall } from "./task-type-write.ts";

const ID = /^\d+$/;

interface FolderReadBack {
  parent_folder?: { id?: string; name?: string } | null;
}

export function createCreateFolderCommand(
  spaceFactory: () => Space = createDigiSmithSpace,
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "create-folder",
    describe:
      "create a new Folder in the DigiSmith ClickUp space; with --parent-folder, create it then move it inside that folder (a dry run unless --yes)",
    builder: (y) =>
      y
        .option("name", {
          type: "string",
          requiresArg: true,
          demandOption: true,
          describe: "folder name",
        })
        .option("parent-folder", {
          type: "string",
          requiresArg: true,
          describe: "id of the folder to put the new folder into (e.g. Clans); creates, then moves",
        })
        .option("yes", { type: "boolean", default: false, describe: "with --parent-folder: send the calls (without it, only print them)" }),
    handler: async (argv) => {
      const name = argv.name as string;
      const parent = argv.parentFolder === undefined ? undefined : String(argv.parentFolder);
      let createdId: string | undefined;
      try {
        if (parent === undefined) {
          if (argv.yes) throw new Error("--yes needs --parent-folder");
          const folder = await spaceFactory().createFolder(name);
          console.log(JSON.stringify(folder, null, 2));
          process.exitCode = 0;
          return;
        }
        if (!ID.test(parent)) throw new Error("--parent-folder must be a folder id (digits only)");
        if (!argv.yes) {
          printCall("POST", `/space/${DIGISMITH_SPACE_ID}/folder`, { name });
          printCall("PUT", "/folder/<new folder id>/position", { parent_folder_id: parent });
          console.log("nothing sent; add --yes to send");
          process.exitCode = 0;
          return;
        }
        const client = clientFactory();
        const folder = await client.createFolder(DIGISMITH_SPACE_ID, name);
        createdId = folder.id;
        await client.moveFolder(folder.id, { parentFolderId: parent });
        createdId = undefined;
        let note: string;
        try {
          const back = (await client.getFolder(folder.id)) as unknown as FolderReadBack;
          const p = back.parent_folder;
          note = p?.id ? `parent_folder: ${p.id}${p.name ? ` (${p.name})` : ""}` : "check it with dg clickup get-lists (parent_folder)";
        } catch (err) {
          note = `read-back failed: ${(err as Error).message}; check it with dg clickup get-lists (parent_folder)`;
        }
        console.log(`created folder ${folder.id} "${folder.name}" inside folder ${parent}; ${note}`);
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup create-folder: ${(err as Error).message}`);
        if (createdId !== undefined) {
          console.error(
            `folder ${createdId} "${name}" was created at the top level but not moved; nothing was deleted. Finish with:\n` +
              `dg clickup move-folder --folder ${createdId} --parent ${parent} --yes`
          );
        }
        process.exitCode = 1;
      }
    },
  };
}

export const createFolderCommand: CommandModule = createCreateFolderCommand();
