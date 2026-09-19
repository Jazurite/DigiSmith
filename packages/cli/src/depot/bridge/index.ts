import type { CommandModule } from "yargs";
import { attachHelp } from "../../lib/brand-help.ts";
import { ensureCommand } from "./ensure.ts";
import { stopCommand } from "./stop.ts";

const bridgeCommand: CommandModule = {
  command: "bridge",
  describe: "manage the shared Agentic Bridge proxy",
  builder: (y) =>
    attachHelp(y.command(ensureCommand).command(stopCommand).demandCommand(1, ""), { root: false }),
  handler: () => {},
};

export default bridgeCommand;
