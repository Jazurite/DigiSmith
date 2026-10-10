import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createRelationCommand } from "./relation-write.ts";

export function createRemoveLinkCommand(clientFactory?: () => ClickUpClient): CommandModule {
  return createRelationCommand({ kind: "link", action: "remove" }, clientFactory);
}

export const removeLinkCommand: CommandModule = createRemoveLinkCommand();
