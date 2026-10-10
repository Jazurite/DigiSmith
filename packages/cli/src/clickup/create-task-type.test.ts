import { describe, it, expect, vi, afterEach } from "vitest";
import type { FrontdoorClient } from "@digismith/clickup-client";
import { createCreateTaskTypeCommand } from "./create-task-type.ts";

function fake(existing: unknown[] = []) {
  const createTaskType = vi.fn().mockResolvedValue({ id: 1030, name: "Epic" });
  const getTaskTypes = vi.fn().mockResolvedValue(existing);
  return { createTaskType, getTaskTypes, teamId: "55" } as unknown as FrontdoorClient & {
    createTaskType: ReturnType<typeof vi.fn>;
  };
}
const run = (client: unknown, argv: object) =>
  (createCreateTaskTypeCommand(() => client as FrontdoorClient).handler as (a: object) => Promise<void>)(argv);

describe("create-task-type", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("dry run by default: prints the call, sends nothing", async () => {
    const client = fake();
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(client, { name: "Epic", plural: "Epics", description: "Big work", icon: "bolt" });
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

  it("errors on an existing name even with --yes", async () => {
    const client = fake([{ id: 1005, name: "Epic", name_plural: "Epics", description: null, avatar: null }]);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { name: "epic", plural: "Epicz", yes: true });
    expect(client.createTaskType).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(/clickup create-task-type: "epic" is already used/);
    expect(process.exitCode).toBe(1);
  });
});
