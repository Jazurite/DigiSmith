import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CommandModule } from "yargs";
import { countTicket, renderTable, resolveSnapshotPath } from "./count.ts";
import { claudeProjectsDir } from "./attribution.ts";
import { createDepotRegistry } from "./registry.ts";
import { runTokensPass } from "./runs.ts";

interface Args {
  ticket: string;
  json: boolean;
  write: boolean;
  run?: string;
  "dry-run": boolean;
}

const tokensCommand: CommandModule<object, Args> = {
  command: "tokens <ticket>",
  describe: 'count the tokens of a ticket, or "tokens runs": write the Oculus run snapshots',
  builder: (y) =>
    y
      .positional("ticket", { type: "string", demandOption: true, describe: "ticket key, e.g. DGS-214" })
      .option("json", { type: "boolean", default: false, describe: "print the snapshot as JSON" })
      .option("write", { type: "boolean", default: false, describe: "save tokens.json (board folder in DigiSmith's repo, depot elsewhere)" })
      .option("run", { type: "string", describe: "with the word runs: one run only" })
      .option("dry-run", { type: "boolean", default: false, describe: "with the word runs: print, write nothing" }),
  handler: (args) => {
    if (args.ticket === "runs") {
      // "runs" is not a ticket key (keys carry a number): it is the 5-min Oculus job (DGS-590).
      const r = runTokensPass({ env: process.env, now: new Date(), projectsDir: claudeProjectsDir(), run: args.run, dryRun: args["dry-run"] });
      console.log(`tokens runs: updated ${r.updated}, skipped ${r.skipped}, failed ${r.failed}, ${args.run === undefined ? "burn" : "run burn"} ${r.burn === null ? "-" : `${r.burn.tokens} tokens/h`}, seats ${r.seats}`);
      if (r.failed > 0 && r.updated === 0 && r.skipped === 0) process.exitCode = 1;
      return;
    }
    const snapshot = countTicket({ ticket: args.ticket, registry: createDepotRegistry() });
    console.log(args.json ? JSON.stringify(snapshot, null, 2) : renderTable(snapshot));
    if (args.write) {
      const out = resolveSnapshotPath(process.cwd(), args.ticket);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);
      console.error(`tokens: wrote ${out}`);
    }
  },
};

export default tokensCommand;
