import type { CommandModule } from "yargs";
import { ensureCommand } from "./ensure.ts";
import { stopCommand } from "./stop.ts";

const opencodeCommand: CommandModule = {
  command: "opencode",
  describe: "manage the shared OpenCode server",
  builder: (y) => y.command(ensureCommand).command(stopCommand).demandCommand(1, ""),
  handler: () => {},
};

export default opencodeCommand;
