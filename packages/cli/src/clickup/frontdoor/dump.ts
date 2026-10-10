import type { CommandModule } from "yargs";
import { homedir } from "node:os";
import { join } from "node:path";
import { maskJwts, newestCapture, readCalls } from "./captures.ts";

export const CAPTURES_ROOT = join(homedir(), "Downloads", "Proxyman Captures", "ClickUp");

function pretty(body: string): string {
  const masked = maskJwts(body);
  try {
    return JSON.stringify(JSON.parse(masked), null, 2);
  } catch {
    return masked;
  }
}

export function createDumpCommand(capturesRoot: string = CAPTURES_ROOT): CommandModule {
  return {
    command: "dump",
    describe: "print the masked request and response bodies of the Frontdoor calls in a Proxyman raw export",
    builder: (y) =>
      y
        .option("capture", {
          type: "string",
          requiresArg: true,
          describe: "Raw_* export folder (default: the newest in ~/Downloads/Proxyman Captures/ClickUp/)",
        })
        .option("match", {
          type: "string",
          requiresArg: true,
          describe: "regex; keep only calls whose 'METHOD /path' matches",
        }),
    handler: async (argv) => {
      try {
        const folder = (argv.capture as string | undefined) ?? newestCapture(capturesRoot);
        const match = argv.match ? new RegExp(argv.match as string) : undefined;
        for (const call of readCalls(folder)) {
          if (!call.isFrontdoor) continue;
          if (match && !match.test(call.requestLine)) continue;
          console.log(`===== [${call.n}] ${maskJwts(call.requestLine)}`);
          if (call.requestBody.trim()) console.log(pretty(call.requestBody));
          if (call.responseStatus !== undefined) {
            console.log(`----- [${call.n}] ${call.responseStatus}`);
            if (call.responseBody?.trim()) console.log(pretty(call.responseBody));
          }
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup frontdoor dump: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const dumpCommand: CommandModule = createDumpCommand();
