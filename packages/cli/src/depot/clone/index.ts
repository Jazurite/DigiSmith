import type { CommandModule } from "yargs";
import { attachHelp } from "../../lib/brand-help.ts";
import { ensureCommand } from "./ensure.ts";
import { refreshCommand } from "./refresh.ts";

const cloneCommand: CommandModule = {
  command: "clone",
  describe: "manage the shared packages/ clone",
  builder: (y) =>
    attachHelp(y.command(ensureCommand).command(refreshCommand).demandCommand(1, ""), { root: false }),
  handler: () => {},
};

export default cloneCommand;
