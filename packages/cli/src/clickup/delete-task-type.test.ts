import { describe, it, expect, vi, afterEach } from "vitest";
import type { FrontdoorClient, ClickUpClient } from "@digismith/clickup-client";
import { createDeleteTaskTypeCommand } from "./delete-task-type.ts";

const types = [
  { id: 1, name: "milestone", name_plural: null, description: null, avatar: null },
  { id: 1005, name: "Activity", name_plural: "Activities", description: null, avatar: null },
  { id: 1006, name: "Quest", name_plural: "Quests", description: null, avatar: null },
];
function fakes(count = 4) {
  const mergeTaskType = vi.fn().mockResolvedValue(undefined);
  const getTaskTypes = vi.fn().mockResolvedValue(types);
  const countTasksOfType = vi.fn().mockResolvedValue(count);
  return {
    fd: { mergeTaskType, getTaskTypes, teamId: "55" } as unknown as FrontdoorClient,
    pub: { countTasksOfType } as unknown as ClickUpClient,
    mergeTaskType,
  };
}
const run = (f: ReturnType<typeof fakes>, argv: object) =>
  (createDeleteTaskTypeCommand(() => f.fd, () => f.pub).handler as (a: object) => Promise<void>)(argv);

describe("delete-task-type", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("without --yes prints the task count and the target, then stops", async () => {
    const f = fakes(4);
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(f, { type: "activity", mergeInto: "quest" });
    expect(f.mergeTaskType).not.toHaveBeenCalled();
    const text = out.join("\n");
    expect(text).toContain("Activity (1005) has 4 tasks");
    expect(text).toContain("Quest (1006)");
    expect(text).toContain("--yes --confirm-count 4");
    expect(process.exitCode).toBe(0);
  });

  it("--yes with the right --confirm-count merges", async () => {
    const f = fakes(4);
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(f, { type: "activity", mergeInto: "quest", yes: true, confirmCount: 4 });
    expect(f.mergeTaskType).toHaveBeenCalledWith(1005, 1006);
  });

  it("--merge-into 0 names the plain task on purpose", async () => {
    const f = fakes(0);
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(f, { type: "activity", mergeInto: "0", yes: true, confirmCount: 0 });
    expect(f.mergeTaskType).toHaveBeenCalledWith(1005, 0);
  });

  it("refuses when --confirm-count is missing or stale", async () => {
    const f = fakes(5);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(f, { type: "activity", mergeInto: "quest", yes: true });
    await run(f, { type: "activity", mergeInto: "quest", yes: true, confirmCount: 4 });
    expect(f.mergeTaskType).not.toHaveBeenCalled();
    expect(err.mock.calls[1][0]).toMatch(/has 5 tasks, not 4/);
    expect(process.exitCode).toBe(1);
  });

  it("refuses a built-in type and a target equal to the type", async () => {
    const f = fakes();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(f, { type: "milestone", mergeInto: "0", yes: true, confirmCount: 0 });
    await run(f, { type: "activity", mergeInto: "activity", yes: true, confirmCount: 4 });
    expect(err.mock.calls[0][0]).toMatch(/built-in/);
    expect(err.mock.calls[1][0]).toMatch(/must differ/);
    expect(f.mergeTaskType).not.toHaveBeenCalled();
  });

  it("needs --merge-into", async () => {
    const f = fakes();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(f, { type: "activity" });
    expect(err.mock.calls[0][0]).toMatch(/--merge-into is required/);
    expect(process.exitCode).toBe(1);
  });
});
