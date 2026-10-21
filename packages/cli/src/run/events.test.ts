import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { appendEvent, readEvents } from "./events.ts";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nw-events-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("appendEvent", () => {
  it("numbers events 1..n and writes the documented line", () => {
    const a = appendEvent(dir, "r1", "started", { source: "startup" }, 2000);
    const b = appendEvent(dir, "r1", "tool", { tool: "Bash", ok: true }, 2000);
    expect([a.seq, b.seq]).toEqual([1, 2]);
    expect(Object.keys(a)).toEqual(["schema", "seq", "ts", "run", "type", "data"]);
    expect(a.schema).toBe("nightwatch-event/v1");
    const lines = fs.readFileSync(path.join(dir, "events.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1])).toMatchObject({ seq: 2, run: "r1", type: "tool", data: { tool: "Bash", ok: true } });
    expect(fs.existsSync(path.join(dir, "lock"))).toBe(false);
  });
  it("falls back to counting lines when the counter file is gone", () => {
    appendEvent(dir, "r1", "started", {}, 2000);
    appendEvent(dir, "r1", "tool", {}, 2000);
    fs.rmSync(path.join(dir, "seq"));
    expect(appendEvent(dir, "r1", "turn_end", {}, 2000).seq).toBe(3);
  });
  it("breaks a stale lock", () => {
    fs.mkdirSync(path.join(dir, "lock"));
    const old = new Date(Date.now() - 5000);
    fs.utimesSync(path.join(dir, "lock"), old, old);
    expect(appendEvent(dir, "r1", "started", {}, 2000).seq).toBe(1);
  });
  it("gives up after waitMs when the lock is held", () => {
    fs.mkdirSync(path.join(dir, "lock"));
    const t0 = Date.now();
    expect(() => appendEvent(dir, "r1", "tool", {}, 150)).toThrow(/lock timeout/);
    const took = Date.now() - t0;
    expect(took).toBeGreaterThanOrEqual(140);
    expect(took).toBeLessThan(900);
    expect(fs.existsSync(path.join(dir, "events.jsonl"))).toBe(false);
  });
  it("two parallel writers give seq 1..80 with no gap and no duplicate", async () => {
    const worker = path.join(import.meta.dirname, "append-worker.ts");
    const runWorker = (tag: string) =>
      new Promise<void>((resolve, reject) => {
        const p = spawn(process.execPath, ["--experimental-strip-types", worker, dir, tag, "40"], { stdio: "inherit" });
        p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`worker ${tag} exited ${c}`))));
      });
    await Promise.all([runWorker("a"), runWorker("b")]);
    const events = readEvents(dir);
    expect(events.map((e) => e.seq)).toEqual(Array.from({ length: 80 }, (_, i) => i + 1));
    const raw = fs.readFileSync(path.join(dir, "events.jsonl"), "utf8").trim().split("\n");
    expect(raw).toHaveLength(80);
    raw.forEach((l) => expect(() => JSON.parse(l)).not.toThrow());
  }, 30_000);
});

describe("readEvents", () => {
  it("returns [] without a file and skips a line that does not parse", () => {
    expect(readEvents(dir)).toEqual([]);
    appendEvent(dir, "r1", "started", {}, 2000);
    fs.appendFileSync(path.join(dir, "events.jsonl"), "{broken\n");
    expect(readEvents(dir)).toHaveLength(1);
  });
});
