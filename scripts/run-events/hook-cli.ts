// scripts/run-events/hook-cli.ts
// Nightwatch hook entry: node hook-cli.ts <started|blocked|tool|turn_end|ended>. Reads the hook payload from stdin.
// Always exits 0 and prints nothing. The shell in hooks.json has already tested DIGISMITH_RUN_ID.
import * as fs from "node:fs";
import { runHook } from "../../packages/cli/src/run/hook.ts";

let stdin = "";
try {
  stdin = fs.readFileSync(0, "utf8");
} catch {
  /* no stdin */
}
runHook(process.argv[2] ?? "", stdin, process.env);
process.exitCode = 0;
