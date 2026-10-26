// packages/cli/src/run/seat.ts
// The seat of an automatic run (DGS-622). node:fs, node:os, node:path and plainName only: the hook must stay fast.
// A token variable is only checked with `in`; its value is never read, and ~/.claude.json holds no token.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { plainName } from "./schema.ts";

const TOKEN_VARS = ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"];

export function seatOf(env: NodeJS.ProcessEnv): string | null {
  const named = plainName(env.DIGISMITH_SEAT);
  if (named !== null) return named;
  if (TOKEN_VARS.some((k) => k in env)) return null;
  try {
    const dir = env.CLAUDE_CONFIG_DIR || env.HOME || os.homedir();
    const v = JSON.parse(fs.readFileSync(path.join(dir, ".claude.json"), "utf8")) as { oauthAccount?: { emailAddress?: unknown } } | null;
    const email = v?.oauthAccount?.emailAddress;
    return typeof email === "string" ? plainName(email.split("@")[0].toLowerCase()) : null;
  } catch {
    return null;
  }
}
