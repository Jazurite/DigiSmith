import { findByKind } from "../conductor-registry/registry.ts";
import { CASTLE } from "./start-ticket.ts";

/** Every open ticket conductor of the registry; `gone` when its name is not among the live agents of Castle. */
export function sweepTickets(env: NodeJS.ProcessEnv, live: (session: string) => string[]): { key: string; ticket?: string; verdict: "running" | "gone" }[] {
  const names = new Set(live(CASTLE));
  return findByKind("ticket", env).map((e) => ({ key: e.key, ticket: e.ticket, verdict: names.has(e.name) ? ("running" as const) : ("gone" as const) }));
}
