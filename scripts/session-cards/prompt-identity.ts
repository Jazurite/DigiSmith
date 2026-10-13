// DGS-437: a Claude Desktop session fires no SessionStart hook, so its first prompt does the work:
// write the Maestro card (DGS-411's identity branch) and print the identity line; on a catch-up
// prompt also run the conductor's catch-up (DGS-428). Never blocks, never throws; any error = no text.
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { startHook } from "./card-hook.ts";
import type { HookEvent } from "./card-hook.ts";
import { isSafeName } from "../conductor/safe-name.ts";

export const CATCH_UP_MARKER = "[digismith catch-up: Maestro asked to catch up]";
export const CATCH_UP_TIMEOUT_MS = 20_000;

export type CliRun = (args: string[], timeoutMs: number, cwd: string) => { status: number | null; stdout: string };

// Deliberately narrow: this is the FALLBACK for sessions that have no card yet. A regex cannot read
// meaning, and a miss costs nothing: once the session has its card, the skill digismith:catch-up
// matches any wording. Short prompts only, so "merge it and tell me the status of X" never matches.
const CATCH_UP_RE = /\b(catch[ -]?me[ -]?up|catch-?up|how(?:'s| is| are) (?:it|things) going|what did i miss|what(?:'s| is) the (?:update|status)|status\??)\b/i;
export function isCatchUpPrompt(prompt: string | undefined): boolean {
  return typeof prompt === "string" && prompt.length > 0 && prompt.length < 80 && CATCH_UP_RE.test(prompt);
}

const SCRIPTS = path.resolve(import.meta.dirname, "..");
const defaultRun: CliRun = (args, timeoutMs, cwd) => {
  const r = spawnSync("node", ["--experimental-strip-types", ...args], { encoding: "utf8", timeout: timeoutMs, cwd, stdio: ["ignore", "pipe", "ignore"] });
  return { status: r.status, stdout: r.stdout ?? "" };
};

export function identityPromptHandler(
  event: HookEvent & { prompt?: string },
  env: NodeJS.ProcessEnv,
  deps: { run?: CliRun } = {},
): string | undefined {
  try {
    if (env.HERDR_PANE_ID || env.DIGISMITH_ROLE || !event.session_id) return undefined;
    const r = startHook(event, env); // writes the card only when none exists for this session
    const identity = r.identity;
    if (!identity) return undefined;
    const out: string[] = [];
    if (r.wrote && r.context) out.push(r.context);
    if (isCatchUpPrompt(event.prompt)) {
      const text = catchUp(identity.id, event.session_id, identity.conductors[0], identity.project, identity.folder, deps.run ?? defaultRun);
      if (text) out.push(CATCH_UP_MARKER, "Give this output first, unchanged, then answer Jack's message.", text);
    }
    return out.length ? out.join("\n") : undefined;
  } catch {
    return undefined;
  }
}

function catchUp(id: string, session: string, conductor: string | undefined, project: string, folder: string, run: CliRun): string | undefined {
  if (!conductor || ![id, session, conductor, project].every(isSafeName)) return undefined;
  const t0 = Date.now();
  try {
    const r = run([path.join(SCRIPTS, "conductor", "catch-up-cli.ts"), "--maestro", id, "--session", session, "--conductor", conductor, "--project", project], CATCH_UP_TIMEOUT_MS, folder);
    // exit 3 and 4: the catch-up printed, only the note write failed (DGS-428)
    if ((r.status === 0 || r.status === 3 || r.status === 4) && r.stdout.trim()) return r.stdout.trim();
  } catch {
    /* fall through to consult */
  }
  const left = CATCH_UP_TIMEOUT_MS - (Date.now() - t0);
  if (left < 1000) return undefined;
  try {
    const r = run([path.join(SCRIPTS, "conductor", "cli.ts"), "consult", "--project", project], left, folder);
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  } catch {
    /* no context */
  }
  return undefined;
}
