import type { CommandModule } from "yargs";
import { cleanupCommand } from "./cleanup.ts";

const sessionsCommand: CommandModule = {
  command: "sessions",
  describe: "manage session data in the depot: cleanup",
  builder: (y) => y.command(cleanupCommand).demandCommand(1, ""),
  handler: () => {},
};

export default sessionsCommand;
