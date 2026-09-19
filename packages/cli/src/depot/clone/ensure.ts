import type { CommandModule } from "yargs";
import { ensureClone } from "./lib.ts";

export const ensureCommand: CommandModule = {
  command: "ensure",
  describe: "clone ~/.digismith-depot/repo if missing, else no-op",
  handler: () => {
    const result = ensureClone();
    if (result.status !== 0) {
      console.error(`depot clone: ${result.stderr.trim() || "git command failed"}`);
      process.exitCode = 1;
      return;
    }
    console.log(`depot clone: ensure — ${result.stdout.trim() || "ok"}`);
  },
};
