import { describe, it, expect, vi } from "vitest";
import type { ClickUpClient } from "./client.ts";
import type { ClickUpCreatedFolder, ClickUpListSummary } from "./types.ts";
import { Space } from "./space.ts";

describe("Space", () => {
  it("createFolder() delegates to the client with the bound space id", async () => {
    const folder: ClickUpCreatedFolder = { id: "f1", name: "New Folder", hidden: false };
    const createFolder = vi.fn().mockResolvedValue(folder);
    const fakeClient = { createFolder } as unknown as ClickUpClient;
    const space = new Space(fakeClient, "90165960730");

    const result = await space.createFolder("New Folder");

    expect(createFolder).toHaveBeenCalledWith("90165960730", "New Folder");
    expect(result).toBe(folder);
  });

  it("createList() delegates to createListInSpace with the bound space id", async () => {
    const list = { id: "l1", name: "New List" } as unknown as ClickUpListSummary;
    const createListInSpace = vi.fn().mockResolvedValue(list);
    const fakeClient = { createListInSpace } as unknown as ClickUpClient;
    const space = new Space(fakeClient, "90165960730");

    const result = await space.createList("New List");

    expect(createListInSpace).toHaveBeenCalledWith("90165960730", "New List");
    expect(result).toBe(list);
  });

  it("exposes the bound space id as a readonly property", () => {
    const space = new Space({} as ClickUpClient, "90165960730");

    expect(space.id).toBe("90165960730");
  });
});
