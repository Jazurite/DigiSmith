import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { appendEvent, readEvents, _testHooks } from "./events.ts";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nw-events-"));
});
afterEach(() => {
  _testHooks.beforeBreakRename = undefined;
  _testHooks.beforeOwnerWrite = undefined;
  _testHooks.beforeOwnerCheck = undefined;
  fs.rmSync(dir, { recursive: true, force: true });
});

function deadPid(): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["-e", ""]);
    p.on("exit", () => resolve(p.pid as number));
    p.on("error", reject);
  });
}
function age(p: string, ms: number): void {
  const old = new Date(Date.now() - ms);
  fs.utimesSync(p, old, old);
}
const lockDirs = (d: string) => fs.readdirSync(d).filter((n) => n === "lock" || n.startsWith("lock.stale-"));

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
    expect(took).toBeLessThan(2000);
    expect(fs.existsSync(path.join(dir, "events.jsonl"))).toBe(false);
  });
  it("two waiters on one stale lock never duplicate a seq or leave a lock behind", async () => {
    const worker = path.join(import.meta.dirname, "stale-worker.ts");
    const run = (d: string, startAt: number) =>
      new Promise<void>((resolve, reject) => {
        const p = spawn(process.execPath, ["--experimental-strip-types", worker, d, String(startAt)], { stdio: "inherit" });
        p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`stale worker exited ${c}`))));
      });
    for (let round = 0; round < 10; round++) {
      const d = path.join(dir, `round-${round}`);
      fs.mkdirSync(path.join(d, "lock"), { recursive: true });
      const old = new Date(Date.now() - 5000);
      fs.utimesSync(path.join(d, "lock"), old, old);
      const startAt = Date.now() + 400;
      await Promise.all([run(d, startAt), run(d, startAt)]);
      expect(readEvents(d).map((e) => e.seq)).toEqual([1, 2]);
      expect(fs.readdirSync(d).filter((n) => n === "lock" || n.startsWith("lock.stale-"))).toEqual([]);
    }
  }, 60_000);
  it("does not remove a lock that another writer now owns", () => {
    // data.toJSON runs inside the locked section: it swaps the owner token, as if our lock had been broken and re-taken.
    const data = {
      toJSON() {
        fs.writeFileSync(path.join(dir, "lock", "owner"), "someone-else");
        return {};
      },
    };
    appendEvent(dir, "r1", "tool", data, 2000);
    expect(fs.readFileSync(path.join(dir, "lock", "owner"), "utf8")).toBe("someone-else");
  });
  it("writes the seq counter before the line, so a crash leaves a gap, not a duplicate", () => {
    const data = {
      toJSON(): never {
        throw new Error("crash while serializing");
      },
    };
    expect(() => appendEvent(dir, "r1", "tool", data, 2000)).toThrow(/crash/);
    expect(fs.readFileSync(path.join(dir, "seq"), "utf8")).toBe("1");
    expect(fs.existsSync(path.join(dir, "lock"))).toBe(false);
    expect(appendEvent(dir, "r1", "tool", {}, 2000).seq).toBe(2);
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

describe("stale lock breaking", () => {
  it("three waiters on one lock of a dead pid never duplicate a seq or leave a lock behind", async () => {
    const worker = path.join(import.meta.dirname, "stale-worker.ts");
    const run = (d: string, startAt: number) =>
      new Promise<void>((resolve, reject) => {
        const p = spawn(process.execPath, ["--experimental-strip-types", worker, d, String(startAt)], { stdio: "inherit" });
        p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`stale worker exited ${c}`))));
      });
    const pid = await deadPid();
    for (let round = 0; round < 10; round++) {
      const d = path.join(dir, `round-${round}`);
      fs.mkdirSync(path.join(d, "lock"), { recursive: true });
      fs.writeFileSync(path.join(d, "lock", "owner"), `${pid}:deadbeef`);
      const startAt = Date.now() + 400;
      await Promise.all([run(d, startAt), run(d, startAt), run(d, startAt)]);
      expect(readEvents(d).map((e) => e.seq)).toEqual([1, 2, 3]);
      expect(lockDirs(d)).toEqual([]);
    }
  }, 60_000);
  it("does not break a lock held by a live pid for under 30 s", () => {
    const lock = path.join(dir, "lock");
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, "owner"), `${process.pid}:abc`);
    age(lock, 5000);
    expect(() => appendEvent(dir, "r1", "tool", {}, 300)).toThrow(/lock timeout/);
    expect(fs.readFileSync(path.join(lock, "owner"), "utf8")).toBe(`${process.pid}:abc`);
    expect(fs.existsSync(path.join(dir, "events.jsonl"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "seq"))).toBe(false);
  });
  it("breaks a lock older than 30 s whatever the pid", () => {
    const lock = path.join(dir, "lock");
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, "owner"), `${process.pid}:abc`);
    age(lock, 31_000);
    expect(appendEvent(dir, "r1", "tool", {}, 2000).seq).toBe(1);
    expect(lockDirs(dir)).toEqual([]);
  });
  it("puts back a fresh lock that a slow breaker moved aside, and waits for its holder", async () => {
    const pid = await deadPid();
    const lock = path.join(dir, "lock");
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, "owner"), `${pid}:old`);
    _testHooks.beforeBreakRename = () => {
      _testHooks.beforeBreakRename = undefined;
      // Another acquirer breaks the stale lock and takes a fresh live one before our rename.
      fs.rmSync(lock, { recursive: true, force: true });
      fs.mkdirSync(lock);
      fs.writeFileSync(path.join(lock, "owner"), `${process.pid}:fresh`);
    };
    expect(() => appendEvent(dir, "r1", "tool", {}, 300)).toThrow(/lock timeout/);
    expect(fs.readFileSync(path.join(lock, "owner"), "utf8")).toBe(`${process.pid}:fresh`);
    expect(fs.existsSync(path.join(dir, "events.jsonl"))).toBe(false);
    expect(fs.readdirSync(dir).filter((n) => n.startsWith("lock.stale-"))).toEqual([]);
  });
  it("removes the lock it just made when the owner write fails", () => {
    _testHooks.beforeOwnerWrite = () => {
      throw new Error("ENOSPC");
    };
    expect(() => appendEvent(dir, "r1", "tool", {}, 300)).toThrow(/ENOSPC/);
    expect(fs.existsSync(path.join(dir, "lock"))).toBe(false);
  });
  it("aborts with lock lost, writing nothing, when the owner token changed before the write", () => {
    _testHooks.beforeOwnerCheck = () => fs.writeFileSync(path.join(dir, "lock", "owner"), "someone-else");
    expect(() => appendEvent(dir, "r1", "tool", {}, 300)).toThrow(/lock lost/);
    expect(fs.existsSync(path.join(dir, "seq"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "events.jsonl"))).toBe(false);
    expect(fs.readFileSync(path.join(dir, "lock", "owner"), "utf8")).toBe("someone-else");
  });
  it("sweeps lock.stale-* directories older than 30 s", () => {
    const old = path.join(dir, "lock.stale-1-aa");
    const young = path.join(dir, "lock.stale-1-bb");
    fs.mkdirSync(old);
    fs.mkdirSync(young);
    age(old, 31_000);
    appendEvent(dir, "r1", "tool", {}, 2000);
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(young)).toBe(true);
  });
});

describe("readEvents", () => {
  it("returns [] without a file and skips a line that does not parse", () => {
    expect(readEvents(dir)).toEqual([]);
    appendEvent(dir, "r1", "started", {}, 2000);
    fs.appendFileSync(path.join(dir, "events.jsonl"), "{broken\n");
    expect(readEvents(dir)).toHaveLength(1);
  });
});
