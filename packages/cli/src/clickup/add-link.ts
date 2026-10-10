import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createRelationCommand } from "./relation-write.ts";

export function createAddLinkCommand(clientFactory?: () => ClickUpClient): CommandModule {
  return createRelationCommand({ kind: "link", action: "add" }, clientFactory);
}

export const addLinkCommand: CommandModule = createAddLinkCommand();
