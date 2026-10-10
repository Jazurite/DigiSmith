import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createMoveFolderCommand } from "./move-folder.ts";

function fake() {
  const moveFolder = vi.fn().mockResolvedValue(undefined);
  return { moveFolder } as unknown as ClickUpClient & { moveFolder: ReturnType<typeof vi.fn> };
}
const run = (client: unknown, argv: object) =>
  (createMoveFolderCommand(() => client as ClickUpClient).handler as (a: object) => Promise<void>)(argv);

describe("move-folder", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("dry run with --parent prints the call and sends nothing", async () => {
    const client = fake();
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(client, { folder: "1301150000002844", parent: "1301150000001850" });
    expect(client.moveFolder).not.toHaveBeenCalled();
    const text = out.join("\n");
    expect(text).toContain("PUT /folder/1301150000002844/position");
    expect(text).toContain('"parent_folder_id": "1301150000001850"');
    expect(text).not.toContain("position\":");
    expect(text).toContain("nothing sent");
    expect(process.exitCode).toBe(0);
  });

  it("dry run never builds the client, so it works without credentials", async () => {
    const factory = vi.fn(() => {
      throw new Error("CLICKUP_API_TOKEN missing");
    });
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await (createMoveFolderCommand(factory as unknown as () => ClickUpClient).handler as (a: object) => Promise<void>)({
      folder: "1",
      parent: "2",
    });
    expect(factory).not.toHaveBeenCalled();
    expect(out.join("\n")).toContain("PUT /folder/1/position");
    expect(process.exitCode).toBe(0);
  });

  it("dry run with --space prints space_id", async () => {
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(fake(), { folder: "1", space: "9" });
    expect(out.join("\n")).toContain('"space_id": "9"');
  });

  it("--yes --parent calls moveFolder with parentFolderId only", async () => {
    const client = fake();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { folder: "1301150000002844", parent: "1301150000001850", yes: true });
    expect(client.moveFolder).toHaveBeenCalledWith("1301150000002844", { parentFolderId: "1301150000001850" });
    expect(log.mock.calls.join("\n")).toContain("get-lists");
    expect(process.exitCode).toBe(0);
  });

  it("--yes --space calls moveFolder with spaceId", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { folder: "1", space: "9", yes: true });
    expect(client.moveFolder).toHaveBeenCalledWith("1", { spaceId: "9" });
  });

  it("--position goes through", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { folder: "1", parent: "2", position: 3, yes: true });
    expect(client.moveFolder).toHaveBeenCalledWith("1", { parentFolderId: "2", position: 3 });
  });

  it.each([
    [{ folder: "abc", parent: "2" }, /--folder must be a folder id/],
    [{ folder: "1", parent: "x/y" }, /--parent must be a folder id/],
    [{ folder: "1", space: "x" }, /--space must be a space id/],
    [{ folder: "1" }, /give --parent <folder id> or --space <space id>/],
    [{ folder: "1", parent: "2", space: "3" }, /--parent and --space cannot be used together/],
    [{ folder: "1", parent: "1" }, /cannot move a folder into itself/],
    [{ folder: "1", parent: "2", position: -1 }, /--position must be a whole number/],
    [{ folder: "1", parent: "none" }, /use --space <id>/],
  ])("rejects bad input %j and sends nothing", async (argv, message) => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { ...argv, yes: true });
    expect(client.moveFolder).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(message);
    expect(process.exitCode).toBe(1);
  });

  it("reports a failed call and exits 1", async () => {
    const client = fake();
    client.moveFolder.mockRejectedValueOnce(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { folder: "1", parent: "2", yes: true });
    expect(err.mock.calls[0][0]).toBe("clickup move-folder: boom");
    expect(process.exitCode).toBe(1);
  });
});
