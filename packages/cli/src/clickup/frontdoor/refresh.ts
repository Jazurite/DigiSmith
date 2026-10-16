import type { CommandModule } from "yargs";
import { FileSessionStore, RenewalError, checkCredentials, defaultEnvPath, renewSession } from "@digismith/clickup-client";
import type { RenewTransport } from "@digismith/clickup-client";
import { formatExpiry } from "./captures.ts";

function expiry(exp: number | undefined): string {
  return exp === undefined ? "unknown" : formatExpiry(exp);
}

/** Mints a new Frontdoor token with the stored refresh cookie, as the web app does. Prints the old and new expiry only. */
export function createRefreshCommand(envPath: string = defaultEnvPath(), transport?: RenewTransport): CommandModule {
  return {
    command: "refresh",
    describe: "renew the Frontdoor session with the stored refresh cookie (prints the old and new expiry, no secret)",
    handler: async () => {
      try {
        const { teamId } = checkCredentials(envPath);
        const r = await renewSession({ store: new FileSessionStore(envPath), teamId, transport });
        console.log(`clickup frontdoor refresh: renewed, expiry ${expiry(r.oldExp)} -> ${expiry(r.newExp)}`);
        process.exitCode = 0;
      } catch (err) {
        // RenewalError and our own messages hold no secret; anything else is shown as its message only.
        console.error(`clickup frontdoor refresh: ${err instanceof RenewalError ? err.message : (err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const refreshCommand: CommandModule = createRefreshCommand();
