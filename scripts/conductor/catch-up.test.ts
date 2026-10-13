import { describe, it, expect } from "vitest";
import { buildCatchUp, catchUpMarker, readCatchUpBlock, type CatchUpDeps } from "./catch-up.ts";
import type { CatchUp } from "../catch-up.ts";
import { markerLines, type Marker } from "./state-block.ts";
import type { StatePart } from "./catch-up.ts";

const state: StatePart = {
  done: [{ key: "DGS-417", line: "card format merged" }],
  running: [], waiting: [], decided: [], parked: [], next: ["a"],
  health: { seats: [], server: "up", tabs: [] },
};

function fakeDeps(over: Partial<CatchUpDeps> & { note?: string } = {}) {
  const calls = { collect: 0, written: [] as { path: string; text: string; marker: Marker }[], rendered: [] as CatchUp[] };
  let note = over.note;
  const deps: CatchUpDeps = {
    listCards: () => [
      { id: "m1", session: "s-old", last_seen: "2026-10-13T12:00+07:00", status: "closed", domain: "DigiSmith" },
      { id: "m1", session: "s-me", last_seen: "2026-10-13T14:59+07:00", status: "open", domain: "DigiSmith" },
      { id: "m2", session: "x", last_seen: "2026-10-13T14:00+07:00", status: "open", domain: "DigiSmith" },
    ],
    collectState: async () => { calls.collect++; return state; },
    renderCatchUp: (d) => { calls.rendered.push(d); return `# Catch-up: ${d.conductor}\nWindow: ${d.window.from} to ${d.window.to}`; },
    resolveNotePath: () => "/depot/sessions/DigiSmith/c/note.md",
    readNote: () => note,
    writeStateBlock: (path, text, marker) => { calls.written.push({ path, text, marker }); const l = markerLines(marker); note = `${l.open}\n${text}\n${l.close}`; },
    clickup: async () => [],
    now: () => new Date("2026-10-13T08:00:00Z"),
    ...over,
  };
  return { deps, calls };
}
const opts = { project: "DigiSmith", conductor: "c", identity: "m1", session: "s-me", maxAgeMin: 30 };

describe("buildCatchUp", () => {
  it("builds a CatchUp from the state plus conductor, window, identity, askedBy and renders it", async () => {
    const { deps, calls } = fakeDeps();
    const r = await buildCatchUp(opts, deps);
    expect(calls.rendered[0]).toMatchObject({ conductor: "c", identity: "m1", askedBy: "s-me", window: { from: "2026-10-13T12:00+07:00", to: "2026-10-13T15:00+07:00" }, done: state.done });
    expect(r.reused).toBe(false);
    expect(r.text).toContain("Window: 2026-10-13T12:00+07:00 to 2026-10-13T15:00+07:00");
  });
  it("writes ONE block for the identity into the note, with Written: and the text", async () => {
    const { deps, calls } = fakeDeps();
    await buildCatchUp(opts, deps);
    expect(calls.written).toHaveLength(1);
    expect(calls.written[0].marker).toEqual(catchUpMarker("m1"));
    expect(calls.written[0].text.startsWith("Written: 2026-10-13T15:00+07:00\n")).toBe(true);
  });
  it("asks the state only for its window start (since)", async () => {
    let seen: unknown;
    const { deps } = fakeDeps({ collectState: async (o) => { seen = o; return state; } });
    await buildCatchUp(opts, deps);
    expect(seen).toMatchObject({ project: "DigiSmith", conductor: "c", since: "2026-10-13T12:00+07:00" });
  });
  it("reuses a fresh block of the same identity and collects nothing", async () => {
    const { deps, calls } = fakeDeps();
    await buildCatchUp(opts, deps); // writes the block at 15:00
    const again = await buildCatchUp(opts, { ...deps, now: () => new Date("2026-10-13T08:10:00Z") });
    expect(again.reused).toBe(true);
    expect(calls.collect).toBe(1);
    expect(again.text).toContain("from note");
    expect(again.text).toContain("# Catch-up: c");
  });
  it("collects again when the block is older than the max age, or with refresh", async () => {
    const { deps, calls } = fakeDeps();
    await buildCatchUp(opts, deps);
    const late = await buildCatchUp(opts, { ...deps, now: () => new Date("2026-10-13T08:31:00Z") });
    expect(late.reused).toBe(false);
    await buildCatchUp({ ...opts, refresh: true }, { ...deps, now: () => new Date("2026-10-13T08:32:00Z") });
    expect(calls.collect).toBe(3);
  });
  it("ignores another identity's block", async () => {
    const l2 = markerLines(catchUpMarker("m2"));
    const other = `${l2.open}\nWritten: 2026-10-13T14:59+07:00\nold\n${l2.close}`;
    const { deps, calls } = fakeDeps({ note: other });
    const r = await buildCatchUp(opts, deps);
    expect(r.reused).toBe(false);
    expect(calls.collect).toBe(1);
  });
  it("noWrite skips the note", async () => {
    const { deps, calls } = fakeDeps();
    await buildCatchUp({ ...opts, noWrite: true }, deps);
    expect(calls.written).toHaveLength(0);
  });
  it("a missing note still prints the catch-up and reports it, nothing written", async () => {
    const { deps } = fakeDeps({ resolveNotePath: () => undefined });
    const r = await buildCatchUp(opts, deps);
    expect(r.text).toContain("# Catch-up");
    expect(r.noteWritten).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/note/);
  });
  it("a failed note write still prints the catch-up", async () => {
    const { deps } = fakeDeps({ writeStateBlock: () => { throw new Error("disk full"); } });
    const r = await buildCatchUp(opts, deps);
    expect(r.noteWritten).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/disk full/);
  });
  it("never lists a card of another domain (cards come from the domain only)", async () => {
    let asked = "";
    const { deps } = fakeDeps({ listCards: (p) => { asked = p; return []; } });
    await buildCatchUp(opts, deps);
    expect(asked).toBe("DigiSmith");
  });
  it("adds ClickUp status to done lines and degrades softly to a Health note", async () => {
    const { deps, calls } = fakeDeps({ clickup: async () => [{ key: "DGS-417", status: "done" }, { key: "DGS-999", unresolved: true }] });
    await buildCatchUp({ ...opts, noWrite: true }, deps);
    const data = calls.rendered[0];
    expect(data.done[0].line).toContain("ClickUp: done");
    expect(data.health.server).toContain("ClickUp unresolved: DGS-999");
  });
  it("a throwing ClickUp reader gives a Health note, not a failure", async () => {
    const { deps, calls } = fakeDeps({ clickup: async () => { throw new Error("401"); } });
    await buildCatchUp({ ...opts, noWrite: true }, deps);
    expect(calls.rendered[0].health.server).toContain("ClickUp unreachable");
  });
});

describe("readCatchUpBlock", () => {
  it("returns the written time and text of the identity's block only", () => {
    const m = markerLines(catchUpMarker("m1"));
    const note = `top\n${m.open}\nWritten: 2026-10-13T15:00+07:00\nbody\nline2\n${m.close}\nbottom`;
    expect(readCatchUpBlock(note, "m1")).toEqual({ written: "2026-10-13T15:00+07:00", text: "body\nline2" });
    expect(readCatchUpBlock(note, "m2")).toBeUndefined();
  });
});

describe("buildCatchUp: the state block (DGS-462)", () => {
  it("refreshes the conductor's block before collecting, and not when it only reuses", async () => {
    const order: string[] = [];
    const { deps } = fakeDeps({
      refresh: async () => { order.push("refresh"); return ["herdr failed"]; },
      collectState: async () => { order.push("collect"); return state; },
    });
    const r = await buildCatchUp(opts, deps);
    expect(order).toEqual(["refresh", "collect"]);
    expect(r.warnings).toContain("state-refresh: herdr failed");
    await buildCatchUp(opts, { ...deps, now: () => new Date("2026-10-13T08:10:00Z") });
    expect(order).toEqual(["refresh", "collect"]); // reused: nothing ran
  });
  it("does not refresh with --no-write, and survives a failing refresh", async () => {
    let n = 0;
    const { deps } = fakeDeps({ refresh: async () => { n++; throw new Error("boom"); } });
    await buildCatchUp({ ...opts, noWrite: true }, deps);
    expect(n).toBe(0);
    const r = await buildCatchUp(opts, deps);
    expect(r.warnings).toContain("state-refresh failed: boom");
    expect(r.text).toContain("# Catch-up");
  });
  it("never reuses a catch-up written before the newest merge, but still reuses one written after it", async () => {
    const { deps, calls } = fakeDeps({ newestMergeTime: async () => "2026-10-13T14:30+07:00" });
    await buildCatchUp(opts, deps); // written 15:00
    const reused = await buildCatchUp(opts, { ...deps, now: () => new Date("2026-10-13T08:10:00Z") });
    expect(reused.reused).toBe(true);
    const merged = await buildCatchUp(opts, { ...deps, newestMergeTime: async () => "2026-10-13T15:05+07:00", now: () => new Date("2026-10-13T08:10:00Z") });
    expect(merged.reused).toBe(false);
    expect(calls.collect).toBe(2);
  });
  it("shows the block's age and says when it is older than the newest merge", async () => {
    const collect = (stale: boolean) => async () => ({ ...state, note: { updated: "2026-10-13T14:00+07:00", stale } });
    const { deps, calls } = fakeDeps({ collectState: collect(true) });
    await buildCatchUp({ ...opts, noWrite: true }, deps);
    expect(calls.rendered[0].health.server).toBe("up; state block updated 2026-10-13T14:00+07:00, 60 min old, OLDER than the newest merge");
    const f = fakeDeps({ collectState: collect(false) });
    await buildCatchUp({ ...opts, noWrite: true }, f.deps);
    expect(f.calls.rendered[0].health.server).toBe("up; state block updated 2026-10-13T14:00+07:00, 60 min old");
  });
});
