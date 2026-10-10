import type { CommandModule } from "yargs";
import { importAuthCommand } from "./import-auth.ts";
import { dumpCommand } from "./dump.ts";

const frontdoorCommand: CommandModule = {
  command: "frontdoor",
  describe: "bring a ClickUp Frontdoor session in from a Proxyman capture, and read the capture safely",
  builder: (y) => y.command(importAuthCommand).command(dumpCommand).demandCommand(1, ""),
  handler: () => {},
};

export default frontdoorCommand;
