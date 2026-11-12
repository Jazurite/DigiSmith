import { runEvent, type EventDeps } from "../steward/event.ts";

/** The factory's "the build starts": the Steward event `started`. Never throws; returns the warning lines. */
export async function sendStarted(deps: EventDeps, ticket: string): Promise<string[]> {
  try {
    const res = await runEvent(deps, ticket, { event: "started", by: "factory" });
    return res.warn;
  } catch (err) {
    return [`steward: ${ticket}: ${(err as Error).message}`];
  }
}
