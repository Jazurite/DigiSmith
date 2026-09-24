import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient, ClickUpFolderWithLists, ClickUpListSummary } from "@digismith/clickup-client";
import { createGetListsCommand } from "./get-lists.ts";

describe("createGetListsCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("prints combined folders and folderless lists as JSON on success", async () => {
    const folders = [{ id: "f1", name: "Weeks", lists: [] }] as unknown as ClickUpFolderWithLists[];
    const lists = [{ id: "l9", name: "Workflows" }] as unknown as ClickUpListSummary[];
    const getSpaceFolders = vi.fn().mockResolvedValue(folders);
    const getFolderlessLists = vi.fn().mockResolvedValue(lists);
    const fakeClient = { getSpaceFolders, getFolderlessLists } as unknown as ClickUpClient;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createGetListsCommand(() => fakeClient);

    await (command.handler as (argv: { space: string }) => Promise<void>)({ space: "90165960730" });

    expect(getSpaceFolders).toHaveBeenCalledWith("90165960730");
    expect(getFolderlessLists).toHaveBeenCalledWith("90165960730");
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ folders, lists }, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("errors and sets exitCode 1 when the client throws", async () => {
    const getSpaceFolders = vi.fn().mockRejectedValue(new Error("HTTP 403"));
    const getFolderlessLists = vi.fn().mockResolvedValue([]);
    const fakeClient = { getSpaceFolders, getFolderlessLists } as unknown as ClickUpClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createGetListsCommand(() => fakeClient);

    await (command.handler as (argv: { space: string }) => Promise<void>)({ space: "90165960730" });

    expect(errorSpy).toHaveBeenCalledWith("clickup get-lists: HTTP 403");
    expect(process.exitCode).toBe(1);
  });
});
