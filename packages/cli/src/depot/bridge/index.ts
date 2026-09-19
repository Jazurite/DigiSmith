import type { CommandModule } from "yargs";
import { ensureCommand } from "./ensure.ts";
import { stopCommand } from "./stop.ts";

const bridgeCommand: CommandModule = {
  command: "bridge",
  describe: "manage the shared Agentic Bridge proxy",
  builder: (y) => y.command(ensureCommand).command(stopCommand).demandCommand(1, ""),
  handler: () => {},
};

export default bridgeCommand;
