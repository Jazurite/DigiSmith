// Test helper: node append-worker.ts <run-dir> <tag> <count>. Appends <count> events as fast as it can.
import { appendEvent } from "./events.ts";

const [dir, tag, count] = process.argv.slice(2);
for (let i = 0; i < Number(count); i++) appendEvent(dir, "r1", "tool", { tag, i }, 2000);
