import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient, Space } from "@digismith/clickup-client";
import { createCreateFolderCommand } from "./create-folder.ts";
import { handlerOf } from "./handler-of.test-util.ts";

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

    await handlerOf<{ name: string }>(command)({
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

    await handlerOf<{ name: string }>(command)({
      name: "W: New Clan",
    });

    expect(errorSpy).toHaveBeenCalledWith("clickup create-folder: HTTP 400");
    expect(process.exitCode).toBe(1);
  });
});

describe("createCreateFolderCommand --parent-folder", () => {
  type Argv = { name: string; parentFolder?: string; yes?: boolean };
  const PARENT = "1301150000001850";
  const run = (cmd: ReturnType<typeof createCreateFolderCommand>, argv: Argv) =>
    (cmd.handler as (a: Argv) => Promise<void>)(argv);
  const fakeClient = (over: Record<string, unknown> = {}) =>
    ({
      createFolder: vi.fn().mockResolvedValue({ id: "f9", name: "X: New", hidden: false }),
      moveFolder: vi.fn().mockResolvedValue(undefined),
      getFolder: vi.fn().mockResolvedValue({ id: "f9", name: "X: New", parent_folder: { id: PARENT, name: "Clans" } }),
      ...over,
    }) as unknown as ClickUpClient & Record<"createFolder" | "moveFolder" | "getFolder", ReturnType<typeof vi.fn>>;
  const noSpace = () => {
    throw new Error("space factory must not be called");
  };
  const out = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.map((c) => String(c[0])).join("\n");

  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("dry run builds no client and prints both calls with an obvious placeholder", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const factory = vi.fn(() => {
      throw new Error("no client in a dry run");
    });
    await run(createCreateFolderCommand(noSpace, factory), { name: "X: New", parentFolder: PARENT });
    expect(factory).not.toHaveBeenCalled();
    const text = out(logSpy);
    expect(text).toContain("POST /space/1301150000001271/folder");
    expect(text).toContain('"name": "X: New"');
    expect(text).toContain("PUT /folder/<new folder id>/position");
    expect(text).toContain(`"parent_folder_id": "${PARENT}"`);
    expect(text).toContain("nothing sent; add --yes to send");
    expect(process.exitCode).toBe(0);
  });

  it("--yes creates, moves, reads back and prints the parent", async () => {
    const client = fakeClient();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createCreateFolderCommand(noSpace, () => client), { name: "X: New", parentFolder: PARENT, yes: true });
    expect(client.createFolder).toHaveBeenCalledWith("1301150000001271", "X: New");
    expect(client.moveFolder).toHaveBeenCalledWith("f9", { parentFolderId: PARENT });
    expect(client.getFolder).toHaveBeenCalledWith("f9");
    const text = out(logSpy);
    expect(text).toContain(`created folder f9 "X: New" inside folder ${PARENT}`);
    expect(text).toContain("Clans");
    expect(process.exitCode).toBe(0);
  });

  it("create ok + move fails: exit 1, prints id, name and the exact finishing command, no read-back", async () => {
    const client = fakeClient({ moveFolder: vi.fn().mockRejectedValue(new Error("HTTP 500")) });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createCreateFolderCommand(noSpace, () => client), { name: "X: New", parentFolder: PARENT, yes: true });
    const text = out(errSpy);
    expect(text).toContain("clickup create-folder: HTTP 500");
    expect(text).toContain('folder f9 "X: New" was created at the top level');
    expect(text).toContain("nothing was deleted");
    expect(text).toContain(`dg clickup move-folder --folder f9 --parent ${PARENT} --yes`);
    expect(client.getFolder).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("create fails: no move, exit 1", async () => {
    const client = fakeClient({ createFolder: vi.fn().mockRejectedValue(new Error("HTTP 400")) });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createCreateFolderCommand(noSpace, () => client), { name: "X: New", parentFolder: PARENT, yes: true });
    expect(client.moveFolder).not.toHaveBeenCalled();
    expect(out(errSpy)).toBe("clickup create-folder: HTTP 400");
    expect(process.exitCode).toBe(1);
  });

  it("both ok but read-back fails: exit 0 with a note", async () => {
    const client = fakeClient({ getFolder: vi.fn().mockRejectedValue(new Error("HTTP 502")) });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createCreateFolderCommand(noSpace, () => client), { name: "X: New", parentFolder: PARENT, yes: true });
    expect(out(logSpy)).toContain("read-back failed: HTTP 502");
    expect(process.exitCode).toBe(0);
  });

  it("rejects a non-numeric --parent-folder before any call", async () => {
    const factory = vi.fn();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createCreateFolderCommand(noSpace, factory as unknown as () => ClickUpClient), { name: "X", parentFolder: "Clans" });
    expect(out(errSpy)).toContain("--parent-folder must be a folder id (digits only)");
    expect(factory).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("rejects --yes without --parent-folder before any call", async () => {
    const factory = vi.fn();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createCreateFolderCommand(noSpace, factory as unknown as () => ClickUpClient), { name: "X", yes: true });
    expect(out(errSpy)).toContain("--yes needs --parent-folder");
    expect(factory).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it.each(["", "   "])("rejects an empty name %j, in a dry run too, before any call", async (name) => {
    const factory = vi.fn();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createCreateFolderCommand(noSpace, factory as unknown as () => ClickUpClient), { name, parentFolder: PARENT });
    expect(out(errSpy)).toContain("--name needs a non-empty name");
    expect(logSpy).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("create answers no id: stops before the move and names the folder", async () => {
    const client = fakeClient({ createFolder: vi.fn().mockResolvedValue({ name: "X: New" }) });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createCreateFolderCommand(noSpace, () => client), { name: "X: New", parentFolder: PARENT, yes: true });
    expect(client.moveFolder).not.toHaveBeenCalled();
    expect(out(errSpy)).toContain('folder "X: New" was created but the response has no id: check dg clickup get-lists');
    expect(process.exitCode).toBe(1);
  });

  it("read-back shows another parent: MISMATCH warning with the finishing command, exit 1", async () => {
    const client = fakeClient({ getFolder: vi.fn().mockResolvedValue({ id: "f9", parent_folder: { id: "777", name: "Other" } }) });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createCreateFolderCommand(noSpace, () => client), { name: "X: New", parentFolder: PARENT, yes: true });
    const text = out(errSpy);
    expect(text).toContain(`MISMATCH: folder f9 "X: New" is in folder 777, not ${PARENT}`);
    expect(text).toContain(`dg clickup move-folder --folder f9 --parent ${PARENT} --yes`);
    expect(out(logSpy)).not.toContain("inside folder");
    expect(process.exitCode).toBe(1);
  });

  it("read-back has no parent: says 'not confirmed', never 'inside'", async () => {
    const client = fakeClient({ getFolder: vi.fn().mockResolvedValue({ id: "f9", parent_folder: null }) });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createCreateFolderCommand(noSpace, () => client), { name: "X: New", parentFolder: PARENT, yes: true });
    const text = out(logSpy);
    expect(text).toContain("parent not confirmed");
    expect(text).not.toContain("inside folder");
    expect(process.exitCode).toBe(0);
  });
});
