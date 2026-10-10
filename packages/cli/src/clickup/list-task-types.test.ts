import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createListTaskTypesCommand } from "./list-task-types.ts";

describe("createListTaskTypesCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("prints id, name, plural and description of each type", async () => {
    const getTaskTypes = vi.fn().mockResolvedValue([
      { id: 1, name: "Milestone", name_plural: "Milestones", description: null, avatar: null },
      { id: 1030, name: "Epic", name_plural: "Epics", description: "A big thing", avatar: null },
    ]);
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    const command = createListTaskTypesCommand(() => ({ getTaskTypes }) as unknown as ClickUpClient);

    await (command.handler as () => Promise<void>)();

    expect(out[0]).toBe("0\tTask\tTasks\t");
    expect(out[1]).toBe("1\tMilestone\tMilestones\t");
    expect(out[2]).toBe("1030\tEpic\tEpics\tA big thing");
    expect(process.exitCode).toBe(0);
  });

  it("errors and sets exitCode 1 when the client throws", async () => {
    const getTaskTypes = vi.fn().mockRejectedValue(new Error("HTTP 401"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createListTaskTypesCommand(() => ({ getTaskTypes }) as unknown as ClickUpClient);
    await (command.handler as () => Promise<void>)();
    expect(err).toHaveBeenCalledWith("clickup list-task-types: HTTP 401");
    expect(process.exitCode).toBe(1);
  });
});
