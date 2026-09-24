import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient, ClickUpTask } from "@digismith/clickup-client";
import { createListTasksCommand } from "./list-tasks.ts";

describe("createListTasksCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("prints the task list as JSON on success", async () => {
    const tasks = [{ id: "1", name: "Breakfast" }] as unknown as ClickUpTask[];
    const getAllListTasks = vi.fn().mockResolvedValue(tasks);
    const fakeClient = { getAllListTasks } as unknown as ClickUpClient;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createListTasksCommand(() => fakeClient);

    await (command.handler as (argv: { list: string }) => Promise<void>)({ list: "901" });

    expect(getAllListTasks).toHaveBeenCalledWith("901");
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(tasks, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("errors and sets exitCode 1 when the client throws", async () => {
    const getAllListTasks = vi.fn().mockRejectedValue(new Error("HTTP 401"));
    const fakeClient = { getAllListTasks } as unknown as ClickUpClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createListTasksCommand(() => fakeClient);

    await (command.handler as (argv: { list: string }) => Promise<void>)({ list: "901" });

    expect(errorSpy).toHaveBeenCalledWith("clickup list-tasks: HTTP 401");
    expect(process.exitCode).toBe(1);
  });
});
