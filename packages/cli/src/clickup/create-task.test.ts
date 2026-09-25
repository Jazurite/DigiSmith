import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient, ClickUpTask } from "@digismith/clickup-client";
import { createCreateTaskCommand } from "./create-task.ts";

describe("createCreateTaskCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("creates a task on the given list and prints it as JSON", async () => {
    const task = { id: "abc", name: "V.1" } as unknown as ClickUpTask;
    const createTask = vi.fn().mockResolvedValue(task);
    const fakeClient = { createTask } as unknown as ClickUpClient;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createCreateTaskCommand(() => fakeClient);

    await (
      command.handler as (argv: {
        list: string;
        name: string;
        status?: string;
      }) => Promise<void>
    )({ list: "901", name: "V.1", status: "done" });

    expect(createTask).toHaveBeenCalledWith("901", { name: "V.1", status: "done" });
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(task, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("errors and sets exitCode 1 when the client throws", async () => {
    const createTask = vi.fn().mockRejectedValue(new Error("HTTP 400"));
    const fakeClient = { createTask } as unknown as ClickUpClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createCreateTaskCommand(() => fakeClient);

    await (
      command.handler as (argv: { list: string; name: string }) => Promise<void>
    )({ list: "901", name: "V.1" });

    expect(errorSpy).toHaveBeenCalledWith("clickup create-task: HTTP 400");
    expect(process.exitCode).toBe(1);
  });
});
