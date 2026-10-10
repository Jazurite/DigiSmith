import type { CommandModule } from "yargs";
import { checkCredentials, readFrontdoorAuth } from "@digismith/clickup-client";

export function createCheckCredentialsCommand(envPath?: string): CommandModule {
  return {
    command: "check-credentials",
    describe: "verify ClickUp credentials are present and complete in ~/.digismith-depot/.env",
    handler: () => {
      try {
        checkCredentials(envPath);
        console.log("clickup check-credentials: ok");
        console.log(
          `clickup check-credentials: frontdoor session ${readFrontdoorAuth(envPath) ? "present" : "missing"}`
        );
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup check-credentials: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const checkCredentialsCommand: CommandModule = createCheckCredentialsCommand();
