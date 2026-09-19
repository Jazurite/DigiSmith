import type { CommandModule } from "yargs";
import { refreshClone } from "./lib.ts";

export const refreshCommand: CommandModule = {
  command: "refresh",
  describe: "fetch + hard-reset the clone to origin/main",
  handler: () => {
    const result = refreshClone();
    if (result.status !== 0) {
      console.error(`depot clone: ${result.stderr.trim() || "git command failed"}`);
      process.exitCode = 1;
      return;
    }
    console.log(`depot clone: refresh — ${result.stdout.trim() || "ok"}`);
  },
};
