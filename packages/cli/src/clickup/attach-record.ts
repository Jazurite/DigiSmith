import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import { decideAttach } from "./attach-decision.ts";
import { readAttached, recordAttached } from "../tokens/attachments-store.ts";

const CLICKUP_KEY = /^DGS-\d+$/;

export interface AttachResult { lines: string[]; failed: boolean }

export async function attachFile(client: ClickUpClient, key: string, file: string): Promise<AttachResult> {
  const name = basename(file);
  const sha256 = createHash("sha256").update(readFileSync(file)).digest("hex");
  const task = (await client.getTaskByRef(key)) as unknown as { id: string; attachments?: { id: string; title: string }[] };
  const d = decideAttach({ name, sha256, recorded: readAttached(key), onTask: task.attachments ?? [] });
  if (d.action === "skip") return { lines: [`skipped ${name}: ${d.reason}`], failed: false };
  const att = (await client.uploadAttachment(task.id, file)) as unknown as { id: string };
  const extra: string[] = [];
  if (d.supersedes) extra.push(`superseded: ${d.supersedes}`);
  if (d.warn) extra.push(`warn: ${d.warn}`);
  try {
    recordAttached(key, { name, sha256, id: att.id, attached_at: new Date().toISOString() });
  } catch {
    return { lines: [...extra, `warn: attached ${name} (${att.id}) but the depot record failed; a rerun adds a copy`], failed: true };
  }
  return { lines: [`attached ${name} (${att.id})`, ...extra], failed: false };
}

export function createAttachRecordCommand(clientFactory: () => ClickUpClient = createClient): CommandModule {
  return {
    command: "attach-record",
    describe: "attach a build-record file to a ClickUp ticket once; a re-run with the same content adds nothing, and nothing is ever deleted",
    builder: (y) =>
      y
        .option("task", { type: "string", requiresArg: true, demandOption: true, describe: "ticket key (DGS-547)" })
        .option("file", { type: "string", requiresArg: true, describe: "local file to attach; the attachment is named by its file name" }),
    handler: async (argv) => {
      process.exitCode = 0;
      try {
        const key = String(argv.task ?? "").trim();
        if (!CLICKUP_KEY.test(key)) { console.log("not a ClickUp key, skipped"); return; }
        const file = String(argv.file ?? "");
        if (!file) { console.log("skipped: no --file given"); return; }
        if (!existsSync(file)) { console.log(`skipped ${file}: not found`); return; }
        const { lines, failed } = await attachFile(clientFactory(), key, file);
        for (const line of lines) (failed && line.includes("depot record failed") ? console.error : console.log)(line);
        if (failed) process.exitCode = 1;
      } catch (err) {
        console.error(`warn: ${(err as Error).message.split("\n")[0]}`);
        process.exitCode = 1;
      }
    },
  };
}

export const attachRecordCommand: CommandModule = createAttachRecordCommand();
