// Test helper: node stale-worker.ts <run-dir> <start-epoch-ms>. Waits for the start time, then appends one event.
import { appendEvent } from "./events.ts";

const [dir, startAt] = process.argv.slice(2);
while (Date.now() < Number(startAt)) {
  /* spin so both workers hit the stale lock together */
}
appendEvent(dir, "r1", "tool", {}, 5000);
