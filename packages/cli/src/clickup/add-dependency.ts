import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createRelationCommand } from "./relation-write.ts";

export function createAddDependencyCommand(clientFactory?: () => ClickUpClient): CommandModule {
  return createRelationCommand({ kind: "dependency", action: "add" }, clientFactory);
}

export const addDependencyCommand: CommandModule = createAddDependencyCommand();
