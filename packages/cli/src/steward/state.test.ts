import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { newState, readState, writeState, withLock, rebuildState, stewardDir } from "./state.ts";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "steward-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
const FAST = { waitMs: 150, staleMs: 60_000, pollMs: 10 };

describe("stewardDir", () => {
  it("is the steward folder of the depot, overridable", () => {
    expect(stewardDir({ DIGISMITH_DEPOT_DIR: "/d" })).toBe("/d/steward");
    expect(stewardDir({ DIGISMITH_STEWARD_DIR: "/s" })).toBe("/s");
  });
});

describe("state file", () => {
  it("writes and reads back", () => {
    const s = newState("DGS-1", "clickup");
    s.status_written = "review";
    writeState(dir, s);
    expect(readState(dir, "DGS-1")).toEqual(s);
    expect(fs.readdirSync(dir)).toEqual(["DGS-1.json"]);
  });
  it("returns null when there is no file", () => {
    expect(readState(dir, "DGS-2")).toBeNull();
  });
  it("moves an unreadable file aside and returns null", () => {
    fs.writeFileSync(path.join(dir, "DGS-3.json"), "{not json");
    expect(readState(dir, "DGS-3")).toBeNull();
    expect(fs.existsSync(path.join(dir, "DGS-3.json.bad"))).toBe(true);
  });
  it("moves a file with the wrong ticket or schema aside", () => {
    writeState(dir, { ...newState("DGS-9", "clickup") });
    fs.renameSync(path.join(dir, "DGS-9.json"), path.join(dir, "DGS-4.json"));
    expect(readState(dir, "DGS-4")).toBeNull();
    expect(fs.existsSync(path.join(dir, "DGS-4.json.bad"))).toBe(true);
  });
  it("refuses a key that is not a plain key", () => {
    expect(() => readState(dir, "../x")).toThrow(/invalid ticket key/);
  });
});

describe("withLock", () => {
  it("runs the function and frees the lock", async () => {
    const r = await withLock(dir, "DGS-5", async () => 7, FAST);
    expect(r).toEqual({ locked: true, value: 7 });
    expect(fs.existsSync(path.join(dir, "DGS-5.json.lock"))).toBe(false);
  });
  it("frees the lock when the function throws", async () => {
    await expect(withLock(dir, "DGS-5", async () => { throw new Error("x"); }, FAST)).rejects.toThrow("x");
    expect(fs.existsSync(path.join(dir, "DGS-5.json.lock"))).toBe(false);
  });
  it("gives up after the wait when another call holds the lock", async () => {
    fs.writeFileSync(path.join(dir, "DGS-6.json.lock"), "");
    expect(await withLock(dir, "DGS-6", async () => 1, FAST)).toEqual({ locked: false });
  });
  it("takes over a stale lock", async () => {
    const lock = path.join(dir, "DGS-7.json.lock");
    fs.writeFileSync(lock, "");
    const old = new Date(Date.now() - 120_000);
    fs.utimesSync(lock, old, old);
    expect(await withLock(dir, "DGS-7", async () => 2, FAST)).toEqual({ locked: true, value: 2 });
  });
  it("runs two calls one after the other", async () => {
    const order: string[] = [];
    const slow = withLock(dir, "DGS-8", async () => { order.push("a-in"); await new Promise((r) => setTimeout(r, 40)); order.push("a-out"); }, { ...FAST, waitMs: 2000 });
    const quick = withLock(dir, "DGS-8", async () => { order.push("b"); }, { ...FAST, waitMs: 2000 });
    await Promise.all([slow, quick]);
    expect(order).toEqual(["a-in", "a-out", "b"]);
  });
});

describe("withLock ownership", () => {
  it("a taken-over lock is not freed by the previous holder's finally", async () => {
    const lock = path.join(dir, "DGS-9.json.lock");
    await withLock(dir, "DGS-9", async () => {
      fs.writeFileSync(lock, "someone-else"); // a takeover replaced our lock
    }, FAST);
    expect(fs.readFileSync(lock, "utf-8")).toBe("someone-else");
  });
  it("two waiters on one stale lock do not both run at once", async () => {
    const lock = path.join(dir, "DGS-10.json.lock");
    fs.writeFileSync(lock, "dead");
    const old = new Date(Date.now() - 120_000);
    fs.utimesSync(lock, old, old);
    let inside = 0;
    let max = 0;
    let ran = 0;
    const body = async () => { inside += 1; max = Math.max(max, inside); ran += 1; await new Promise((r) => setTimeout(r, 30)); inside -= 1; };
    const opts = { ...FAST, waitMs: 2000 };
    await Promise.all([withLock(dir, "DGS-10", body, opts), withLock(dir, "DGS-10", body, opts), withLock(dir, "DGS-10", body, opts)]);
    expect(max).toBe(1);
    expect(ran).toBe(3);
    expect(fs.readdirSync(dir).filter((f) => f.includes("stale"))).toEqual([]);
  });
});

describe("a second corrupt file", () => {
  it("keeps both .bad files", () => {
    const file = path.join(dir, "DGS-11.json");
    fs.writeFileSync(file, "one");
    expect(readState(dir, "DGS-11")).toBeNull();
    fs.writeFileSync(file, "two");
    expect(readState(dir, "DGS-11")).toBeNull();
    const bads = fs.readdirSync(dir).filter((f) => f.startsWith("DGS-11.json.bad"));
    expect(bads).toHaveLength(2);
    expect(bads.map((f) => fs.readFileSync(path.join(dir, f), "utf-8")).sort()).toEqual(["one", "two"]);
  });
});

describe("rebuildState", () => {
  const snap = (status: string) => ({ status, signoff: "Jack" as const, startDate: "2026-10-01", dueDate: null });
  it("copies status, dates and mark from the tracker and the sessions from the registry", () => {
    const s = rebuildState("DGS-1", "clickup", snap("in progress"), ["s1"]);
    expect(s).toMatchObject({ status_written: "in progress", status_seen: "in progress", start_written: "2026-10-01", signoff: "Jack", sessions: ["s1"], merged: null });
  });
  it("marks the merge as rebuilt for a ticket past review", () => {
    expect(rebuildState("DGS-1", "clickup", snap("acceptance"), []).merged).toEqual({ sha: null, at: "rebuilt" });
  });
});
