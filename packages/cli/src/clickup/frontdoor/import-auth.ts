import type { CommandModule } from "yargs";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { formatExpiry, jwtExpiry, newestCapture, readCalls } from "./captures.ts";
import { CAPTURES_ROOT } from "./dump.ts";

const KEY = "CLICKUP_FRONTDOOR_AUTH";

function defaultEnvPath(): string {
  return join(homedir(), ".digismith-depot", ".env");
}

/** Sets KEY='value' in the env file, replacing an existing line. Single quotes: the file is sourced by shells. */
function storeAuth(envPath: string, value: string): void {
  const line = `${KEY}='${value.replace(/'/g, "'\\''")}'`;
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const lines = existing === "" ? [] : existing.replace(/\n$/, "").split("\n");
  const at = lines.findIndex((l) => l.startsWith(`${KEY}=`));
  if (at === -1) lines.push(line);
  else lines[at] = line;
  // mode only applies when the file is created: tighten an existing file before the secret goes in.
  if (existsSync(envPath)) chmodSync(envPath, 0o600);
  writeFileSync(envPath, lines.join("\n") + "\n", { mode: 0o600 });
}

export function createImportAuthCommand(
  envPath: string = defaultEnvPath(),
  capturesRoot: string = CAPTURES_ROOT,
): CommandModule {
  return {
    command: "import-auth",
    describe: "store the Frontdoor session of a Proxyman raw export in ~/.digismith-depot/.env (prints no secret)",
    builder: (y) =>
      y.option("capture", {
        type: "string",
        requiresArg: true,
        describe: "Raw_* export folder (default: the newest in ~/Downloads/Proxyman Captures/ClickUp/)",
      }),
    handler: async (argv) => {
      try {
        const folder = (argv.capture as string | undefined) ?? newestCapture(capturesRoot);
        const withAuth = readCalls(folder).filter((c) => c.isFrontdoor && c.requestHeaders.authorization);
        const newest = withAuth[withAuth.length - 1];
        if (!newest) throw new Error("no Frontdoor request with an Authorization header in the capture");
        const value = newest.requestHeaders.authorization;
        storeAuth(envPath, value);
        const exp = jwtExpiry(value);
        console.log(
          `clickup frontdoor import-auth: stored${exp === undefined ? "" : `, expires ${formatExpiry(exp)}`}`,
        );
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup frontdoor import-auth: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const importAuthCommand: CommandModule = createImportAuthCommand();
