import { describe, it, expect, vi, afterEach } from "vitest";
import type { FrontdoorClient, FrontdoorStatus } from "@digismith/clickup-client";
import { createRenameStatusCommand, planStatusRename } from "./rename-status.ts";

// The live DigiSmith space set (15 statuses); ids and colors invented.
const BEFORE: FrontdoorStatus[] = [
  { id: "d_00", status: "backlog", type: "open", orderindex: 0, color: "#87909e" },
  { id: "d_01", status: "scheduled", type: "unstarted", orderindex: 1, color: "#aa0001" },
  { id: "d_02", status: "to do", type: "unstarted", orderindex: 2, color: "#aa0002" },
  { id: "d_03", status: "ready", type: "unstarted", orderindex: 3, color: "#aa0003" },
  { id: "d_04", status: "concept", type: "custom", orderindex: 4, color: "#aa0004" },
  { id: "d_05", status: "discovery", type: "custom", orderindex: 5, color: "#aa0005" },
  { id: "d_06", status: "refinement", type: "custom", orderindex: 6, color: "#aa0006" },
  { id: "d_07", status: "in progress", type: "custom", orderindex: 7, color: "#aa0007" },
  { id: "d_08", status: "review", type: "custom", orderindex: 8, color: "#aa0008" },
  { id: "d_09", status: "acceptance", type: "custom", orderindex: 9, color: "#aa0009" },
  { id: "d_10", status: "release", type: "custom", orderindex: 10, color: "#aa0010" },
  { id: "d_11", status: "done", type: "done", orderindex: 11, color: "#aa0011" },
  { id: "d_12", status: "documented", type: "done", orderindex: 12, color: "#aa0012" },
  { id: "d_13", status: "discarded", type: "done", orderindex: 13, color: "#aa0013" },
  { id: "d_14", status: "Closed", type: "closed", orderindex: 14, color: "#aa0014" },
];

// Written out, not computed: ready -> claimed (custom), before "in progress".
const AFTER: FrontdoorStatus[] = [
  { id: "d_00", status: "backlog", type: "open", orderindex: 0, color: "#87909e" },
  { id: "d_01", status: "scheduled", type: "unstarted", orderindex: 1, color: "#aa0001" },
  { id: "d_02", status: "to do", type: "unstarted", orderindex: 2, color: "#aa0002" },
  { id: "d_04", status: "concept", type: "custom", orderindex: 3, color: "#aa0004" },
  { id: "d_05", status: "discovery", type: "custom", orderindex: 4, color: "#aa0005" },
  { id: "d_06", status: "refinement", type: "custom", orderindex: 5, color: "#aa0006" },
  { id: "d_03", status: "claimed", type: "custom", orderindex: 6, color: "#aa0003" },
  { id: "d_07", status: "in progress", type: "custom", orderindex: 7, color: "#aa0007" },
  { id: "d_08", status: "review", type: "custom", orderindex: 8, color: "#aa0008" },
  { id: "d_09", status: "acceptance", type: "custom", orderindex: 9, color: "#aa0009" },
  { id: "d_10", status: "release", type: "custom", orderindex: 10, color: "#aa0010" },
  { id: "d_11", status: "done", type: "done", orderindex: 11, color: "#aa0011" },
  { id: "d_12", status: "documented", type: "done", orderindex: 12, color: "#aa0012" },
  { id: "d_13", status: "discarded", type: "done", orderindex: 13, color: "#aa0013" },
  { id: "d_14", status: "Closed", type: "closed", orderindex: 14, color: "#aa0014" },
];

const forward = { from: "ready", to: "claimed", type: "custom", before: "in progress" };
const back = { from: "claimed", to: "ready", type: "unstarted", after: "to do" };

describe("planStatusRename", () => {
  it("renames ready to claimed and moves it before in progress: the exact set, ids kept, no status_change_map", () => {
    const body = planStatusRename(BEFORE, forward);
    expect(body).toEqual({ statuses: AFTER });
    expect(body).not.toHaveProperty("status_change_map");
  });

  it("the rollback call gives the before set back", () => {
    expect(planStatusRename(AFTER, back)).toEqual({ statuses: BEFORE });
  });

  it("renames in place without an anchor, keeping the type", () => {
    const body = planStatusRename(BEFORE, { from: "ready", to: "claimed" });
    expect(body.statuses).toEqual(BEFORE.map((s) => (s.id === "d_03" ? { ...s, status: "claimed" } : s)));
  });

  it("matches --from after trim, any case; a pure case rename is allowed", () => {
    expect(planStatusRename(BEFORE, { from: "  READY ", to: "claimed" }).statuses[3].status).toBe("claimed");
    expect(planStatusRename(BEFORE, { from: "ready", to: "Ready" }).statuses[3]).toEqual({ ...BEFORE[3], status: "Ready" });
  });

  it("does not change the input and keeps unknown fields", () => {
    const withExtra = BEFORE.map((s) => ({ ...s, extra: `x-${s.id}` }));
    const copy = structuredClone(withExtra);
    const body = planStatusRename(withExtra, forward);
    expect(withExtra).toEqual(copy);
    expect((body.statuses[6] as { extra?: string }).extra).toBe("x-d_03");
  });

  it("keeps the relative order of an unsorted read", () => {
    const shuffled = [BEFORE[5], BEFORE[14], BEFORE[3], BEFORE[0], ...BEFORE.slice(6, 14), BEFORE[1], BEFORE[4], BEFORE[2]];
    expect(planStatusRename(shuffled, forward)).toEqual({ statuses: AFTER });
  });

  it("refuses an unknown --from", () => {
    expect(() => planStatusRename(BEFORE, { ...forward, from: "nope" })).toThrow(/--from "nope"/);
  });

  it("refuses a --to that is another status, any case", () => {
    expect(() => planStatusRename(BEFORE, { ...forward, to: "Review" })).toThrow(/already exists/);
  });

  it("refuses an empty --to", () => {
    expect(() => planStatusRename(BEFORE, { ...forward, to: "  " })).toThrow(/--to/);
  });

  it("refuses an unknown anchor, listing the names, and both anchors, and the renamed status as its own anchor", () => {
    expect(() => planStatusRename(BEFORE, { ...forward, before: "nope" })).toThrow(/"nope".*backlog/);
    expect(() => planStatusRename(BEFORE, { ...forward, before: undefined, after: "nope" })).toThrow(/--after "nope"/);
    expect(() => planStatusRename(BEFORE, { ...forward, after: "concept" })).toThrow(/--after.*--before/);
    expect(() => planStatusRename(BEFORE, { ...forward, before: "ready" })).toThrow(/is not a status/);
  });

  it("refuses a type order break, naming the new neighbours", () => {
    expect(() => planStatusRename(BEFORE, { ...forward, before: "documented" })).toThrow(/"done" \(done\).*"documented" \(done\)/);
    expect(() => planStatusRename(BEFORE, { ...forward, type: "done" })).toThrow(/done status cannot go between/);
    expect(() => planStatusRename(BEFORE, { ...forward, before: "backlog" })).toThrow(/"backlog"/);
  });

  it("checks the order against the neighbours with the renamed status removed", () => {
    // ready sits between "to do" and "concept"; as custom in place it is fine, as done in place it is not
    expect(() => planStatusRename(BEFORE, { from: "ready", to: "claimed", type: "done" })).toThrow(/cannot go between/);
    expect(planStatusRename(BEFORE, { from: "ready", to: "claimed", type: "custom" }).statuses[3].type).toBe("custom");
  });

  it("refuses a bad type and a second open or closed status", () => {
    expect(() => planStatusRename(BEFORE, { ...forward, type: "weird" })).toThrow(/type/);
    expect(() => planStatusRename(BEFORE, { from: "ready", to: "x", type: "open" })).toThrow(/open/);
    expect(() => planStatusRename(BEFORE, { from: "ready", to: "x", type: "closed" })).toThrow(/closed/);
  });

  it("refuses an empty set, a status without id, a missing orderindex, a shared orderindex", () => {
    expect(() => planStatusRename([], forward)).toThrow(/empty/);
    expect(() => planStatusRename([{ ...BEFORE[0], id: undefined }, ...BEFORE.slice(1)], forward)).toThrow(/backlog.*no id/);
    expect(() => planStatusRename([{ ...BEFORE[0], orderindex: undefined as unknown as number }, ...BEFORE.slice(1)], forward)).toThrow(/orderindex/);
    expect(() => planStatusRename([BEFORE[0], { ...BEFORE[1], orderindex: 0 }, ...BEFORE.slice(2)], forward)).toThrow(/same orderindex/);
  });
});

describe("rename-status handler", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  function fake(after: FrontdoorStatus[] | Error = AFTER) {
    const getSpaceStatuses = vi.fn();
    getSpaceStatuses.mockResolvedValueOnce(BEFORE);
    if (after instanceof Error) getSpaceStatuses.mockRejectedValueOnce(after);
    else getSpaceStatuses.mockResolvedValueOnce(after);
    const putSpaceStatuses = vi.fn().mockResolvedValue(undefined);
    const fd = { getSpaceStatuses, putSpaceStatuses } as unknown as FrontdoorClient;
    return { getSpaceStatuses, putSpaceStatuses, factory: vi.fn(() => fd) };
  }
  const run = (f: ReturnType<typeof fake>, argv: object = {}) =>
    (createRenameStatusCommand(f.factory).handler as (a: object) => Promise<void>)({ space: "1", ...forward, ...argv });
  function capture() {
    const out: string[] = [];
    const err: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void err.push(a.join(" ")));
    return { out, err };
  }

  it("dry run reads the set, prints the planned set, sends nothing, exit 0", async () => {
    const f = fake();
    const { out } = capture();
    await run(f);
    expect(f.getSpaceStatuses).toHaveBeenCalledWith("1");
    expect(f.putSpaceStatuses).not.toHaveBeenCalled();
    const text = out.join("\n");
    expect(text).toContain("PUT /hierarchy/v1/project/1/status?checkConflict=true");
    expect(text).toMatch(/ 6 claimed\s+custom.*<- RENAMED/);
    expect(text).toContain("nothing sent; add --yes to send");
    expect(process.exitCode).toBe(0);
  });

  it("--yes prints the previous set, sends one PUT with the planned set, reads back, exit 0", async () => {
    const f = fake();
    const { out } = capture();
    await run(f, { yes: true });
    expect(f.putSpaceStatuses).toHaveBeenCalledTimes(1);
    expect(f.putSpaceStatuses).toHaveBeenCalledWith("1", { statuses: AFTER });
    expect(f.getSpaceStatuses).toHaveBeenCalledTimes(2);
    const text = out.join("\n");
    expect(text.indexOf("previous status set")).toBeLessThan(text.indexOf("status renamed: ready -> claimed"));
    expect(text).toMatch(/ 6 claimed\s+custom/);
    expect(process.exitCode).toBe(0);
  });

  it("a wrong read-back exits 1 and prints the previous set again", async () => {
    const wrongs: FrontdoorStatus[][] = [
      AFTER.map((s) => (s.id === "d_03" ? { ...s, status: "ready" } : s)),
      AFTER.map((s) => (s.id === "d_03" ? { ...s, orderindex: 3 } : s)),
      AFTER.map((s) => (s.id === "d_03" ? { ...s, type: "unstarted" } : s)),
      AFTER.map((s) => (s.id === "d_07" ? { ...s, color: "#000000" } : s)),
      AFTER.filter((s) => s.id !== "d_05"),
      [...AFTER, { id: "d_x", status: "stray", type: "custom", orderindex: 15, color: "#111111" }],
      AFTER.map((s) => (s.id === "d_05" ? { ...s, id: "d_other" } : s)),
    ];
    for (const wrong of wrongs) {
      const f = fake(wrong);
      const { out, err } = capture();
      await run(f, { yes: true });
      expect(process.exitCode).toBe(1);
      expect(err.join("\n")).toContain("THE STATUS SET IS NOT AS PLANNED");
      const text = out.join("\n");
      expect(text.split("previous status set").length - 1).toBe(2);
      for (const s of BEFORE) expect(text).toContain(s.id!);
      process.exitCode = 0;
      vi.restoreAllMocks();
    }
  });

  it("a failed read-back says the PUT WAS SENT and exits 1", async () => {
    const f = fake(new Error("socket hang up"));
    const { err } = capture();
    await run(f, { yes: true });
    expect(process.exitCode).toBe(1);
    expect(err.join("\n")).toMatch(/PUT WAS SENT, verification failed.*previous set above/);
  });

  it("a 4xx on the PUT prints the message plus re-run and verifies nothing", async () => {
    const f = fake();
    f.putSpaceStatuses.mockRejectedValueOnce(Object.assign(new Error("conflict"), { response: { status: 409 } }));
    const { err } = capture();
    await run(f, { yes: true });
    expect(process.exitCode).toBe(1);
    expect(err.join("\n")).toContain("clickup rename-status: conflict");
    expect(err.join("\n")).toContain("re-run to read the current set");
    expect(f.getSpaceStatuses).toHaveBeenCalledTimes(1);
  });

  it("a refused plan sends nothing, even with --yes", async () => {
    const f = fake();
    const { err } = capture();
    await run(f, { to: "review", yes: true });
    expect(process.exitCode).toBe(1);
    expect(err.join("\n")).toContain("clickup rename-status:");
    expect(f.putSpaceStatuses).not.toHaveBeenCalled();
  });

  it("refuses a --space that is not digits only, before any call", async () => {
    for (const space of ["1/../x", "", undefined, "abc"]) {
      const f = fake();
      const { err } = capture();
      await run(f, { space });
      expect(process.exitCode).toBe(1);
      expect(err.join("\n")).toMatch(/--space/);
      expect(f.factory).not.toHaveBeenCalled();
      process.exitCode = 0;
      vi.restoreAllMocks();
    }
  });
});
