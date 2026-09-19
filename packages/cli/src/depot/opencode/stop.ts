import type { CommandModule } from "yargs";
import { stopProcess } from "../process-lifecycle.ts";
import { DEFAULT_TRACKING_FILE } from "./lib.ts";

export function createStopCommand(trackingFile: string = DEFAULT_TRACKING_FILE): CommandModule {
  return {
    command: "stop",
    describe: "stop it",
    handler: () => {
      const result = stopProcess({ label: "opencode-server", trackingFile });
      if (result.error) {
        console.error(`depot opencode: failed to stop — ${result.error}`);
        process.exitCode = 1;
      } else if (result.stopped) {
        console.log("depot opencode: stopped");
      } else {
        console.log("depot opencode: nothing to stop");
      }
    },
  };
}

export const stopCommand: CommandModule = createStopCommand();
