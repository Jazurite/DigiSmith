import type { CommandModule } from "yargs";
import { ensureCommand } from "./ensure.ts";
import { refreshCommand } from "./refresh.ts";

const cloneCommand: CommandModule = {
  command: "clone",
  describe: "manage the shared packages/ clone",
  builder: (y) => y.command(ensureCommand).command(refreshCommand).demandCommand(1, ""),
  handler: () => {},
};

export default cloneCommand;
