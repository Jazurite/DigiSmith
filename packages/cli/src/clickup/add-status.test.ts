import { describe, it, expect, vi, afterEach } from "vitest";
import type { FrontdoorClient, FrontdoorStatus } from "@digismith/clickup-client";
import { createAddStatusCommand, planStatusAdd } from "./add-status.ts";

const current: FrontdoorStatus[] = [
  { id: "p1_a", status: "backlog", type: "open", orderindex: 0, color: "#87909e" },
  { id: "p1_b", status: "concept", type: "custom", orderindex: 1, color: "#f8ae00" },
  { id: "p1_c", status: "in progress", type: "custom", orderindex: 2, color: "#1090e0" },
  { id: "p1_d", status: "done", type: "done", orderindex: 3, color: "#008844" },
  { id: "p1_e", status: "archived", type: "closed", orderindex: 4, color: "#008844" },
];
const add = { name: "discarded", type: "done", color: "#e5484d" };

describe("planStatusAdd", () => {
  it("keeps every existing status as it is and inserts the new one, without id, before the closed one", () => {
    expect(planStatusAdd(current, add)).toEqual({
      statuses: [
        current[0],
        current[1],
        current[2],
        current[3],
        { status: "discarded", type: "done", orderindex: 4, color: "#e5484d" },
        { ...current[4], orderindex: 5 },
      ],
    });
  });

  it("sends no status_change_map on a pure add", () => {
    expect(planStatusAdd(current, add)).not.toHaveProperty("status_change_map");
  });

  it("puts the new status last when the set has no closed status", () => {
    const body = planStatusAdd(current.slice(0, 4), add);
    expect(body.statuses.map((s) => [s.status, s.orderindex])).toEqual([
      ["backlog", 0],
      ["concept", 1],
      ["in progress", 2],
      ["done", 3],
      ["discarded", 4],
    ]);
  });

  it("does not change the input", () => {
    const copy = structuredClone(current);
    planStatusAdd(current, add);
    expect(current).toEqual(copy);
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

function fake(after: FrontdoorStatus[] | "echo" = "echo") {
  const getSpaceStatuses = vi.fn().mockResolvedValueOnce(current);
  const putSpaceStatuses = vi.fn().mockResolvedValue(undefined);
  getSpaceStatuses.mockImplementation(async () => {
    if (getSpaceStatuses.mock.calls.length === 1) return current;
    if (after !== "echo") return after;
    return planStatusAdd(current, add).statuses.map((s, i) => (s.id ? s : { ...s, id: `p1_new${i}` }));
  });
  const fd = { getSpaceStatuses, putSpaceStatuses } as unknown as FrontdoorClient;
  return { getSpaceStatuses, putSpaceStatuses, factory: vi.fn(() => fd) };
}
const run = (f: ReturnType<typeof fake>, argv: object) =>
  (createAddStatusCommand(f.factory).handler as (a: object) => Promise<void>)({ space: "1", ...add, ...argv });

describe("add-status", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("dry run reads the set, sends no PUT, marks the new status and warns", async () => {
    const f = fake();
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(f, {});
    expect(f.getSpaceStatuses).toHaveBeenCalledWith("1");
    expect(f.putSpaceStatuses).not.toHaveBeenCalled();
    const text = out.join("\n");
    expect(text).toContain("PUT /hierarchy/v1/project/1/status?checkConflict=true");
    expect(text).toMatch(/discarded.*<- NEW/);
    expect(text).toContain("a real add replaces the whole status set: needs Jack's yes");
    expect(process.exitCode).toBe(0);
  });

  it("--yes prints the previous set, sends one PUT with the full set, then verifies", async () => {
    const f = fake();
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(f, { yes: true });
    expect(f.putSpaceStatuses).toHaveBeenCalledTimes(1);
    expect(f.putSpaceStatuses).toHaveBeenCalledWith("1", planStatusAdd(current, add));
    expect(f.getSpaceStatuses).toHaveBeenCalledTimes(2);
    const text = out.join("\n");
    expect(text).toContain("previous status set");
    for (const s of current) expect(text).toContain(s.id!);
    expect(text.indexOf("previous status set")).toBeLessThan(text.indexOf("status added"));
    expect(process.exitCode).toBe(0);
  });

  it("exits 1 and names the status when the set read after the PUT lost one", async () => {
    const f = fake(current.filter((s) => s.status !== "concept"));
    const err: string[] = [];
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void err.push(a.join(" ")));
    await run(f, { yes: true });
    expect(process.exitCode).toBe(1);
    expect(err.join("\n")).toMatch(/concept.*p1_b/);
  });

  it("exits 1 when a status changed its name or type after the PUT", async () => {
    const f = fake(current.map((s) => (s.id === "p1_c" ? { ...s, type: "done" } : s)));
    const err: string[] = [];
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void err.push(a.join(" ")));
    await run(f, { yes: true });
    expect(process.exitCode).toBe(1);
    expect(err.join("\n")).toContain("in progress");
  });

  it("exits 1 when the new status is not in the set after the PUT", async () => {
    const f = fake(current);
    const err: string[] = [];
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void err.push(a.join(" ")));
    await run(f, { yes: true });
    expect(process.exitCode).toBe(1);
    expect(err.join("\n")).toContain("discarded");
  });

  it("prints ClickUp's error and exits 1 when the PUT fails (a conflict)", async () => {
    const f = fake();
    f.putSpaceStatuses.mockRejectedValueOnce(new Error("Request failed: conflict"));
    const err: string[] = [];
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void err.push(a.join(" ")));
    await run(f, { yes: true });
    expect(process.exitCode).toBe(1);
    expect(err.join("\n")).toContain("clickup add-status: Request failed: conflict");
    expect(f.getSpaceStatuses).toHaveBeenCalledTimes(1);
  });

  it("refuses --folder and --list: only the space level is captured", async () => {
    for (const level of [{ folder: "9" }, { list: "9" }]) {
      const f = fake();
      const err: string[] = [];
      vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void err.push(a.join(" ")));
      await run(f, level);
      expect(process.exitCode).toBe(1);
      expect(err.join("\n")).toMatch(/capture/);
      expect(f.factory).not.toHaveBeenCalled();
      process.exitCode = 0;
    }
  });

  it("sends nothing when the plan is refused", async () => {
    const f = fake();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await run(f, { name: "done", yes: true });
    expect(process.exitCode).toBe(1);
    expect(f.putSpaceStatuses).not.toHaveBeenCalled();
  });
});
