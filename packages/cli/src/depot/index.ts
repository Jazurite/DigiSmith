import type { CommandModule } from "yargs";
import cloneCommand from "./clone/index.ts";
import opencodeCommand from "./opencode/index.ts";
import bridgeCommand from "./bridge/index.ts";

const depotCommand: CommandModule = {
  command: "depot",
  describe: "manage machine-wide shared resources: clone, opencode, bridge",
  builder: (y) => y.command(cloneCommand).command(opencodeCommand).command(bridgeCommand).demandCommand(1, ""),
  handler: () => {},
};

export default depotCommand;
