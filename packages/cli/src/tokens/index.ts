import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CommandModule } from "yargs";
import { countTicket, renderTable, resolveSnapshotPath } from "./count.ts";
import { createDepotRegistry } from "./registry.ts";

interface Args {
  ticket: string;
  json: boolean;
  write: boolean;
}

const tokensCommand: CommandModule<object, Args> = {
  command: "tokens <ticket>",
  describe: "count the tokens of a ticket from Claude Code transcripts (counts only, no prices)",
  builder: (y) =>
    y
      .positional("ticket", { type: "string", demandOption: true, describe: "ticket key, e.g. DGS-214" })
      .option("json", { type: "boolean", default: false, describe: "print the snapshot as JSON" })
      .option("write", { type: "boolean", default: false, describe: "save tokens.json (board folder in DigiSmith's repo, depot elsewhere)" }),
  handler: (args) => {
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
