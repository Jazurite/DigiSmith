import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";

export function createUploadAttachmentCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "upload-attachment",
    describe: "upload a local file as an attachment on a ClickUp task",
    builder: (y) =>
      y
        .option("task", {
          type: "string",
          requiresArg: true,
          demandOption: true,
          describe: "ClickUp task ID",
        })
        .option("file", {
          type: "string",
          requiresArg: true,
          demandOption: true,
          describe: "local file path to upload",
        }),
    handler: async (argv) => {
      try {
        const client = clientFactory();
        const attachment = await client.uploadAttachment(argv.task as string, argv.file as string);
        console.log(JSON.stringify(attachment, null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup upload-attachment: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const uploadAttachmentCommand: CommandModule = createUploadAttachmentCommand();
