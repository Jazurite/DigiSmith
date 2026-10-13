import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import type { FrontdoorClient } from "@digismith/clickup-client";
import { createUpdateFolderCommand } from "./update-folder.ts";

function fake(readBack = "A: Reactor") {
  const updateFolder = vi.fn().mockResolvedValue({ id: "1", name: "A: Reactor", hidden: false });
  const getFolder = vi.fn().mockResolvedValue({ id: "1", name: readBack, hidden: false });
  return { updateFolder, getFolder } as unknown as ClickUpClient & {
    updateFolder: ReturnType<typeof vi.fn>;
    getFolder: ReturnType<typeof vi.fn>;
  };
}
function fakeFd(readBack = "Reactor text\n") {
  const setFolderDescription = vi.fn().mockResolvedValue(undefined);
  const getFolderDescription = vi.fn().mockResolvedValue(readBack);
  return { setFolderDescription, getFolderDescription } as unknown as FrontdoorClient & {
    setFolderDescription: ReturnType<typeof vi.fn>;
    getFolderDescription: ReturnType<typeof vi.fn>;
  };
}
const run = (factory: () => unknown, argv: object, fd: () => unknown = vi.fn(), read?: (p: string) => string) =>
  (createUpdateFolderCommand(factory as () => ClickUpClient, fd as () => FrontdoorClient, read).handler as (a: object) => Promise<void>)(argv);

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

  it("trims edge whitespace: sends the trimmed name and accepts the read-back", async () => {
    capture();
    const client = fake();
    await run(() => client, { folder: "1", name: "A: Reactor ", yes: true });
    expect(client.updateFolder).toHaveBeenCalledWith("1", "A: Reactor");
    expect(process.exitCode).toBe(0);
  });

  it("dry run shows the trimmed name", async () => {
    capture();
    await run(vi.fn(), { folder: "1", name: "  A: Reactor " });
    expect(out.join("\n")).toContain('"name": "A: Reactor"');
  });

  it("handles a unicode name", async () => {
    capture();
    const client = fake("Lò phản ứng ⚛");
    await run(() => client, { folder: "1", name: "Lò phản ứng ⚛", yes: true });
    expect(client.updateFolder).toHaveBeenCalledWith("1", "Lò phản ứng ⚛");
    expect(process.exitCode).toBe(0);
  });

  it("exits 1 with 'no name in the response' when the GET answer has no name", async () => {
    capture();
    const client = fake();
    client.getFolder.mockResolvedValueOnce({ id: "1" });
    await run(() => client, { folder: "1", name: "A: Reactor", yes: true });
    expect(err.join("\n")).toContain("no name in the response");
    expect(err.join("\n")).not.toContain("undefined");
    expect(process.exitCode).toBe(1);
  });

  describe("repeated flags and CRLF", () => {
    it.each([
      ["description", { description: ["a", "b"] }],
      ["description-file", { descriptionFile: ["a.txt", "b.txt"] }],
      ["name", { name: ["A", "B"] }],
    ])("refuses --%s given twice", async (flag, extra) => {
      capture();
      await run(vi.fn(), { folder: "1", ...extra });
      expect(err.join("\n")).toContain(`--${flag} was given more than once`);
      expect(process.exitCode).toBe(1);
    });

    it("turns CRLF into LF before sending and comparing", async () => {
      capture();
      const fd = fakeFd("a\nb\n");
      await run(() => fake(), { folder: "1", description: "a\r\nb", yes: true }, () => fd);
      expect(fd.setFolderDescription).toHaveBeenCalledWith("1", "a\nb");
      expect(process.exitCode).toBe(0);
    });
  });

  describe("--description", () => {
    it("dry run prints the Frontdoor call with the delta, builds no client, sends nothing", async () => {
      capture();
      const factory = vi.fn();
      const fdFactory = vi.fn();
      await run(factory, { folder: "1301150000001868", description: "Reactor text" }, fdFactory);
      expect(factory).not.toHaveBeenCalled();
      expect(fdFactory).not.toHaveBeenCalled();
      const text = out.join("\n");
      expect(text).toContain("PUT /hierarchy/v1/category/1301150000001868");
      expect(text).toContain('"content"');
      expect(text).toContain("Reactor text");
      expect(text).not.toContain("PUT /folder/");
      expect(text).toContain("nothing sent");
      expect(process.exitCode).toBe(0);
    });

    it("--yes sets the description through Frontdoor, reads back and prints a line", async () => {
      capture();
      const client = fake();
      const fd = fakeFd("Reactor text\n");
      await run(() => client, { folder: "1", description: "Reactor text", yes: true }, () => fd);
      expect(fd.setFolderDescription).toHaveBeenCalledWith("1", "Reactor text");
      expect(fd.getFolderDescription).toHaveBeenCalledWith("1");
      expect(client.updateFolder).not.toHaveBeenCalled();
      expect(out.join("\n")).toContain("set the description of folder 1");
      expect(process.exitCode).toBe(0);
    });

    it("--yes exits 1 when the read-back text differs", async () => {
      capture();
      const fd = fakeFd("Something else\n");
      await run(() => fake(), { folder: "1", description: "Reactor text", yes: true }, () => fd);
      expect(err.join("\n")).toContain("read back");
      expect(process.exitCode).toBe(1);
    });

    it("accepts a read-back with the editor's final newline for a text without one, and a text with its own", async () => {
      capture();
      await run(() => fake(), { folder: "1", description: "a\nb\n", yes: true }, () => fakeFd("a\nb\n"));
      expect(process.exitCode).toBe(0);
    });

    it("--description-file reads the file as the text", async () => {
      capture();
      const fd = fakeFd("line one\nline two\n");
      const read = vi.fn(() => "line one\nline two\n");
      await run(() => fake(), { folder: "1", descriptionFile: "d.txt", yes: true }, () => fd, read);
      expect(read).toHaveBeenCalledWith("d.txt");
      expect(fd.setFolderDescription).toHaveBeenCalledWith("1", "line one\nline two\n");
      expect(process.exitCode).toBe(0);
    });

    it("reports an unreadable --description-file", async () => {
      capture();
      const read = () => {
        throw new Error("ENOENT: no such file");
      };
      await run(vi.fn(), { folder: "1", descriptionFile: "nope.txt" }, vi.fn(), read);
      expect(err.join("\n")).toContain("clickup update-folder: ENOENT");
      expect(process.exitCode).toBe(1);
    });

    it("refuses --description with --description-file", async () => {
      capture();
      await run(vi.fn(), { folder: "1", description: "x", descriptionFile: "d.txt" });
      expect(err.join("\n")).toContain("cannot be used together");
      expect(process.exitCode).toBe(1);
    });

    it.each(["", "  \n "])("refuses an empty or blank description (%j), dry run too", async (description) => {
      capture();
      await run(vi.fn(), { folder: "1", description });
      expect(err.join("\n")).toContain("--description needs");
      expect(process.exitCode).toBe(1);
    });

    it("refuses an empty description file", async () => {
      capture();
      await run(vi.fn(), { folder: "1", descriptionFile: "d.txt" }, vi.fn(), () => "\n");
      expect(err.join("\n")).toContain("--description-file");
      expect(process.exitCode).toBe(1);
    });

    it("refuses when neither a name nor a description is given", async () => {
      capture();
      await run(vi.fn(), { folder: "1" });
      expect(err.join("\n")).toContain("give --name, --description or --description-file");
      expect(process.exitCode).toBe(1);
    });

    it("name and description together: dry run prints both calls", async () => {
      capture();
      await run(vi.fn(), { folder: "1", name: "A: Reactor", description: "T" });
      const text = out.join("\n");
      expect(text).toContain("PUT /folder/1");
      expect(text).toContain("PUT /hierarchy/v1/category/1");
    });

    it("name and description together with --yes: renames first, then sets the description", async () => {
      capture();
      const client = fake();
      const fd = fakeFd("T\n");
      const order: string[] = [];
      client.updateFolder.mockImplementation(async () => void order.push("rename"));
      fd.setFolderDescription.mockImplementation(async () => void order.push("describe"));
      await run(() => client, { folder: "1", name: "A: Reactor", description: "T", yes: true }, () => fd);
      expect(order).toEqual(["rename", "describe"]);
      expect(process.exitCode).toBe(0);
    });

    it("a failed rename stops before the description is sent", async () => {
      capture();
      const client = fake("Other");
      const fd = fakeFd();
      await run(() => client, { folder: "1", name: "A: Reactor", description: "T", yes: true }, () => fd);
      expect(fd.setFolderDescription).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("sets exit code 1 when the Frontdoor call fails", async () => {
      capture();
      const fd = fakeFd();
      fd.setFolderDescription.mockRejectedValueOnce(new Error("Frontdoor session expired or not enough, capture a new one"));
      await run(() => fake(), { folder: "1", description: "T", yes: true }, () => fd);
      expect(err.join("\n")).toContain("clickup update-folder: Frontdoor session expired");
      expect(fd.getFolderDescription).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });
});
