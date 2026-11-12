import { runEvent, type EventDeps } from "../steward/event.ts";
import { defaultDeps, type DepsOptions } from "../steward/index.ts";

/** The factory's "the build starts": the Steward event `started`. Never throws; returns the warning lines. */
export async function sendStarted(deps: EventDeps, ticket: string): Promise<string[]> {
  try {
    const res = await runEvent(deps, ticket, { event: "started", by: "factory" });
    return res.warn;
  } catch (err) {
    return [`steward: ${ticket}: ${(err as Error).message}`];
  }
}

/** The factory's `in progress` write: the Steward event `started`, with the profile read from the tick's repo (not the process cwd). One warning line when that repo has no tracker; never throws. */
export async function startViaSteward(
  ticket: string,
  repo: string,
  makeDeps: (o: DepsOptions) => EventDeps = defaultDeps,
  warn: (line: string) => void = (l) => console.error(l),
): Promise<void> {
  if (ticket === "") return;
  let deps: EventDeps;
  try {
    deps = makeDeps({ quiet: true, cwd: repo });
  } catch (err) {
    warn(`steward: ${ticket}: ${(err as Error).message}`);
    return;
  }
  if (deps.tracker === null) {
    warn(`steward: ${ticket}: no ClickUp tracker in ${repo}; started not sent`);
    return;
  }
  for (const line of await sendStarted(deps, ticket)) warn(line);
}
