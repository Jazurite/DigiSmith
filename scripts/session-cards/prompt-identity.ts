// DGS-437: the FALLBACK for a session that has no card yet. A Claude Desktop session does fire
// SessionStart; the DGS-437 miss was a stale Desktop plugin copy (no hooks, DGS-437 report). A stale
// copy or a missed event can still leave a session without a card, so the first prompt does the work:
// write the Maestro card (DGS-411's identity branch) and print the identity line; on a catch-up
// prompt also run the conductor's catch-up (DGS-428). Never blocks, never throws; any error = no text.
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { startHook } from "./card-hook.ts";
import type { HookEvent } from "./card-hook.ts";
import { isSafeName } from "../conductor/safe-name.ts";

export const CATCH_UP_MARKER = "[digismith catch-up: Maestro asked to catch up]";
export const CATCH_UP_TIMEOUT_MS = 20_000;

export type CliRun = (args: string[], timeoutMs: number, cwd: string) => { status: number | null; stdout: string };

// Deliberately narrow: this is the FALLBACK for sessions that have no card yet. A regex cannot read
// meaning, and a miss costs nothing: once the session has its card, the skill digismith:catch-up
// matches any wording. The whole prompt must be the phrase, so "git status" or "merge it and tell me the status of X" never match.
const CATCH_UP_RE = /^\s*(?:(?:please )?catch[ -]?me[ -]?up|catch-up(?: please)?|how(?:'s| is| are) (?:it|things) going|what did i miss|what(?:'s| is) the (?:update|status)|status)\b[\s?!.]*(?:please)?[\s?!.]*$/i;
export function isCatchUpPrompt(prompt: string | undefined): boolean {
  return typeof prompt === "string" && prompt.length > 0 && prompt.length < 80 && CATCH_UP_RE.test(prompt);
}

const SCRIPTS = path.resolve(import.meta.dirname, "..");
// The catch-up CLI finds the repo (git log, reports) from its own path. A plugin copy in the cache is
// not the project's repo, so prefer the script of the identity's own folder when it has one.
function conductorScript(folder: string, name: string): string {
  const own = path.join(folder, "scripts", "conductor", name);
  return fs.existsSync(own) ? own : path.join(SCRIPTS, "conductor", name);
}
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
    // Only on the prompt that wrote the card: a session that already has its card gets catch-up from the
    // skill and the idle handler, and running it here too would give two catch-ups and two note writes.
    if (r.wrote && isCatchUpPrompt(event.prompt)) {
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
    const r = run([conductorScript(folder, "catch-up-cli.ts"), "--maestro", id, "--session", session, "--conductor", conductor, "--project", project], CATCH_UP_TIMEOUT_MS, folder);
    // exit 3 and 4: the catch-up printed, only the note write failed (DGS-428)
    if ((r.status === 0 || r.status === 3 || r.status === 4) && r.stdout.trim()) return r.stdout.trim();
  } catch {
    /* fall through to consult */
  }
  const left = CATCH_UP_TIMEOUT_MS - (Date.now() - t0);
  if (left < 1000) return undefined;
  try {
    const r = run([conductorScript(folder, "cli.ts"), "consult", "--project", project], left, folder);
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  } catch {
    /* no context */
  }
  return undefined;
}
