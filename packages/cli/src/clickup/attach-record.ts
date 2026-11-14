import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import { decideAttach } from "./attach-decision.ts";
import { renderLedgerSummary } from "../tokens/ledger-summary.ts";
import { runTable } from "../reviewer/table.ts";
import { readAttached, recordAttached } from "../tokens/attachments-store.ts";

import { isTicketKey } from "./spaces.ts";

export interface AttachResult { lines: string[]; errorLines: string[]; failed: boolean }

export async function attachFile(client: ClickUpClient, key: string, file: string): Promise<AttachResult> {
  const name = basename(file);
  const sha256 = createHash("sha256").update(readFileSync(file)).digest("hex");
  const task = (await client.getTaskByRef(key)) as unknown as { id: string; attachments?: { id: string; title: string }[] };
  const d = decideAttach({ name, sha256, recorded: readAttached(key), onTask: task.attachments ?? [] });
  if (d.action === "skip") return { lines: [`skipped ${name}: ${d.reason}`], errorLines: [], failed: false };
  const att = (await client.uploadAttachment(task.id, file)) as unknown as { id: string };
  const extra: string[] = [];
  if (d.supersedes) extra.push(`superseded: ${d.supersedes}`);
  if (d.warn) extra.push(`warn: ${d.warn}`);
  try {
    recordAttached(key, { name, sha256, id: att.id, attached_at: new Date().toISOString() });
  } catch {
    return { lines: extra, errorLines: [`warn: attached ${name} (${att.id}) but the depot record failed; a rerun adds a copy`], failed: true };
  }
  return { lines: [`attached ${name} (${att.id})`, ...extra], errorLines: [], failed: false };
}

async function attachAndPrint(client: ClickUpClient, key: string, file: string): Promise<void> {
  const { lines, errorLines, failed } = await attachFile(client, key, file);
  for (const line of lines) console.log(line);
  for (const line of errorLines) console.error(line);
  if (failed) process.exitCode = 1;
}

export function createAttachRecordCommand(clientFactory: () => ClickUpClient = createClient): CommandModule {
  return {
    command: "attach-record",
    describe: "attach a build-record file to a ClickUp ticket once; a re-run with the same content adds nothing, and nothing is ever deleted",
    builder: (y) =>
      y
        .option("task", { type: "string", requiresArg: true, demandOption: true, describe: "ticket key (DGS-547)" })
        .option("file", { type: "string", requiresArg: true, describe: "local file to attach; the attachment is named by its file name" })
        .option("kind", { type: "string", choices: ["reviews", "ledger-summary"], describe: "render a record from the SDD workspace and attach it (reviews.md or ledger-summary.md)" })
        .option("workspace", { type: "string", requiresArg: true, describe: "SDD workspace folder, used with --kind" }),
    handler: async (argv) => {
      process.exitCode = 0;
      try {
        const key = String(argv.task ?? "").trim();
        if (!isTicketKey(key)) { console.log("not a ClickUp key, skipped"); return; }
        const kind = argv.kind as "reviews" | "ledger-summary" | undefined;
        if (kind) {
          if (argv.file) throw new Error("--file and --kind cannot be used together");
          const ws = String(argv.workspace ?? "");
          const name = kind === "reviews" ? "reviews.md" : "ledger-summary.md";
          const ledger = join(ws, "progress.md");
          if (kind === "ledger-summary" && (!ws || !existsSync(ledger))) { console.log(`skipped ${name}: no ledger`); return; }
          if (!ws) { console.log(`skipped ${name}: no --workspace given`); return; }
          const tmp = mkdtempSync(join(tmpdir(), "attach-record-"));
          try {
            const out = join(tmp, name);
            if (kind === "ledger-summary") writeFileSync(out, renderLedgerSummary(readFileSync(ledger, "utf8")));
            else {
              const r = runTable({ workspace: ws, out });
              if (!r.written) { console.log(`skipped ${name}: ${r.message}`); return; }
            }
            await attachAndPrint(clientFactory(), key, out);
          } finally { rmSync(tmp, { recursive: true, force: true }); }
          return;
        }
        const file = String(argv.file ?? "");
        if (!file) { console.log("skipped: no --file given"); return; }
        if (!existsSync(file)) { console.log(`skipped ${file}: not found`); return; }
        await attachAndPrint(clientFactory(), key, file);
      } catch (err) {
        console.error(`warn: ${(err as Error).message.split("\n")[0]}`);
        process.exitCode = 1;
      }
    },
  };
}

export const attachRecordCommand: CommandModule = createAttachRecordCommand();
