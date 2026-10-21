import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { runTick } from "./tick.ts";
import { fakeObservers, makeWorld } from "./fakes.test-util.ts";

const dir = process.argv[2];
const w = makeWorld();
w.runs[0].phaseEvent = "merge";
await runTick({
  dir, now: () => new Date("2026-10-21T05:00:00.000Z"), dryRun: false, observers: fakeObservers(w),
  prompt: async (text) => { appendFileSync(join(dir, "prompts.log"), `${text}\n`); process.kill(process.pid, "SIGKILL"); },
  writeMarker: async () => {}, setStatus: async () => {},
});
