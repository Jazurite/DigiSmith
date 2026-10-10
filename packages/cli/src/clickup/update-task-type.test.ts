import { describe, it, expect, vi, afterEach } from "vitest";
import type { FrontdoorClient } from "@digismith/clickup-client";
import { createUpdateTaskTypeCommand } from "./update-task-type.ts";

const types = [
  { id: 1, name: "milestone", name_plural: null, description: null, avatar: { source: null, value: null } },
  { id: 1005, name: "Activity", name_plural: "Activities", description: "Old", avatar: { source: "fas", value: "note-sticky" } },
  { id: 1006, name: "Quest", name_plural: "Quests", description: null, avatar: { source: "fas", value: "dragon" } },
];
function fake() {
  const updateTaskType = vi.fn().mockResolvedValue({ id: 1005 });
  const getTaskTypes = vi.fn().mockResolvedValue(types);
  return { updateTaskType, getTaskTypes, teamId: "55" } as unknown as FrontdoorClient & {
    updateTaskType: ReturnType<typeof vi.fn>;
  };
}
const run = (client: unknown, argv: object) =>
  (createUpdateTaskTypeCommand(() => client as FrontdoorClient).handler as (a: object) => Promise<void>)(argv);

describe("update-task-type", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("sends the full body: changed fields new, every other field its current value", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { type: "activity", icon: "bolt", yes: true });
    expect(client.updateTaskType).toHaveBeenCalledWith(1005, {
      avatar_source: "fas",
      avatar_value: "bolt",
      description: "Old",
      name: "Activity",
      name_plural: "Activities",
    });
  });

  it("dry run by default prints the call and sends nothing", async () => {
    const client = fake();
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(client, { type: "1005", description: "New" });
    expect(client.updateTaskType).not.toHaveBeenCalled();
    expect(out.join("\n")).toContain("PUT /tasks/v1/55/customItem/1005");
    expect(out.join("\n")).toContain('"description": "New"');
  });

  it("errors when the new name is another type's", async () => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { type: "activity", name: "quest", yes: true });
    expect(client.updateTaskType).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(/"quest" is already used by task type Quest \(1006\)/);
    expect(process.exitCode).toBe(1);
  });

  it("keeps the type's own name without a clash error", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { type: "activity", name: "Activity", yes: true });
    expect(client.updateTaskType).toHaveBeenCalled();
  });

  it("refuses a built-in type", async () => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { type: "milestone", name: "X", yes: true });
    expect(err.mock.calls[0][0]).toMatch(/built-in/);
    expect(process.exitCode).toBe(1);
  });

  it("errors when no field changes", async () => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { type: "activity", yes: true });
    expect(err.mock.calls[0][0]).toMatch(/nothing to change/);
    expect(process.exitCode).toBe(1);
  });
});
