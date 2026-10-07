import type { CommandModule } from "yargs";
import { importOrdersCommand } from "./import-orders.ts";

const shopeeCommand: CommandModule = {
  command: "shopee",
  describe: "read your Shopee VN purchases from pasted Proxyman text",
  builder: (y) => y.command(importOrdersCommand).demandCommand(1, ""),
  handler: () => {},
};

export default shopeeCommand;
