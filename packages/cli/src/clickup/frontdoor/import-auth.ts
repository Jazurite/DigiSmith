import type { CommandModule } from "yargs";
import { defaultEnvPath, mergeCookies, writeEnvValues } from "@digismith/clickup-client";
import { formatExpiry, jwtExpiry, newestCapture, readCalls, type CapturedCall } from "./captures.ts";
import { CAPTURES_ROOT } from "./dump.ts";

const AUTH_KEY = "CLICKUP_FRONTDOOR_AUTH";
const COOKIE_KEY = "CLICKUP_FRONTDOOR_REFRESH_COOKIE";
const KEPT = ["cu_refresh", "cu_session_meta"];

/**
 * The two cookies a renewal needs, newest value last seen in the capture: a request Cookie header sets them,
 * a later non-empty Set-Cookie replaces them. "" when the capture has no cu_refresh (the session cannot renew).
 */
export function refreshCookieOf(calls: CapturedCall[]): string {
  let cookie = "";
  for (const call of calls) {
    // A Cookie header is "name=value; name=value": mergeCookies reads each pair like a Set-Cookie line and keeps only the two names.
    cookie = mergeCookies(cookie, (call.requestHeaders.cookie ?? "").split(/;\s*/));
    cookie = mergeCookies(cookie, call.responseSetCookies);
  }
  return cookie.includes("cu_refresh=") ? cookie : "";
}

export function createImportAuthCommand(
  envPath: string = defaultEnvPath(),
  capturesRoot: string = CAPTURES_ROOT,
): CommandModule {
  return {
    command: "import-auth",
    describe:
      "store the Frontdoor session and its refresh cookie of a Proxyman raw export in ~/.digismith-depot/.env (prints no secret)",
    builder: (y) =>
      y.option("capture", {
        type: "string",
        requiresArg: true,
        describe: "Raw_* export folder (default: the newest in ~/Downloads/Proxyman Captures/ClickUp/)",
      }),
    handler: async (argv) => {
      try {
        const folder = (argv.capture as string | undefined) ?? newestCapture(capturesRoot);
        const calls = readCalls(folder);
        const withAuth = calls.filter((c) => c.isFrontdoor && c.requestHeaders.authorization);
        const newest = withAuth[withAuth.length - 1];
        if (!newest) throw new Error("no Frontdoor request with an Authorization header in the capture");
        const value = newest.requestHeaders.authorization;
        const cookie = refreshCookieOf(calls);
        // One atomic write for both values; a capture without the cookie clears an older one, which belongs to another session.
        writeEnvValues(envPath, { [AUTH_KEY]: value, [COOKIE_KEY]: cookie });
        const exp = jwtExpiry(value);
        console.log(
          `clickup frontdoor import-auth: stored${exp === undefined ? "" : `, expires ${formatExpiry(exp)}`}, renewal: ${cookie ? "yes" : "no"}`,
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
