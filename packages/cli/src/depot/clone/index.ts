import type { CommandModule } from "yargs";
import { attachHelp } from "../../lib/brand-help.ts";
import { ensureCommand } from "./ensure.ts";
import { refreshCommand } from "./refresh.ts";
import { ensureClone, refreshClone } from "./lib.ts";

const cloneCommand: CommandModule = {
  command: "clone",
  describe: "manage the shared packages/ clone",
  builder: (y) =>
    attachHelp(y.command(ensureCommand).command(refreshCommand).demandCommand(1, ""), { root: false }),
  handler: () => {},
};

export default cloneCommand;

// Temporary compatibility export for depot/index.ts pending Task 4 rewrite
export function run(argv: string[]): void {
  const verb = argv[0];
  if (verb !== "ensure" && verb !== "refresh") {
    console.error("usage: digismith depot clone <ensure|refresh>");
    process.exitCode = 1;
    return;
  }
  const result = verb === "ensure" ? ensureClone() : refreshClone();
  if (result.status !== 0) {
    console.error(`depot clone: ${result.stderr.trim() || "git command failed"}`);
    process.exitCode = 1;
    return;
  }
  console.log(`depot clone: ${verb} — ${result.stdout.trim() || "ok"}`);
}
