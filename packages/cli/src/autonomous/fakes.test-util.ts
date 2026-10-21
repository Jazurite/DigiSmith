import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Observers } from "./observe.ts";
import type { AttentionView, GitView, HerdrView, PackView, RunView, TicketState, VerdictView } from "./phase-types.ts";

export interface World {
  runs: RunView[]; packs: PackView[]; verdicts: VerdictView[]; git: GitView; status: string; herdr: HerdrView; attention: AttentionView[];
  fail: Partial<Record<keyof Observers, string>>;
  prompts: string[]; markers: [string, string][]; statuses: string[];
}
export function makeWorld(): World {
  return {
    runs: [{ id: "builder-1", role: "builder", createdAt: "2026-10-21T00:01:00.000Z", started: true, ended: false, merged: false, pushed: false, phaseEvent: null }],
    packs: [], verdicts: [], git: { head: "aaaaaaa1", base: "bbbbbbb1", onOriginMain: false }, status: "in progress",
    herdr: { conductorPresent: true, conductorWorking: false, input: "empty", builderPane: "present" }, attention: [],
    fail: {}, prompts: [], markers: [], statuses: [],
  };
}
export function fakeObservers(w: World): Observers {
  const get = <K extends keyof Observers>(k: K, v: () => Awaited<ReturnType<Observers[K]>>) => async () => {
    if (w.fail[k] !== undefined) throw new Error(w.fail[k]);
    return v();
  };
  return {
    runs: get("runs", () => w.runs), packs: get("packs", () => w.packs), verdicts: get("verdicts", () => w.verdicts),
    git: get("git", () => w.git), tracker: get("tracker", () => ({ status: w.status })), herdr: get("herdr", () => w.herdr),
    attention: get("attention", () => w.attention),
  } as Observers;
}
export function writeLock(dir: string, o: Partial<TicketState> & { phase?: string } = {}): void {
  writeFileSync(join(dir, "lock.json"), JSON.stringify({
    ticket: "DGS-1", taskId: "t1", claimedAt: "2026-10-21T00:00:00.000Z", order: "o.md", scanId: "s1",
    phase: "claimed", phaseStartedAt: "2026-10-21T00:00:00.000Z", attempt: 1, runs: { builder: null }, ...o,
  }));
}
