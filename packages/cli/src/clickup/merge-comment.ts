import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import { postComment, PostedCommentError } from "./add-comment.ts";
import { renderMergeComment, type CommitLine } from "./merge-comment-render.ts";
import { readPosted, recordPosted } from "../tokens/comments-store.ts";
import { readAttached } from "../tokens/attachments-store.ts";
import { commentBody } from "@digismith/clickup-client";
import { printCall } from "./task-type-write.ts";

const CLICKUP_KEY = /^DGS-\d+$/;
const SHA = /^[0-9a-f]{7,40}$/;

function git(repo: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function gatherGit(repo: string, baseIn: string, headIn: string) {
  const base = baseIn.trim().toLowerCase();
  const head = headIn.trim().toLowerCase();
  for (const [raw, s] of [[baseIn, base], [headIn, head]]) if (!SHA.test(s)) throw new Error(`"${raw}" is not a commit sha (7 to 40 hex characters)`);
  const fullBase = git(repo, ["rev-parse", "--verify", `${base}^{commit}`]);
  const fullHead = git(repo, ["rev-parse", "--verify", `${head}^{commit}`]);
  const log = git(repo, ["log", "--no-merges", "--reverse", "--format=%h%x09%s", `${fullBase}..${fullHead}`]);
  const commits: CommitLine[] = log === "" ? [] : log.split("\n").map((l) => {
    const [sha, ...rest] = l.split("\t");
    return { sha, subject: rest.join("\t") };
  });
  let version: string | undefined;
  try {
    const v = (JSON.parse(git(repo, ["show", "HEAD:.claude-plugin/plugin.json"])) as { version?: unknown }).version;
    if (typeof v === "string" && v !== "") version = v;
  } catch {
    version = undefined;
  }
  return { base: fullBase, head: fullHead, commits, version };
}

export function createMergeCommentCommand(clientFactory: () => ClickUpClient = createClient, repo: () => string = () => process.cwd()): CommandModule {
  return {
    command: "merge-comment",
    describe: "post the one progress comment for a merge on a ClickUp ticket; a dry run unless --yes; skips a head already posted; never blocks (a failure prints a warn: line); the plugin version is read at HEAD of the checkout, not at --head, after the post-finish hooks",
    builder: (y) =>
      y
        .option("task", { type: "string", requiresArg: true, demandOption: true, describe: "ticket key (DGS-178)" })
        .option("base", { type: "string", requiresArg: true, demandOption: true, describe: "branch tip before the merge (pin base)" })
        .option("head", { type: "string", requiresArg: true, demandOption: true, describe: "the merge commit (pin head)" })
        .option("tests", { type: "string", requiresArg: true, describe: "one line: the test result" })
        .option("decisions", { type: "string", requiresArg: true, describe: "up to 3 one-line spec decisions, one per line" })
        .option("next", { type: "string", requiresArg: true, describe: "one line: what is next" })
        .option("split-off", { type: "string", requiresArg: true, describe: "one line: tickets split off" })
        .option("part", { type: "string", requiresArg: true, describe: "label for a part-done comment, e.g. 'Part 2 of 3'" })
        .option("board-folder", { type: "string", requiresArg: true, describe: "the ticket's board folder, to find report.html" })
        .option("yes", { type: "boolean", default: false, describe: "post the comment (without it, only print it)" }),
    handler: async (argv) => {
      process.exitCode = 0;
      let gitHead = "";
      try {
        const key = String(argv.task ?? "").trim();
        if (!CLICKUP_KEY.test(key)) { console.log("not a ClickUp key, skipped"); return; }
        const g = gatherGit(repo(), String(argv.base ?? ""), String(argv.head ?? ""));
        gitHead = g.head;
        const done = readPosted(key).find((r) => r.head === g.head);
        if (done) { console.log(`skipped: already posted for ${g.head.slice(0, 7)} (comment ${done.id})`); return; }
        const folder = argv.boardFolder ? String(argv.boardFolder) : "";
        const reportAttached = folder !== "" && existsSync(join(folder, "report.html")) && readAttached(key).some((r) => r.name === "report.html");
        const text = renderMergeComment({
          key,
          now: new Date(),
          base: g.base,
          head: g.head,
          version: g.version,
          commits: g.commits,
          tests: argv.tests as string | undefined,
          decisions: argv.decisions as string | undefined,
          next: argv.next as string | undefined,
          splitOff: argv.splitOff as string | undefined,
          part: argv.part as string | undefined,
          reportAttached,
        });
        if (!argv.yes) {
          printCall("POST", `/task/${key}/comment`, commentBody(text));
          console.log(text);
          console.log("nothing sent; add --yes to send");
          return;
        }
        const client = clientFactory();
        const t = await client.getTaskByRef(key);
        const created = await postComment(client, t.id, text);
        console.log(`added comment ${created.id} on ${key}; read back OK`);
        try {
          recordPosted(key, { head: g.head, id: String(created.id), posted_at: new Date().toISOString() });
        } catch {
          console.error(`warn: merge-comment: posted comment ${created.id} but the depot record failed; a rerun posts a copy`);
          process.exitCode = 1;
        }
      } catch (err) {
        if (err instanceof PostedCommentError) {
          // The POST went through; record the head so a rerun does not post a copy.
          try {
            recordPosted(String(argv.task ?? "").trim(), { head: gitHead, id: String(err.commentId), posted_at: new Date().toISOString() });
          } catch {
            // a record failure must not hide the warn: line
          }
        }
        console.error(`warn: merge-comment: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const mergeCommentCommand: CommandModule = createMergeCommentCommand();
