import { describe, it, expect, vi, afterEach } from "vitest";
import type { Space } from "@digismith/clickup-client";
import { createCreateFolderCommand } from "./create-folder.ts";

describe("createCreateFolderCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("creates a folder in the DigiSmith space and prints it as JSON", async () => {
    const folder = { id: "f1", name: "W: New Clan" };
    const createFolder = vi.fn().mockResolvedValue(folder);
    const fakeSpace = { createFolder } as unknown as Space;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createCreateFolderCommand(() => fakeSpace);

    await (command.handler as (argv: { name: string }) => Promise<void>)({
      name: "W: New Clan",
    });

    expect(createFolder).toHaveBeenCalledWith("W: New Clan");
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(folder, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("errors and sets exitCode 1 when the space throws", async () => {
    const createFolder = vi.fn().mockRejectedValue(new Error("HTTP 400"));
    const fakeSpace = { createFolder } as unknown as Space;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createCreateFolderCommand(() => fakeSpace);

    await (command.handler as (argv: { name: string }) => Promise<void>)({
      name: "W: New Clan",
    });

    expect(errorSpy).toHaveBeenCalledWith("clickup create-folder: HTTP 400");
    expect(process.exitCode).toBe(1);
  });
});
