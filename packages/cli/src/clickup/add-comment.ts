import { readFileSync } from "node:fs";
import type { CommandModule } from "yargs";
import { commentBody, type ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import { REF, KEY } from "./refs.ts";
import { printCall } from "./task-type-write.ts";

export interface CommentArgv {
  task?: string;
  text?: string;
  markdownFile?: string;
  yes?: boolean;
}

export interface CommentRequest {
  task: string;
  text: string;
}

/** Checks the flags and reads the file, with no network call. Throws on a bad ref, a missing or repeated source, or an empty text. */
export function parseCommentArgv(argv: CommentArgv): CommentRequest {
  const task = argv.task === undefined ? "" : String(argv.task).trim();
  if (!REF.test(task)) throw new Error(`--task must be a task id or a key like DGS-12, got "${task}"`);
  if (Array.isArray(argv.text) || Array.isArray(argv.markdownFile)) throw new Error("give --text or --markdown-file once, not several times");
  if ((argv.text === undefined) === (argv.markdownFile === undefined)) throw new Error("give exactly one of --text or --markdown-file");
  let text: string;
  if (argv.markdownFile !== undefined) {
    try {
      text = readFileSync(String(argv.markdownFile), "utf8");
    } catch (err) {
      throw new Error(`cannot read --markdown-file ${argv.markdownFile}: ${(err as Error).message}`);
    }
  } else {
    text = String(argv.text);
  }
  text = text.replace(/^\uFEFF/, "");
  if (text.trim() === "") throw new Error("the comment text is empty");
  return { task, text };
}

const label = (t: { id: string; custom_id?: string | null; name?: string }) => `${t.custom_id ?? t.id} (${t.id}) "${t.name ?? ""}"`;

export function createAddCommentCommand(clientFactory: () => ClickUpClient = createClient): CommandModule {
  return {
    command: "add-comment",
    describe:
      "post a comment on a task (public API); a dry run unless --yes; --markdown-file reads the file as plain text, ClickUp does not convert markdown",
    builder: (y) =>
      y
        .option("task", { type: "string", requiresArg: true, demandOption: true, describe: "task id or key (DGS-12)" })
        .option("text", { type: "string", requiresArg: true, describe: "the comment text" })
        .option("markdown-file", { type: "string", requiresArg: true, describe: "a file whose text is the comment (sent as plain text, not converted)" })
        .option("yes", { type: "boolean", default: false, describe: "post the comment (without it, only print the call)" }),
    handler: async (argv) => {
      try {
        const req = parseCommentArgv(argv as unknown as CommentArgv);
        const body = commentBody(req.text);
        const warn = "a second --yes posts a second comment (no duplicate check)";
        if (!argv.yes && !KEY.test(req.task)) {
          // Plain id and no --yes: a dry run with no network and no credentials.
          printCall("POST", `/task/${req.task}/comment`, body);
          console.log(warn);
          console.log("nothing sent; add --yes to send");
          process.exitCode = 0;
          return;
        }
        const client = clientFactory();
        const t = await client.getTaskByRef(req.task);
        if (!argv.yes) {
          printCall("POST", `/task/${t.id}/comment`, body);
          console.log("read 1 task (read-only call) to resolve; no write made");
          console.log(`comment on ${label(t)}; ${warn}`);
          console.log("nothing sent; add --yes to send");
        } else {
          const created = await client.addTaskComment(t.id, req.text);
          let rows;
          try {
            rows = await client.getTaskComments(t.id);
          } catch (err) {
            throw new Error(`sent (comment ${created.id}), but the read-back failed: ${(err as Error).message}; do not send again, check it in ClickUp`);
          }
          if (!rows.some((r) => String(r.id) === String(created.id))) {
            throw new Error(`sent (comment ${created.id}), but read-back of ${t.id} does not show it; check it in ClickUp`);
          }
          console.log(`added comment ${created.id} on ${label(t)}; read back OK`);
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup add-comment: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const addCommentCommand: CommandModule = createAddCommentCommand();
