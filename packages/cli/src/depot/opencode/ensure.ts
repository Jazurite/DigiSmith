import type { CommandModule } from "yargs";
import { ensureProcess } from "../process-lifecycle.ts";
import { DEFAULT_TRACKING_FILE, DEFAULT_LOG_FILE, fetchChutesApiKey } from "./lib.ts";

export function createEnsureCommand(
  trackingFile: string = DEFAULT_TRACKING_FILE,
  logFile: string = DEFAULT_LOG_FILE
): CommandModule {
  return {
    command: "ensure",
    describe: "start the shared OpenCode server if not already running",
    handler: () => {
      try {
        const { port } = ensureProcess({
          label: "opencode-server",
          trackingFile,
          logFile,
          spawnCommand: () => ({
            command: "opencode",
            args: ["serve", "--port", "0", "--hostname", "127.0.0.1"],
            env: { CHUTES_API_KEY: fetchChutesApiKey() },
          }),
        });
        console.log(`depot opencode: ready on port ${port}`);
      } catch (err) {
        console.error(`depot opencode: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const ensureCommand: CommandModule = createEnsureCommand();
