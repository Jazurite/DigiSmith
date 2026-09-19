import type { CommandModule } from "yargs";
import { attachHelp } from "../lib/brand-help.ts";
import { statusCommand } from "./status.ts";
import { connectCommand } from "./connect.ts";

const vpsCommand: CommandModule = {
  command: "vps",
  describe: "reconnect to the Hetzner VPS's persistent claude session",
  builder: (y) =>
    attachHelp(y.command(statusCommand).command(connectCommand).demandCommand(1, ""), { root: false }),
  handler: () => {},
};

export function run(argv: string[]): void {
  console.error("usage: digismith vps <status|connect>");
  process.exitCode = 1;
}

export default vpsCommand;
