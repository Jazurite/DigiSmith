import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createUpdateFolderCommand } from "./update-folder.ts";

function fake(readBack = "A: Reactor") {
  const updateFolder = vi.fn().mockResolvedValue({ id: "1", name: "A: Reactor", hidden: false });
  const getFolder = vi.fn().mockResolvedValue({ id: "1", name: readBack, hidden: false });
  return { updateFolder, getFolder } as unknown as ClickUpClient & {
    updateFolder: ReturnType<typeof vi.fn>;
    getFolder: ReturnType<typeof vi.fn>;
  };
}
const run = (factory: () => unknown, argv: object) =>
  (createUpdateFolderCommand(factory as () => ClickUpClient).handler as (a: object) => Promise<void>)(argv);

describe("update-folder", () => {
  let out: string[];
  let err: string[];
  const capture = () => {
    out = [];
    err = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void err.push(a.join(" ")));
  };
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("dry run prints the call, builds no client and sends nothing", async () => {
    capture();
    const factory = vi.fn(() => {
      throw new Error("CLICKUP_API_TOKEN missing");
    });
    await run(factory, { folder: "1301150000001868", name: "A: Reactor" });
    expect(factory).not.toHaveBeenCalled();
    const text = out.join("\n");
    expect(text).toContain("PUT /folder/1301150000001868");
    expect(text).toContain('"name": "A: Reactor"');
    expect(text).toContain("nothing sent");
    expect(process.exitCode).toBe(0);
  });

  it.each(["", "   "])("refuses an empty or blank name (%j), dry run too", async (name) => {
    capture();
    const factory = vi.fn();
    await run(factory, { folder: "1", name });
    expect(factory).not.toHaveBeenCalled();
    expect(err.join("\n")).toContain("clickup update-folder: --name");
    expect(process.exitCode).toBe(1);
  });

  it("refuses a folder id that is not digits", async () => {
    capture();
    const factory = vi.fn();
    await run(factory, { folder: "abc", name: "X" });
    expect(factory).not.toHaveBeenCalled();
    expect(err.join("\n")).toContain("--folder must be a folder id");
    expect(process.exitCode).toBe(1);
  });

  it("--yes renames, reads back and prints the new name", async () => {
    capture();
    const client = fake();
    await run(() => client, { folder: "1", name: "A: Reactor", yes: true });
    expect(client.updateFolder).toHaveBeenCalledWith("1", "A: Reactor");
    expect(client.getFolder).toHaveBeenCalledWith("1");
    expect(out.join("\n")).toContain('renamed folder 1 to "A: Reactor"');
    expect(process.exitCode).toBe(0);
  });

  it("--yes exits 1 when the read-back name differs", async () => {
    capture();
    const client = fake("A: System");
    await run(() => client, { folder: "1", name: "A: Reactor", yes: true });
    expect(err.join("\n")).toContain('read back "A: System"');
    expect(process.exitCode).toBe(1);
  });

  it("sets exit code 1 when the API call fails", async () => {
    capture();
    const client = fake();
    client.updateFolder.mockRejectedValueOnce(new Error("404 not found"));
    await run(() => client, { folder: "1", name: "X", yes: true });
    expect(err.join("\n")).toContain("clickup update-folder: 404 not found");
    expect(client.getFolder).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
