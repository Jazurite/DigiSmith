import type { CommandModule } from "yargs";
import * as path from "node:path";
import { ensureProcess } from "../process-lifecycle.ts";
import { DEFAULT_TRACKING_FILE, DEFAULT_LOG_FILE, resolveDigismithRepo } from "./lib.ts";

export function createEnsureCommand(
  trackingFile: string = DEFAULT_TRACKING_FILE,
  logFile: string = DEFAULT_LOG_FILE
): CommandModule {
  return {
    command: "ensure",
    describe: "start the Agentic Bridge proxy if not already running",
    builder: (y) =>
      y.option("repo", {
        type: "string",
        describe: "DigiSmith checkout to run the bridge from (defaults to the current checkout)",
      }),
    handler: (argv) => {
      let repo: string;
      try {
        repo = resolveDigismithRepo(argv.repo as string | undefined);
      } catch (err) {
        console.error(`depot bridge: ${(err as Error).message}`);
        process.exitCode = 1;
        return;
      }
      try {
        const { port } = ensureProcess({
          label: "agentic-bridge",
          trackingFile,
          logFile,
          spawnCommand: () => ({
            command: "node",
            args: [
              "--experimental-strip-types",
              path.join(repo, "scripts", "agentic-bridge", "server.ts"),
              "--port",
              "0",
            ],
          }),
        });
        console.log(`depot bridge: ready on port ${port}`);
      } catch (err) {
        console.error(`depot bridge: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const ensureCommand: CommandModule = createEnsureCommand();
