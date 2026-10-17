import { describe, it, expect, vi } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { ClickUpTracker } from "./clickup-tracker.ts";

function task(over: Record<string, unknown> = {}) {
  return {
    id: "abc", custom_id: "DGS-7", name: "n", url: "https://u", status: { status: "review" },
    start_date: null, due_date: null, list: { id: "L1", name: "B.5" },
    custom_fields: [{ name: "Sign-off", type: "drop_down", value: 0, type_config: { options: [{ name: "Auto", orderindex: 0 }, { name: "Jack", orderindex: 1 }] } }],
    ...over,
  };
}
function client(over: Record<string, unknown> = {}): ClickUpClient {
  return {
    getTaskByRef: vi.fn().mockResolvedValue(task()),
    getList: vi.fn().mockResolvedValue({ id: "L1", name: "B.5", statuses: [{ status: "review" }, { status: "done" }] }),
    updateTask: vi.fn().mockResolvedValue({}),
    addTaskComment: vi.fn().mockResolvedValue({}),
    getTaskTypes: vi.fn().mockResolvedValue([{ id: 1022, name: "Bug", name_plural: "Bugs", description: null, avatar: null }]),
    createTask: vi.fn().mockResolvedValue(task({ custom_id: "DGS-900", url: "https://new" })),
    getSpaceFolders: vi.fn().mockResolvedValue([{ id: "F1", name: "B: Agentic", lists: [{ id: "L1", name: "B.5: Autonomous Engineering" }] }]),
    getFolderlessLists: vi.fn().mockResolvedValue([]),
    searchTeamTasks: vi.fn().mockResolvedValue([task({ custom_id: "DGS-3", name: "Steward role keeps sync", status: { status: "refinement" }, list: { id: "L1", name: "B.5" } })]),
    ...over,
  } as unknown as ClickUpClient;
}

describe("getTicket", () => {
  it("reads status, the Sign-off name, dates in UTC+7 and the list statuses", async () => {
    const c = client({ getTaskByRef: vi.fn().mockResolvedValue(task({ start_date: String(Date.UTC(2026, 9, 17, 21, 0)), due_date: null })) });
    const t = await new ClickUpTracker(c, "S1").getTicket("DGS-7");
    expect(t).toEqual({ key: "DGS-7", status: "review", signoff: "Auto", startDate: "2026-10-18", dueDate: null, statuses: ["review", "done"] });
  });
  it("reads an unset or unknown Sign-off as null", async () => {
    const c = client({ getTaskByRef: vi.fn().mockResolvedValue(task({ custom_fields: [{ name: "Sign-off", type: "drop_down", type_config: { options: [] } }] })) });
    expect((await new ClickUpTracker(c, "S1").getTicket("DGS-7")).signoff).toBeNull();
    const d = client({ getTaskByRef: vi.fn().mockResolvedValue(task({ custom_fields: [] })) });
    expect((await new ClickUpTracker(d, "S1").getTicket("DGS-7")).signoff).toBeNull();
  });
});

describe("writes", () => {
  it("setStatus sends the status to the task id", async () => {
    const c = client();
    await new ClickUpTracker(c, "S1").setStatus("DGS-7", "done");
    expect(c.updateTask).toHaveBeenCalledWith("abc", { status: "done" });
  });
  it("setDates sends date-only values at 04:00 UTC+7", async () => {
    const c = client();
    await new ClickUpTracker(c, "S1").setDates("DGS-7", { start: "2026-10-17", due: "2026-10-18" });
    expect(c.updateTask).toHaveBeenCalledWith("abc", {
      start_date: Date.UTC(2026, 9, 16, 21, 0), start_date_time: false,
      due_date: Date.UTC(2026, 9, 17, 21, 0), due_date_time: false,
    });
  });
  it("addComment posts the text", async () => {
    const c = client();
    await new ClickUpTracker(c, "S1").addComment("DGS-7", "hi");
    expect(c.addTaskComment).toHaveBeenCalledWith("abc", "hi");
  });
});

describe("filing", () => {
  it("listTargets returns every list with its folder", async () => {
    expect(await new ClickUpTracker(client(), "S1").listTargets()).toEqual([
      { id: "L1", name: "B.5: Autonomous Engineering", folder: "B: Agentic", description: "" },
    ]);
  });
  it("findCandidates keeps the 10 best title matches", async () => {
    const found = await new ClickUpTracker(client(), "S1").findCandidates("steward role sync tickets");
    expect(found).toEqual([{ key: "DGS-3", name: "Steward role keeps sync", status: "refinement", list: "B.5" }]);
  });
  it("createTicket makes a backlog ticket with priority Normal and the resolved type", async () => {
    const c = client();
    const out = await new ClickUpTracker(c, "S1").createTicket({ listId: "L1", name: "Fix x", type: "Bug", description: "d" });
    expect(c.createTask).toHaveBeenCalledWith("L1", { name: "Fix x", description: "d", status: "backlog", priority: 3, custom_item_id: 1022 });
    expect(out).toEqual({ key: "DGS-900", url: "https://new" });
  });
  it("createTicket leaves custom_item_id off for the plain Task type and never sends an empty description", async () => {
    const c = client();
    await new ClickUpTracker(c, "S1").createTicket({ listId: "L1", name: "A", type: "Task" });
    expect(c.createTask).toHaveBeenCalledWith("L1", { name: "A", status: "backlog", priority: 3 });
  });
});
