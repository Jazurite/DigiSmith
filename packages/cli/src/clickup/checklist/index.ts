import type { CommandModule } from "yargs";
import { checklistSyncCommand } from "./sync.ts";

const checklistCommand: CommandModule = {
  command: "checklist",
  describe: "keep a task's Plan checklist matched to its plan and build ledger",
  builder: (y) => y.command(checklistSyncCommand).demandCommand(1, ""),
  handler: () => {},
};

export default checklistCommand;
