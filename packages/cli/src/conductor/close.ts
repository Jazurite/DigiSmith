import { removeEntry, resolveConductor, scopeFor } from "../conductor-registry/registry.ts";
import { handoverDriver, releaseDriver, type Driver } from "./drivers.ts";
import { CASTLE, herdrWsPath, type StartDeps } from "./start-ticket.ts";

/** `dg conductor close --self`: the ticket conductor releases its ticket, leaves the registry and closes its own tab, in that order. */
export async function closeTicketConductor(a: { name: string; project: string }, d: StartDeps): Promise<void> {
  const env = d.env ?? process.env;
  const key = `${a.project}/${a.name}`;
  const e = resolveConductor(key, env);
  if (!e) throw new Error(`no conductor ${key} in the registry`);
  if (!e.kinds.includes("ticket") || e.ticket === undefined) throw new Error(`${key} is not a ticket conductor`);
  const tab = env.HERDR_TAB_ID;
  if (tab === undefined || tab === "") throw new Error("HERDR_TAB_ID is not set: close --self runs inside the conductor's own tab");
  if (e.workspace === undefined) throw new Error(`${key} has no workspace`);
  // release and remove first, the tab close last: a failed close leaves a clean registry
  if (!releaseDriver(e.ticket, a.name, env)) throw new Error(`${a.name} is not the driver of ${e.ticket}: nothing released`);
  removeEntry(key, env);
  const r = await d.exec(herdrWsPath(), ["--session", CASTLE, "tab", "close", tab], { HERDR_WS: e.workspace, HERDR_SCOPE: scopeFor(e, env) });
  if (r.code !== 0) throw new Error(`herdr-ws tab close failed (exit ${r.code}): ${r.stderr}`);
}

export function handover(a: { ticket: string; from: string; to: string }, env?: NodeJS.ProcessEnv): Driver {
  return handoverDriver(a.ticket, a.from, a.to, env);
}
