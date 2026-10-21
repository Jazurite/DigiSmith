import type { CommandModule } from "yargs";
import { buildPack } from "./pack.ts";
import { runTable } from "./table.ts";
import { REVIEWER_TYPES, type ReviewerType } from "./types.ts";

interface TableArgs { workspace: string; ledger?: string; out?: string; json?: boolean }
interface PackArgs {
  type: ReviewerType; task?: number; round: number; ticket?: string; workspace: string; base: string; head: string;
  diff: string; plan?: string; brief?: string; report?: string; constraints?: string;
  "ticket-file"?: string; spec?: string; ledger?: string; "findings-in"?: string; "fix-base"?: string;
  standards?: string[];
}

function fail(e: unknown): void {
  console.error(`error: ${(e as Error).message}`);
  process.exitCode = 1;
}

const tableCommand: CommandModule<object, TableArgs> = {
  command: "table",
  describe: "build findings.md from the reviews and verdict lines of an SDD workspace",
  builder: (y) =>
    y
      .option("workspace", { type: "string", demandOption: true, describe: "the SDD workspace folder (skills/subagent-driven-development/scripts/sdd-workspace PLAN prints it)" })
      .option("ledger", { type: "string", describe: "the ledger file (default: <workspace>/progress.md)" })
      .option("out", { type: "string", describe: "the findings.md file to write (required without --json)" })
      .option("json", { type: "boolean", default: false, describe: "print the findings model as JSON (schema 1) to stdout, or write it to --out" }),
  handler: (args) => {
    try {
      const r = runTable({ workspace: args.workspace, ledger: args.ledger, out: args.out, json: args.json });
      console.log(args.json && !args.out ? r.json : r.message);
    } catch (e) {
      fail(e);
    }
  },
};

const packCommand: CommandModule<object, PackArgs> = {
  command: "pack",
  describe: "build the input folder (pack.md and files) of one review and print its model",
  builder: (y) =>
    y
      .option("type", { type: "string", choices: [...REVIEWER_TYPES], demandOption: true })
      .option("task", { type: "number", describe: "the task number (type task)" })
      .option("round", { type: "number", default: 1, describe: "1 = first review, 2 or more = re-review" })
      .option("ticket", { type: "string", describe: "the ticket key, such as DGS-566, or none when the work has no tracker key" })
      .option("workspace", { type: "string", demandOption: true })
      .option("base", { type: "string", demandOption: true })
      .option("head", { type: "string", demandOption: true })
      .option("diff", { type: "string", demandOption: true, describe: "the file review-package wrote" })
      .option("plan", { type: "string" })
      .option("brief", { type: "string" })
      .option("report", { type: "string" })
      .option("constraints", { type: "string" })
      .option("ticket-file", { type: "string" })
      .option("spec", { type: "string" })
      .option("ledger", { type: "string" })
      .option("findings-in", { type: "string" })
      .option("fix-base", { type: "string" })
      .option("standards", { type: "string", array: true, default: [] }),
  handler: (args) => {
    try {
      const id = args.type === "ticket" ? "final" : String(args.task ?? "");
      const { dir, model } = buildPack({
        type: args.type, id, round: args.round, ticket: args.ticket ?? "", workspace: args.workspace, base: args.base, head: args.head,
        diff: args.diff, plan: args.plan ?? "", brief: args.brief, report: args.report, constraints: args.constraints,
        ticketFile: args["ticket-file"], spec: args.spec, ledger: args.ledger,
        findingsIn: args["findings-in"], fixBase: args["fix-base"], standards: args.standards ?? [],
      });
      console.log(`pack: ${dir}`);
      console.log(`model: ${model}`);
    } catch (e) {
      fail(e);
    }
  },
};

const reviewerCommand: CommandModule = {
  command: "reviewer",
  describe: "the Reviewer role: review packs and the findings table",
  builder: (y) => y.command(tableCommand).command(packCommand).demandCommand(1, ""),
  handler: () => {},
};

export default reviewerCommand;
