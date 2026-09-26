import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient, Space } from "@digismith/clickup-client";
import { createCreateListCommand } from "./create-list.ts";

describe("createCreateListCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("creates a list inside the given folder when --folder is passed", async () => {
    const list = { id: "l1", name: "V.8" };
    const createListInFolder = vi.fn().mockResolvedValue(list);
    const fakeClient = { createListInFolder } as unknown as ClickUpClient;
    const spaceFactory = vi.fn();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createCreateListCommand(() => fakeClient, spaceFactory);

    await (
      command.handler as (argv: { name: string; folder?: string }) => Promise<void>
    )({ name: "V.8", folder: "f1" });

    expect(createListInFolder).toHaveBeenCalledWith("f1", "V.8");
    expect(spaceFactory).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(list, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("creates a folderless list in the DigiSmith space when --folder is omitted", async () => {
    const list = { id: "l2", name: "Pavilion 2" };
    const createList = vi.fn().mockResolvedValue(list);
    const fakeSpace = { createList } as unknown as Space;
    const clientFactory = vi.fn();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createCreateListCommand(clientFactory, () => fakeSpace);

    await (
      command.handler as (argv: { name: string; folder?: string }) => Promise<void>
    )({ name: "Pavilion 2" });

    expect(createList).toHaveBeenCalledWith("Pavilion 2");
    expect(clientFactory).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(list, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("errors and sets exitCode 1 when creation throws", async () => {
    const createListInFolder = vi.fn().mockRejectedValue(new Error("HTTP 404"));
    const fakeClient = { createListInFolder } as unknown as ClickUpClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createCreateListCommand(() => fakeClient, vi.fn());

    await (
      command.handler as (argv: { name: string; folder?: string }) => Promise<void>
    )({ name: "V.8", folder: "f1" });

    expect(errorSpy).toHaveBeenCalledWith("clickup create-list: HTTP 404");
    expect(process.exitCode).toBe(1);
  });
});
