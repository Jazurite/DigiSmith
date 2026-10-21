import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acquireLock, appendEvent, autonomousDir, clearLock, readEvents, readLastReport, readLock, readNotes,
  writeLastReport, writeNotes,
} from "./state.ts";
import type { Lock } from "./types.ts";

const lock: Lock = { ticket: "DGS-1", taskId: "t1", claimedAt: "2026-10-19T00:00:00.000Z", claimedAtUtc7: "2026-10-19 07:00:00", order: "o", scanId: "s" };
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "auto-state-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("lock", () => {
  it("acquires then reports busy", () => {
    expect(acquireLock(dir, lock)).toBe("acquired");
    expect(acquireLock(dir, lock)).toBe("busy");
  });
  it("gives exactly one acquired across separate processes", async () => {
    const stateTs = join(dirname(fileURLToPath(import.meta.url)), "state.ts");
    const code = `import { acquireLock } from ${JSON.stringify(stateTs)}; console.log(acquireLock(process.argv[2], ${JSON.stringify(lock)}));`;
    const script = join(dir, "child.mts");
    writeFileSync(script, code);
    const work = join(dir, "work");
    mkdirSync(work);
    const run = () => new Promise<string>((resolve, reject) => {
      const c = spawn(process.execPath, ["--experimental-strip-types", script, work]);
      let out = "";
      c.stdout.on("data", (d) => { out += d; });
      c.on("error", reject);
      c.on("close", () => resolve(out.trim()));
    });
    const r = await Promise.all(Array.from({ length: 6 }, run));
    expect(r.filter((x) => x === "acquired")).toHaveLength(1);
    expect(r.filter((x) => x === "busy")).toHaveLength(5);
  }, 30000);
  it("gives exactly one acquired out of ten in-process calls", async () => {
    const r = await Promise.all(Array.from({ length: 10 }, async () => acquireLock(dir, lock)));
    expect(r.filter((x) => x === "acquired")).toHaveLength(1);
  });
  it("reads the written lock", () => {
    acquireLock(dir, lock);
    expect(readLock(dir)).toEqual(lock);
  });
  it("returns null with no file", () => { expect(readLock(dir)).toBeNull(); });
  it("keeps a corrupt lock busy with ticket ?", () => {
    writeFileSync(join(dir, "lock.json"), "not json");
    expect(readLock(dir)?.ticket).toBe("?");
  });
  it("clears then acquires again", () => {
    acquireLock(dir, lock);
    clearLock(dir);
    expect(acquireLock(dir, lock)).toBe("acquired");
  });
});

describe("notes", () => {
  it("uses a random suffix in the temp name", () => {
    writeNotes(dir, { a: "b" });
    expect(readdirSync(dir)).toEqual(["notes.json"]);
  });
  it("round-trips and leaves no tmp file", () => {
    writeNotes(dir, { a: "b" });
    expect(readNotes(dir)).toEqual({ a: "b" });
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
  it("reads empty with no file", () => { expect(readNotes(dir)).toEqual({}); });
});

describe("events", () => {
  const a = new Date("2026-10-19T16:30:00Z"); // 23:30 UTC+7 on 10-19
  const b = new Date("2026-10-19T17:30:00Z"); // 00:30 UTC+7 on 10-20
  it("appends two valid lines in the day file", () => {
    appendEvent(dir, a, "scan", { n: 1 });
    appendEvent(dir, a, "off");
    const lines = readFileSync(join(dir, "events-2026-10-19.jsonl"), "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0].kind).toBe("scan");
    expect(lines[0].n).toBe(1);
    expect(lines[0].tsUtc7).toBe("2026-10-19 23:30:00");
  });
  it("splits days and reads in order with bounds, skipping garbage", () => {
    appendEvent(dir, b, "busy");
    appendEvent(dir, a, "scan");
    writeFileSync(join(dir, "events-2026-10-20.jsonl"), "garbage\n", { flag: "a" });
    expect(existsSync(join(dir, "events-2026-10-19.jsonl"))).toBe(true);
    expect(existsSync(join(dir, "events-2026-10-20.jsonl"))).toBe(true);
    const all = readEvents(dir, a.getTime(), b.getTime() + 1);
    expect(all.map((e) => e.kind)).toEqual(["scan", "busy"]);
    expect(readEvents(dir, a.getTime() + 1, b.getTime() + 1).map((e) => e.kind)).toEqual(["busy"]);
    expect(readEvents(dir, a.getTime(), b.getTime()).map((e) => e.kind)).toEqual(["scan"]);
  });
  it("throws on a non-finite or over-long window", () => {
    expect(() => readEvents(dir, Number.NaN, 1)).toThrow(Error);
    expect(() => readEvents(dir, 0, Number.POSITIVE_INFINITY)).toThrow(Error);
    expect(() => readEvents(dir, 0, 401 * 24 * 3600_000)).toThrow(/400/);
    expect(() => readEvents(dir, 0, 400 * 24 * 3600_000)).not.toThrow();
  });
  it("rethrows a read error that is not a missing file", () => {
    mkdirSync(join(dir, "events-2026-10-19.jsonl"));
    expect(() => readEvents(dir, Date.parse("2026-10-19T00:00:00Z"), Date.parse("2026-10-20T00:00:00Z"))).toThrow(/EISDIR/);
  });
  it("reads nothing with no files", () => { expect(readEvents(dir, Date.parse("2026-10-19T00:00:00Z"), Date.parse("2026-10-21T00:00:00Z"))).toEqual([]); });
});

describe("last report", () => {
  it("is null then the written date", () => {
    expect(readLastReport(dir)).toBeNull();
    const d = new Date("2026-10-19T01:00:00Z");
    writeLastReport(dir, d);
    expect(readLastReport(dir)?.getTime()).toBe(d.getTime());
  });
  it("is null when corrupt", () => {
    writeFileSync(join(dir, "last-report.json"), "x");
    expect(readLastReport(dir)).toBeNull();
  });
});

describe("autonomousDir", () => {
  it("honours the overrides", () => {
    expect(autonomousDir({ AUTONOMOUS_DIR: "/x" })).toBe("/x");
    expect(autonomousDir({ DIGISMITH_DEPOT_DIR: "/d" })).toBe("/d/autonomous");
  });
});
