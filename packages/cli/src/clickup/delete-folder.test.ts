import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createDeleteFolderCommand } from "./delete-folder.ts";

function fake(lists: { id: string; name: string }[] = []) {
  const getFolderLists = vi.fn().mockResolvedValue(lists);
  const deleteFolder = vi.fn().mockResolvedValue(undefined);
  return { getFolderLists, deleteFolder } as unknown as ClickUpClient & {
    getFolderLists: ReturnType<typeof vi.fn>;
    deleteFolder: ReturnType<typeof vi.fn>;
  };
}
const run = (client: unknown, argv: object) =>
  (createDeleteFolderCommand(() => client as ClickUpClient).handler as (a: object) => Promise<void>)(argv);

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void err.push(a.join(" ")));
  return { out, err };
}

describe("delete-folder", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("dry run, empty folder: says it would delete, sends no DELETE, exit 0", async () => {
    const client = fake();
    const { out } = capture();
    await run(client, { folder: "55" });
    expect(client.getFolderLists).toHaveBeenCalledWith("55");
    expect(client.deleteFolder).not.toHaveBeenCalled();
    expect(out.join("\n")).toContain("would delete: folder 55 has no lists");
    expect(out.join("\n")).toContain("nothing sent");
    expect(process.exitCode).toBe(0);
  });

  it("dry run, folder with lists: prints the refusal, no DELETE, exit 0", async () => {
    const client = fake([{ id: "l1", name: "O.0: Pavilion" }]);
    const { out } = capture();
    await run(client, { folder: "55" });
    expect(client.deleteFolder).not.toHaveBeenCalled();
    expect(out.join("\n")).toContain("would refuse: folder 55 still holds 1 list(s)");
    expect(out.join("\n")).toContain("l1  O.0: Pavilion");
    expect(process.exitCode).toBe(0);
  });

  it("--yes, empty folder: deletes once, exit 0, points to get-lists", async () => {
    const client = fake();
    const { out } = capture();
    await run(client, { folder: "55", yes: true });
    expect(client.deleteFolder).toHaveBeenCalledTimes(1);
    expect(client.deleteFolder).toHaveBeenCalledWith("55");
    expect(out.join("\n")).toContain("get-lists");
    expect(process.exitCode).toBe(0);
  });

  it("--yes, folder with an active list: refuses, exit 1, no DELETE", async () => {
    const client = fake([{ id: "l1", name: "Active" }]);
    const { err } = capture();
    await run(client, { folder: "55", yes: true });
    expect(client.deleteFolder).not.toHaveBeenCalled();
    expect(err.join("\n")).toContain("l1  Active");
    expect(err.join("\n")).toContain("nothing deleted");
    expect(process.exitCode).toBe(1);
  });

  it("--yes, folder with only an archived list: refuses the same way", async () => {
    // getFolderLists merges archived lists, so an archived list arrives like any other
    const client = fake([{ id: "l9", name: "Old (archived)" }]);
    capture();
    await run(client, { folder: "55", yes: true });
    expect(client.deleteFolder).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("--yes, the read fails: exit 1, no DELETE", async () => {
    const client = fake();
    client.getFolderLists.mockRejectedValue(new Error("HTTP 404"));
    const { err } = capture();
    await run(client, { folder: "55", yes: true });
    expect(client.deleteFolder).not.toHaveBeenCalled();
    expect(err.join("\n")).toContain("HTTP 404");
    expect(process.exitCode).toBe(1);
  });

  it("--yes, the DELETE fails: exit 1 with the message", async () => {
    const client = fake();
    client.deleteFolder.mockRejectedValue(new Error("HTTP 500"));
    const { err } = capture();
    await run(client, { folder: "55", yes: true });
    expect(err.join("\n")).toContain("HTTP 500");
    expect(process.exitCode).toBe(1);
  });

  it.each(["abc", "", "12a"])("rejects --folder %j before any call", async (folder) => {
    const client = fake();
    const factory = vi.fn(() => client);
    const { err } = capture();
    await (createDeleteFolderCommand(factory as unknown as () => ClickUpClient).handler as (a: object) => Promise<void>)({
      folder,
      yes: true,
    });
    expect(factory).not.toHaveBeenCalled();
    expect(err.join("\n")).toContain("--folder must be a folder id");
    expect(process.exitCode).toBe(1);
  });
});
