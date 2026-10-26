import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { appendEvent } from "./events.ts";
import { currentCount } from "./limit-check.ts";
import { createRun } from "./record.ts";

let tmp: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dgs665-lc-"));
  env = { DIGISMITH_DEPOT_DIR: tmp };
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function open(ticket: string, role = "builder"): string {
  const r = createRun({ ticket, role, order: "/o.md" }, env);
  const dir = path.join(tmp, "runs", ticket, r.run);
  appendEvent(dir, r.run, "tool", {}, 2000);
  return r.run;
}

describe("currentCount", () => {
  it("counts two open builders and reads the default limits", () => {
    open("DGS-1");
    open("DGS-2");
    const { count, problems } = currentCount(env, "/nonexistent-dir-dgs665");
    expect(count.used.builder).toHaveLength(2);
    expect(count.limits).toEqual({ builder: 2, reviewer: 1, role: 1 });
    expect(problems).toEqual([]);
  });
  it("adds the factory slot from lock.json", () => {
    fs.mkdirSync(path.join(tmp, "autonomous"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "autonomous", "lock.json"), JSON.stringify({ ticket: "DGS-9" }));
    open("DGS-1");
    const { count } = currentCount(env, "/nonexistent-dir-dgs665");
    expect(count.used.builder.map((s) => s.factory)).toEqual([false, true]);
  });
  it("ignores a run older than the 2-day window", () => {
    const run = open("DGS-1");
    const old = new Date(Date.now() - 3 * 86_400_000);
    const dir = path.join(tmp, "runs", "DGS-1", run);
    for (const f of ["events.jsonl", "run.json"]) fs.utimesSync(path.join(dir, f), old, old);
    expect(currentCount(env, "/nonexistent-dir-dgs665").count.used.builder).toHaveLength(0);
  });
});
