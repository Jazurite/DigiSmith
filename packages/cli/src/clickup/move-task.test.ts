import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createMoveTaskCommand } from "./move-task.ts";

type Argv = { task: string; list: string; statusMap?: string[]; moveCustomFields?: boolean };

function run(command: ReturnType<typeof createMoveTaskCommand>, argv: Argv): Promise<void> {
  return (command.handler as (argv: Argv) => Promise<void>)(argv);
}

describe("createMoveTaskCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("moves the task and prints the response as JSON", async () => {
    const response = { data: { task_id: "t1", new_list_id: "l1" } };
    const moveTask = vi.fn().mockResolvedValue(response);
    const fakeClient = { moveTask } as unknown as ClickUpClient;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createMoveTaskCommand(() => fakeClient);

    await run(command, { task: "t1", list: "l1" });

    expect(moveTask).toHaveBeenCalledWith("t1", "l1", {});
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(response, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("sends move_custom_fields: true only when --move-custom-fields is set", async () => {
    const moveTask = vi.fn().mockResolvedValue({});
    const fakeClient = { moveTask } as unknown as ClickUpClient;
    vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createMoveTaskCommand(() => fakeClient);

    await run(command, { task: "t1", list: "l1", moveCustomFields: true });
    expect(moveTask).toHaveBeenLastCalledWith("t1", "l1", { move_custom_fields: true });

    await run(command, { task: "t1", list: "l1", moveCustomFields: false });
    expect(moveTask).toHaveBeenLastCalledWith("t1", "l1", {});
  });

  it("parses repeated --status-map values into status_mappings", async () => {
    const moveTask = vi.fn().mockResolvedValue({});
    const fakeClient = { moveTask } as unknown as ClickUpClient;
    vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createMoveTaskCommand(() => fakeClient);

    await run(command, { task: "t1", list: "l1", statusMap: ["a=b", "c=d=e"] });

    expect(moveTask).toHaveBeenCalledWith("t1", "l1", {
      status_mappings: [
        { source_status: "a", destination_status: "b" },
        { source_status: "c", destination_status: "d=e" },
      ],
    });
  });

  it.each([
    ["an empty --task", { task: "", list: "l1" }, "--task needs a task ID"],
    ["a whitespace-only --task", { task: "  ", list: "l1" }, "--task needs a task ID"],
    ["an empty --list", { task: "t1", list: "" }, "--list needs a list ID"],
    ["a whitespace-only --list", { task: "t1", list: "  " }, "--list needs a list ID"],
    [
      "a --status-map with no =",
      { task: "t1", list: "l1", statusMap: ["abc"] },
      '--status-map "abc" must look like <sourceStatusId>=<destinationStatusId>',
    ],
    [
      "a --status-map with an empty source",
      { task: "t1", list: "l1", statusMap: ["=b"] },
      '--status-map "=b" must look like <sourceStatusId>=<destinationStatusId>',
    ],
    [
      "a --status-map with an empty destination",
      { task: "t1", list: "l1", statusMap: ["a="] },
      '--status-map "a=" must look like <sourceStatusId>=<destinationStatusId>',
    ],
  ] as [string, Argv, string][])(
    "rejects %s and does not call the client factory",
    async (_label, argv, message) => {
      const clientFactory = vi.fn();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const command = createMoveTaskCommand(clientFactory);

      await run(command, argv);

      expect(errorSpy).toHaveBeenCalledWith(`clickup move-task: ${message}`);
      expect(process.exitCode).toBe(1);
      expect(clientFactory).not.toHaveBeenCalled();
    },
  );

  it("errors and sets exitCode 1 when the move throws", async () => {
    const moveTask = vi.fn().mockRejectedValue(new Error("HTTP 400"));
    const fakeClient = { moveTask } as unknown as ClickUpClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createMoveTaskCommand(() => fakeClient);

    await run(command, { task: "t1", list: "l1" });

    expect(errorSpy).toHaveBeenCalledWith("clickup move-task: HTTP 400");
    expect(process.exitCode).toBe(1);
  });
});
