import type { CommandModule } from "yargs";
import { statusCommand } from "./status.ts";
import { connectCommand } from "./connect.ts";

const vpsCommand: CommandModule = {
  command: "vps",
  describe: "reconnect to the Hetzner VPS's persistent herdr-managed OpenCode session",
  builder: (y) => y.command(statusCommand).command(connectCommand).demandCommand(1, ""),
  handler: () => {},
};

export default vpsCommand;
