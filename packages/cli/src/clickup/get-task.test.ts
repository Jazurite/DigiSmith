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

    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]).toEqual(["/task/abc"]);
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(task, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("asks for the Markdown description with --markdown", async () => {
    const get = vi.fn().mockResolvedValue({ id: "abc" });
    vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createGetTaskCommand(() => ({ get }) as unknown as ClickUpClient);

    await (command.handler as (argv: { task: string; markdown?: boolean }) => Promise<void>)({
      task: "abc",
      markdown: true,
    });

    expect(get).toHaveBeenCalledWith("/task/abc?include_markdown_description=true");
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

  it("looks a key up with getTaskByRef and no raw get", async () => {
    const task = { id: "14zcebru2pr" };
    const getTaskByRef = vi.fn().mockResolvedValue(task);
    const get = vi.fn();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createGetTaskCommand(() => ({ get, getTaskByRef }) as unknown as ClickUpClient);

    await (command.handler as (argv: { task: string }) => Promise<void>)({ task: "DGS-81" });

    expect(getTaskByRef).toHaveBeenCalledWith("DGS-81", undefined);
    expect(get).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(task, null, 2));
  });

  it("asks for the Markdown description with a key and --markdown", async () => {
    const getTaskByRef = vi.fn().mockResolvedValue({ id: "x" });
    vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createGetTaskCommand(() => ({ getTaskByRef }) as unknown as ClickUpClient);

    await (command.handler as (argv: { task: string; markdown?: boolean }) => Promise<void>)({ task: "DGS-81", markdown: true });

    expect(getTaskByRef).toHaveBeenCalledWith("DGS-81", { include_markdown_description: true });
  });
});
