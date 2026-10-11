import { describe, it, expect, vi, afterEach } from "vitest";
import type { FrontdoorClient, ClickUpClient } from "@digismith/clickup-client";
import { createUpdateTaskTypeCommand } from "./update-task-type.ts";

const types = [
  { id: 1, name: "milestone", name_plural: null, description: null, avatar: { source: null, value: null } },
  { id: 1005, name: "Activity", name_plural: "Activities", description: "Old", avatar: { source: "fas", value: "note-sticky" } },
  { id: 1006, name: "Quest", name_plural: "Quests", description: null, avatar: { source: "fas", value: "dragon" } },
];
function fake(list: unknown[] = types) {
  const updateTaskType = vi.fn().mockResolvedValue({ id: 1005 });
  const getTaskTypes = vi.fn().mockResolvedValue(list);
  const fd = { updateTaskType } as unknown as FrontdoorClient;
  const pub = { getTaskTypes } as unknown as ClickUpClient;
  return { fd, pub, updateTaskType, fdFactory: vi.fn(() => fd) };
}
const throwingFd = vi.fn((): FrontdoorClient => {
  throw new Error("CLICKUP_FRONTDOOR_AUTH is missing");
});
const run = (f: ReturnType<typeof fake>, argv: object, fdFactory: () => FrontdoorClient = f.fdFactory) =>
  (createUpdateTaskTypeCommand(fdFactory, () => f.pub, () => "55").handler as (a: object) => Promise<void>)(argv);

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
    await run(client, { type: "1005", description: "New" }, throwingFd);
    expect(throwingFd).not.toHaveBeenCalled();
    expect(client.updateTaskType).not.toHaveBeenCalled();
    expect(out.join("\n")).toContain("PUT /tasks/v1/55/customItem/1005");
    expect(out.join("\n")).toContain('"description": "New"');
  });

  it("--yes builds the Frontdoor client once", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { type: "activity", icon: "bolt", yes: true });
    expect(client.fdFactory).toHaveBeenCalledTimes(1);
  });

  it("--yes without a Frontdoor session: clear error, nothing sent", async () => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { type: "activity", icon: "bolt", yes: true }, throwingFd);
    expect(err.mock.calls[0][0]).toMatch(/clickup update-task-type: CLICKUP_FRONTDOOR_AUTH is missing/);
    expect(client.updateTaskType).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("sends the same body as the base commit (Frontdoor read) for the same public-read types", async () => {
    const client = fake([
      ...types,
      { id: 1007, name: "Bare", name_plural: null, description: null, avatar: null },
    ]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { type: "quest", name: "Quest2", yes: true });
    await run(client, { type: "bare", description: "D", yes: true });
    expect(client.updateTaskType).toHaveBeenNthCalledWith(1, 1006, {
      avatar_source: "fas", avatar_value: "dragon", description: "", name: "Quest2", name_plural: "Quests",
    });
    expect(client.updateTaskType).toHaveBeenNthCalledWith(2, 1007, {
      avatar_source: "fas", avatar_value: "user-alt", description: "D", name: "Bare", name_plural: "",
    });
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
