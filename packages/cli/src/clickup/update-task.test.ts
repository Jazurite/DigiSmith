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
});
