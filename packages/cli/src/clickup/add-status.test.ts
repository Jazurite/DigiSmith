import { describe, it, expect, vi, afterEach } from "vitest";
import type { FrontdoorClient, FrontdoorStatus } from "@digismith/clickup-client";
import { createAddStatusCommand, planStatusAdd } from "./add-status.ts";

// The nine statuses of the DigiSmith space (as the capture shows them), in order.
const current: FrontdoorStatus[] = [
  { id: "p1_a", status: "backlog", type: "open", orderindex: 0, color: "#87909e" },
  { id: "p1_b", status: "concept", type: "custom", orderindex: 1, color: "#f8ae00" },
  { id: "p1_c", status: "discovery", type: "custom", orderindex: 2, color: "#3db88b" },
  { id: "p1_d", status: "to do", type: "custom", orderindex: 3, color: "#d33d44" },
  { id: "p1_e", status: "in progress", type: "custom", orderindex: 4, color: "#1090e0" },
  { id: "p1_f", status: "review", type: "custom", orderindex: 5, color: "#5f55ee" },
  { id: "p1_g", status: "release", type: "custom", orderindex: 6, color: "#d33d44" },
  { id: "p1_h", status: "done", type: "done", orderindex: 7, color: "#008844" },
  { id: "p1_i", status: "documentation", type: "closed", orderindex: 8, color: "#008844" },
];
const add = { name: "discarded", type: "done", color: "#e5484d" };
const NEW = { status: "discarded", type: "done", orderindex: 8, color: "#e5484d" };
// What the PUT body must be, written out (not computed by planStatusAdd).
const PLANNED: FrontdoorStatus[] = [...current.slice(0, 8), NEW, { ...current[8], orderindex: 9 }];

describe("planStatusAdd", () => {
  it("keeps all 9 existing statuses as they are and inserts the new one, without id, before the closed one", () => {
    expect(planStatusAdd(current, add)).toEqual({ statuses: PLANNED });
  });

  it("sends no status_change_map on a pure add", () => {
    expect(planStatusAdd(current, add)).not.toHaveProperty("status_change_map");
  });

  it("puts the new status last when the set has no closed status", () => {
    const body = planStatusAdd(current.slice(0, 8), add);
    expect(body.statuses.map((s) => [s.status, s.orderindex]).slice(-2)).toEqual([["done", 7], ["discarded", 8]]);
    expect(body.statuses).toHaveLength(9);
  });

  it("does not change the input", () => {
    const copy = structuredClone(current);
    planStatusAdd(current, add);
    expect(current).toEqual(copy);
  });

  it("keeps the relative order of an unsorted read", () => {
    const shuffled = [current[3], current[8], current[0], current[5], current[1], current[7], current[2], current[6], current[4]];
    expect(planStatusAdd(shuffled, add)).toEqual({ statuses: PLANNED });
  });

  it("keeps fields it does not know (what the web app sent is sent back)", () => {
    const withExtra = current.map((s) => ({ ...s, extra: `x-${s.id}` }));
    const body = planStatusAdd(withExtra, add);
    expect(body.statuses.filter((s) => s.id).map((s) => (s as { extra?: string }).extra)).toEqual(withExtra.map((s) => s.extra));
  });

  it("refuses an empty set", () => {
    expect(() => planStatusAdd([], add)).toThrow(/empty/);
  });

  it("refuses a status without id, an orderindex that is missing, and two statuses with the same orderindex", () => {
    expect(() => planStatusAdd([{ ...current[0], id: undefined }, ...current.slice(1)], add)).toThrow(/no id.*backlog/);
    expect(() => planStatusAdd([{ ...current[0], orderindex: undefined as unknown as number }, ...current.slice(1)], add)).toThrow(/orderindex/);
    expect(() => planStatusAdd([current[0], { ...current[1], orderindex: 0 }, ...current.slice(2)], add)).toThrow(/same orderindex/);
  });

  it("refuses a name already in the set, any case", () => {
    expect(() => planStatusAdd(current, { ...add, name: "Concept" })).toThrow(/already/);
  });

  it("refuses an empty name, a bad type and a bad color", () => {
    expect(() => planStatusAdd(current, { ...add, name: "  " })).toThrow(/name/);
    expect(() => planStatusAdd(current, { ...add, type: "weird" })).toThrow(/type/);
    expect(() => planStatusAdd(current, { ...add, color: "red" })).toThrow(/color/);
  });

  it("refuses a second open or a second closed status", () => {
    expect(() => planStatusAdd(current, { ...add, type: "open" })).toThrow(/open/);
    expect(() => planStatusAdd(current, { ...add, type: "closed" })).toThrow(/closed/);
  });
});

/** The set as ClickUp would answer after a good PUT: the planned one, the new status with an id. */
const GOOD: FrontdoorStatus[] = PLANNED.map((s) => (s.id ? s : { ...s, id: "p1_new" }));

function fake(after: FrontdoorStatus[] | Error = GOOD) {
  const getSpaceStatuses = vi.fn();
  getSpaceStatuses.mockResolvedValueOnce(current);
  if (after instanceof Error) getSpaceStatuses.mockRejectedValueOnce(after);
  else getSpaceStatuses.mockResolvedValueOnce(after);
  const putSpaceStatuses = vi.fn().mockResolvedValue(undefined);
  const fd = { getSpaceStatuses, putSpaceStatuses } as unknown as FrontdoorClient;
  return { getSpaceStatuses, putSpaceStatuses, factory: vi.fn(() => fd) };
}
const run = (f: ReturnType<typeof fake>, argv: object) =>
  (createAddStatusCommand(f.factory).handler as (a: object) => Promise<void>)({ space: "1", ...add, ...argv });

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void err.push(a.join(" ")));
  return { out, err };
}

describe("add-status", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("dry run reads the set, sends no PUT, marks the new status, says where it goes and warns", async () => {
    const f = fake();
    const { out } = capture();
    await run(f, {});
    expect(f.getSpaceStatuses).toHaveBeenCalledWith("1");
    expect(f.putSpaceStatuses).not.toHaveBeenCalled();
    const text = out.join("\n");
    expect(text).toContain("PUT /hierarchy/v1/project/1/status?checkConflict=true");
    expect(text).toMatch(/discarded.*<- NEW/);
    expect(text).toContain("position: before the closed status");
    expect(text).toContain("a real add replaces the whole status set: needs Jack's yes");
    expect(process.exitCode).toBe(0);
  });

  it("dry run says the position is assumed for a custom status (the capture shows done only)", async () => {
    const f = fake();
    const { out } = capture();
    await run(f, { type: "custom" });
    expect(out.join("\n")).toContain("position: before the closed status (assumed");
  });

  it("--yes prints the previous set, sends one PUT with the literal full set, reads back and succeeds", async () => {
    const f = fake();
    const { out } = capture();
    await run(f, { yes: true });
    expect(f.putSpaceStatuses).toHaveBeenCalledTimes(1);
    expect(f.putSpaceStatuses).toHaveBeenCalledWith("1", { statuses: PLANNED });
    expect(f.getSpaceStatuses).toHaveBeenCalledTimes(2);
    const text = out.join("\n");
    expect(text).toContain("previous status set");
    for (const s of current) expect(text).toContain(s.id!);
    expect(text.indexOf("previous status set")).toBeLessThan(text.indexOf("status added"));
    expect(process.exitCode).toBe(0);
  });

  describe("verification after the PUT", () => {
    async function failed(after: FrontdoorStatus[]) {
      const f = fake(after);
      const { out, err } = capture();
      await run(f, { yes: true });
      expect(process.exitCode).toBe(1);
      return { err: err.join("\n"), out: out.join("\n") };
    }

    it("a lost status: exit 1, the message names it and the previous set is printed", async () => {
      const { err, out } = await failed(GOOD.filter((s) => s.status !== "concept"));
      expect(err).toMatch(/LOST.*concept.*p1_b/);
      expect(out).toContain("previous status set");
    });

    it("a changed name or type", async () => {
      const { err } = await failed(GOOD.map((s) => (s.id === "p1_e" ? { ...s, type: "done" } : s)));
      expect(err).toContain("in progress");
    });

    it("a changed colour", async () => {
      const { err } = await failed(GOOD.map((s) => (s.id === "p1_e" ? { ...s, color: "#000000" } : s)));
      expect(err).toMatch(/CHANGED.*in progress/);
    });

    it("a reorder", async () => {
      const { err } = await failed(GOOD.map((s) => (s.id === "p1_b" ? { ...s, orderindex: 5 } : s)));
      expect(err).toMatch(/CHANGED.*concept/);
    });

    it("an extra status", async () => {
      const { err } = await failed([...GOOD, { id: "p1_x", status: "stray", type: "custom", orderindex: 10, color: "#111111" }]);
      expect(err).toMatch(/count|stray/);
    });

    it("the new status missing, or with another colour", async () => {
      expect((await failed(current)).err).toContain("discarded");
      process.exitCode = 0;
      vi.restoreAllMocks();
      expect((await failed(GOOD.map((s) => (s.id === "p1_new" ? { ...s, color: "#123456" } : s)))).err).toContain("discarded");
    });
  });

  it("the PUT worked but the read-back failed: says the PUT WAS SENT and exits 1", async () => {
    const f = fake(new Error("socket hang up"));
    const { err } = capture();
    await run(f, { yes: true });
    expect(process.exitCode).toBe(1);
    expect(err.join("\n")).toMatch(/PUT WAS SENT, verification failed.*previous set above/);
  });

  it("a conflict (4xx) on the PUT prints ClickUp's message plus 're-run'; nothing is verified", async () => {
    const f = fake();
    f.putSpaceStatuses.mockRejectedValueOnce(Object.assign(new Error("Request failed: conflict"), { response: { status: 409 } }));
    const { err } = capture();
    await run(f, { yes: true });
    expect(process.exitCode).toBe(1);
    expect(err.join("\n")).toContain("clickup add-status: Request failed: conflict");
    expect(err.join("\n")).toContain("re-run to read the current set");
    expect(f.getSpaceStatuses).toHaveBeenCalledTimes(1);
  });

  it("an empty read (the client throws) sends nothing", async () => {
    const f = fake();
    f.getSpaceStatuses.mockReset().mockRejectedValueOnce(new Error("space 1 answered with no statuses"));
    const { err } = capture();
    await run(f, { yes: true });
    expect(process.exitCode).toBe(1);
    expect(err.join("\n")).toContain("no statuses");
    expect(f.putSpaceStatuses).not.toHaveBeenCalled();
  });

  it("refuses --folder and --list in the handler: only the space level is captured", async () => {
    for (const level of [{ folder: "9" }, { list: "9" }]) {
      const f = fake();
      const { err } = capture();
      await run(f, level);
      expect(process.exitCode).toBe(1);
      expect(err.join("\n")).toMatch(/capture/);
      expect(f.factory).not.toHaveBeenCalled();
      process.exitCode = 0;
      vi.restoreAllMocks();
    }
  });

  it("refuses a --space that is not digits only, before any call", async () => {
    for (const space of ["1/../x", "1?a=", "", undefined, "abc"]) {
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

  it("sends nothing when the plan is refused", async () => {
    const f = fake();
    capture();
    await run(f, { name: "done", yes: true });
    expect(process.exitCode).toBe(1);
    expect(f.putSpaceStatuses).not.toHaveBeenCalled();
  });
});
