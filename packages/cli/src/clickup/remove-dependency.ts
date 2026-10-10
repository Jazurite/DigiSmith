import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createRelationCommand } from "./relation-write.ts";

export function createRemoveDependencyCommand(clientFactory?: () => ClickUpClient): CommandModule {
  return createRelationCommand({ kind: "dependency", action: "remove" }, clientFactory);
}

export const removeDependencyCommand: CommandModule = createRemoveDependencyCommand();
