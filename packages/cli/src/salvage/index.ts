import { homedir } from "node:os";
import { statSync } from "node:fs";
import { join } from "node:path";
import type { CommandModule } from "yargs";
import { realGit } from "../autonomous/gitx.ts";
import { salvage } from "./salvage.ts";

const command: CommandModule = {
  command: "salvage",
  describe: "before a worktree is removed: WIP commit, bundle to the depot, push rescue/<KEY>; never deletes",
  builder: (y) =>
    y
      .option("ticket", { type: "string", demandOption: true, describe: "ticket key, e.g. DGS-585" })
      .option("worktree", { type: "string", describe: "the worktree path (default: the one worktree on <KEY>__*)" })
      .option("repo", { type: "string", describe: "the main checkout (default: the current directory's repo)" })
      .option("dry-run", { type: "boolean", default: false }),
  handler: (a) => {
    const repo = (a.repo as string | undefined) ?? realGit(process.cwd(), ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim().replace(/\/\.git$/, "");
    const r = salvage(
      { git: realGit, repo, depotDir: join(homedir(), ".digismith-depot"), now: () => new Date(), statSize: (p) => statSync(p).size },
      { ticket: a.ticket as string, worktree: a.worktree as string | undefined, dryRun: a["dry-run"] as boolean },
    );
    for (const s of r.steps) console.log(s);
    if (r.ok) { console.log(r.bundle ? `salvaged: ${r.bundle}` : "salvage: nothing needed"); process.exitCode = 0; }
    else { console.error(r.message); process.exitCode = 1; }
  },
};
export default command;
