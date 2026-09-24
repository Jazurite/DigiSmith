import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient, ClickUpTask } from "@digismith/clickup-client";
import { createGetTaskCommand } from "./get-task.ts";

describe("createGetTaskCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("prints the task as JSON on success", async () => {
    const task = { id: "abc", name: "Breakfast" } as unknown as ClickUpTask;
    const get = vi.fn().mockResolvedValue(task);
    const fakeClient = { get } as unknown as ClickUpClient;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createGetTaskCommand(() => fakeClient);

    await (command.handler as (argv: { task: string }) => Promise<void>)({ task: "abc" });

    expect(get).toHaveBeenCalledWith("/task/abc");
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(task, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("errors and sets exitCode 1 when the client throws", async () => {
    const get = vi.fn().mockRejectedValue(new Error("HTTP 404"));
    const fakeClient = { get } as unknown as ClickUpClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createGetTaskCommand(() => fakeClient);

    await (command.handler as (argv: { task: string }) => Promise<void>)({ task: "abc" });

    expect(errorSpy).toHaveBeenCalledWith("clickup get-task: HTTP 404");
    expect(process.exitCode).toBe(1);
  });
});
