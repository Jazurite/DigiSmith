import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient, ClickUpTask } from "@digismith/clickup-client";
import { createUpdateTaskCommand } from "./update-task.ts";

describe("createUpdateTaskCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("updates the given task and prints the result as JSON", async () => {
    const task = { id: "abc", status: { status: "done" } } as unknown as ClickUpTask;
    const updateTask = vi.fn().mockResolvedValue(task);
    const fakeClient = { updateTask } as unknown as ClickUpClient;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createUpdateTaskCommand(() => fakeClient);

    await (
      command.handler as (argv: { task: string; status?: string }) => Promise<void>
    )({ task: "abc", status: "done" });

    expect(updateTask).toHaveBeenCalledWith("abc", { status: "done" });
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(task, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("passes --parent through, and an empty value as none", async () => {
    const updateTask = vi.fn().mockResolvedValue({ id: "abc" });
    vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createUpdateTaskCommand(() => ({ updateTask }) as unknown as ClickUpClient);
    const handler = command.handler as (argv: { task: string; parent?: string }) => Promise<void>;

    await handler({ task: "abc", parent: "p1" });
    await handler({ task: "abc", parent: "" });

    expect(updateTask).toHaveBeenNthCalledWith(1, "abc", { parent: "p1" });
    expect(updateTask).toHaveBeenNthCalledWith(2, "abc", { parent: "none" });
  });

  it("errors and sets exitCode 1 when the client throws", async () => {
    const updateTask = vi.fn().mockRejectedValue(new Error("HTTP 404"));
    const fakeClient = { updateTask } as unknown as ClickUpClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createUpdateTaskCommand(() => fakeClient);

    await (command.handler as (argv: { task: string }) => Promise<void>)({ task: "abc" });

    expect(errorSpy).toHaveBeenCalledWith("clickup update-task: HTTP 404");
    expect(process.exitCode).toBe(1);
  });

  it("resolves --type by name and sends custom_item_id", async () => {
    const updateTask = vi.fn().mockResolvedValue({ id: "abc" });
    const getTaskTypes = vi.fn().mockResolvedValue([
      { id: 1030, name: "Epic", name_plural: "Epics", description: null, avatar: null },
    ]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createUpdateTaskCommand(() => ({ updateTask, getTaskTypes }) as unknown as ClickUpClient);

    await (command.handler as (argv: object) => Promise<void>)({ task: "abc", type: "epic" });

    expect(updateTask).toHaveBeenCalledWith("abc", { custom_item_id: 1030 });
  });

  it("errors without calling the API write when --type is unknown", async () => {
    const updateTask = vi.fn();
    const getTaskTypes = vi.fn().mockResolvedValue([]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createUpdateTaskCommand(() => ({ updateTask, getTaskTypes }) as unknown as ClickUpClient);

    await (command.handler as (argv: object) => Promise<void>)({ task: "abc", type: "saga" });

    expect(updateTask).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][0]).toMatch(/clickup update-task: unknown task type "saga"/);
    expect(process.exitCode).toBe(1);
  });

  describe("--field", () => {
    const fields = [
      { id: "f1", name: "ClickUp API Type", type: "drop_down", type_config: { options: [{ id: "o1", name: "Frontdoor" }] } },
    ];
    const mk = () => {
      const calls: string[] = [];
      const client = {
        get: vi.fn().mockImplementation(async () => ({ id: "abc", list: { id: "L" } })),
        getListFields: vi.fn().mockResolvedValue(fields),
        updateTask: vi.fn().mockImplementation(async () => { calls.push("put"); return { id: "abc" }; }),
        setCustomField: vi.fn().mockImplementation(async () => { calls.push("set"); }),
      };
      return { client, calls, handler: createUpdateTaskCommand(() => client as unknown as ClickUpClient).handler as (a: object) => Promise<void> };
    };

    it("sets the field on the task's list and skips the empty PUT", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const { client, handler } = mk();
      await handler({ task: "abc", field: ["ClickUp API Type=Frontdoor"] });
      expect(client.getListFields).toHaveBeenCalledWith("L");
      expect(client.updateTask).not.toHaveBeenCalled();
      expect(client.setCustomField).toHaveBeenCalledWith("abc", "f1", "o1");
      expect(process.exitCode).toBe(0);
    });

    it("puts the task flags first, then sets the fields", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const { calls, handler } = mk();
      await handler({ task: "abc", status: "done", field: ["f1=Frontdoor"] });
      expect(calls).toEqual(["put", "set"]);
    });

    it("writes nothing when a field is bad", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { client, handler } = mk();
      await handler({ task: "abc", status: "done", field: ["Nope=1"] });
      expect(client.updateTask).not.toHaveBeenCalled();
      expect(client.setCustomField).not.toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toMatch(/clickup update-task: unknown field "Nope"/);
      expect(process.exitCode).toBe(1);
    });
  });
});
