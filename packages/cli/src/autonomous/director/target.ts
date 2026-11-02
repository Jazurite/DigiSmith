import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { claimDriver, DriverTaken, readDriver } from "../../conductor/drivers.ts";
import { herdrSessionArgs, readRegistryFile, scopeFor, type ConductorEntry } from "../../conductor-registry/registry.ts";
import { appendAttention } from "../attention-write.ts";
import { PromptError } from "../act.ts";
import type { Exec } from "../conductor.ts";

export const DIRECTOR_NAME = "director";
const PROJECT_KEY = "DigiSmith/digismith-conductor";
const PROJECT_FALLBACK = "digismith-conductor";
const herdrBin = (): string => join(homedir(), ".digismith-depot", "bin", "herdr-ws");

export interface DirectorTarget { key: string; name: string; session: string; workspace: string; scope: string }

function entriesOf(conductorsJson: string): ConductorEntry[] {
  return Object.values(readRegistryFile(conductorsJson).entries);
}

/** The registry entry named `director` with kind factory (open, with a workspace). Null when there is none: the lane and the wake stay off. Never throws. */
export function directorTarget(conductorsJson: string): DirectorTarget | null {
  try {
    const all = entriesOf(conductorsJson);
    const e = all.find((x) => x.name === DIRECTOR_NAME && x.kinds.includes("factory") && x.status === "open" && x.workspace !== undefined);
    if (e === undefined || e.workspace === undefined) return null;
    return { key: e.key, name: e.name, session: e.session, workspace: e.workspace, scope: scopeFor(e, undefined, all) };
  } catch { return null; }
}

/** Errors raised before herdr is called are PromptError "no" (nothing delivered); an exec that throws is "maybe"; a non-zero exit is "no". */
async function promptEntry(exec: Exec, e: ConductorEntry, all: ConductorEntry[], message: string): Promise<void> {
  const ws = e.floor ?? e.workspace;
  if (ws === undefined) throw new PromptError(`${e.key}: no workspace`, "no");
  let scope: string;
  try { scope = scopeFor(e, undefined, all); } catch (err) { throw new PromptError((err as Error).message, "no"); }
  const sess = e.session === "default" ? [] : herdrSessionArgs(e);
  let r: { code: number; stderr: string };
  try {
    r = await exec(herdrBin(), [...sess, "agent", "prompt", e.name, message], { HERDR_WS: ws, HERDR_SCOPE: scope });
  } catch (err) {
    throw new PromptError(`herdr-ws agent prompt did not finish: ${(err as Error).message}`, "maybe");
  }
  if (r.code !== 0) throw new PromptError(`herdr-ws agent prompt failed (exit ${r.code}): ${r.stderr}`, "no");
}

/** The registry read; a failure there happens before any delivery. */
function entriesBeforeDelivery(conductorsJson: string): ConductorEntry[] {
  try { return entriesOf(conductorsJson); } catch (err) { throw new PromptError((err as Error).message, "no"); }
}

export async function promptDirector(exec: Exec, conductorsJson: string, message: string): Promise<void> {
  const all = entriesBeforeDelivery(conductorsJson);
  const t = directorTarget(conductorsJson);
  const e = t === null ? undefined : all.find((x) => x.key === t.key);
  if (e === undefined) throw new PromptError(`no Director (an open factory entry named ${DIRECTOR_NAME}) in ${conductorsJson}`, "no");
  await promptEntry(exec, e, all, message);
}

/** The project conductor the claim names as driver and the fallback of promptDriver. */
export function projectConductorName(conductorsJson: string): string {
  try { return entriesOf(conductorsJson).find((x) => x.key === PROJECT_KEY)?.name ?? PROJECT_FALLBACK; } catch { return PROJECT_FALLBACK; }
}

const KEY = /^[A-Z]+-\d+$/;

/**
 * Prompts the conductor that drives the ticket: drivers/<KEY>.json (next to conductors.json), else DigiSmith/digismith-conductor.
 * A malformed driver file, or a driver the registry does not know, falls back and opens one attention item.
 */
export async function promptDriver(exec: Exec, conductorsJson: string, attentionDir: string, ticket: string, text: string): Promise<void> {
  const all = entriesBeforeDelivery(conductorsJson);
  const fallback = all.find((x) => x.key === PROJECT_KEY && x.status === "open" && x.workspace !== undefined && x.name !== DIRECTOR_NAME);
  const denv = { ...process.env, DIGISMITH_DEPOT_DIR: dirname(conductorsJson) };
  const note = (cause: string): void => {
    try { appendAttention(attentionDir, new Date(), { ticket, run: `${ticket}/driver`, kind: "unknown", cause }); } catch { /* the prompt still goes to the fallback */ }
  };
  let target: ConductorEntry | undefined;
  if (KEY.test(ticket)) {
    try {
      const rec = readDriver(ticket, denv);
      if (rec !== null) {
        // the Director is never a driver: a record naming it (a hand edit) is treated as unknown
        target = all.find((x) => x.name === rec.driver && x.name !== DIRECTOR_NAME && x.status === "open" && x.workspace !== undefined);
        if (target === undefined) note("driver-not-in-registry");
      }
    } catch { note("driver-file-unreadable"); }
  }
  const e = target ?? fallback;
  if (e === undefined) {
    note("driver-not-in-registry");
    throw new PromptError(`no conductor to prompt for ${ticket}: no usable driver record and no open ${PROJECT_KEY} with a workspace in ${conductorsJson}`, "no");
  }
  await promptEntry(exec, e, all, text);
}

/** The driver record (DGS-683 6.3 fields), exclusive create. True when this call wrote it, false when one already exists. */
export function writeDriverIfAbsent(conductorsJson: string, ticket: string, driver: string): boolean {
  try {
    claimDriver({ ticket, driver, mode: "factory" }, { ...process.env, DIGISMITH_DEPOT_DIR: dirname(conductorsJson) });
    return true;
  } catch (e) {
    if (e instanceof DriverTaken) return false;
    throw e;
  }
}
