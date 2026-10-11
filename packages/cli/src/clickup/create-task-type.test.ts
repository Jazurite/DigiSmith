import { describe, it, expect, vi, afterEach } from "vitest";
import type { FrontdoorClient, ClickUpClient } from "@digismith/clickup-client";
import { createCreateTaskTypeCommand } from "./create-task-type.ts";

function fake(existing: unknown[] = []) {
  const createTaskType = vi.fn().mockResolvedValue({ id: 1030, name: "Epic" });
  const getTaskTypes = vi.fn().mockResolvedValue(existing);
  const fd = { createTaskType } as unknown as FrontdoorClient;
  const pub = { getTaskTypes } as unknown as ClickUpClient;
  return { fd, pub, createTaskType, fdFactory: vi.fn(() => fd) };
}
const throwingFd = vi.fn((): FrontdoorClient => {
  throw new Error("CLICKUP_FRONTDOOR_AUTH is missing");
});
const run = (f: ReturnType<typeof fake>, argv: object, fdFactory: () => FrontdoorClient = f.fdFactory) =>
  (createCreateTaskTypeCommand(fdFactory, () => f.pub, () => "55").handler as (a: object) => Promise<void>)(argv);
describe("create-task-type", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("dry run by default: prints the call, sends nothing", async () => {
    const client = fake();
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(client, { name: "Epic", plural: "Epics", description: "Big work", icon: "bolt" }, throwingFd);
    expect(throwingFd).not.toHaveBeenCalled();
    expect(client.createTaskType).not.toHaveBeenCalled();
    const text = out.join("\n");
    expect(text).toContain("POST /tasks/v1/55/customItem");
    expect(text).toContain('"avatar_value": "bolt"');
    expect(text).toContain("nothing sent");
    expect(process.exitCode).toBe(0);
  });

  it("--yes sends the full body with the default icon and an empty description", async () => {
    const client = fake();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { name: "Epic", plural: "Epics", yes: true });
    expect(client.createTaskType).toHaveBeenCalledWith({
      avatar_source: "fas",
      avatar_value: "user-alt",
      description: "",
      name: "Epic",
      name_plural: "Epics",
    });
    expect(log).toHaveBeenCalledWith(JSON.stringify({ id: 1030, name: "Epic" }, null, 2));
  });

  it("--yes builds the Frontdoor client once, after the name check", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { name: "Epic", plural: "Epics", yes: true });
    expect(client.fdFactory).toHaveBeenCalledTimes(1);
  });

  it("--yes without a Frontdoor session: clear error, nothing sent", async () => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { name: "Epic", plural: "Epics", yes: true }, throwingFd);
    expect(err.mock.calls[0][0]).toMatch(/clickup create-task-type: CLICKUP_FRONTDOOR_AUTH is missing/);
    expect(client.createTaskType).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("sends the same body as the base commit (Frontdoor read) for the same input", async () => {
    const client = fake([{ id: 1005, name: "Activity", name_plural: "Activities", description: null, avatar: { source: "fas", value: "note-sticky" } }]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { name: "Epic", plural: "Epics", description: "Big work", icon: "bolt", yes: true });
    await run(client, { name: "Saga", plural: "Sagas", yes: true });
    expect(client.createTaskType).toHaveBeenNthCalledWith(1, {
      avatar_source: "fas", avatar_value: "bolt", description: "Big work", name: "Epic", name_plural: "Epics",
    });
    expect(client.createTaskType).toHaveBeenNthCalledWith(2, {
      avatar_source: "fas", avatar_value: "user-alt", description: "", name: "Saga", name_plural: "Sagas",
    });
  });

  it("errors on an existing name even with --yes", async () => {
    const client = fake([{ id: 1005, name: "Epic", name_plural: "Epics", description: null, avatar: null }]);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { name: "epic", plural: "Epicz", yes: true });
    expect(client.createTaskType).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(/clickup create-task-type: "epic" is already used/);
    expect(process.exitCode).toBe(1);
  });
});
