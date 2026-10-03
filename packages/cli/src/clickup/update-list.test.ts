import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createUpdateListCommand } from "./update-list.ts";

type Argv = {
  list: string;
  name?: string;
  description?: string;
  descriptionFile?: string;
};

function setup(updateList = vi.fn().mockResolvedValue({ id: "l1", name: "Town Hall" })) {
  const clientFactory = vi.fn(() => ({ updateList }) as unknown as ClickUpClient);
  const command = createUpdateListCommand(clientFactory);
  const run = (argv: Argv) => (command.handler as (a: Argv) => Promise<void>)(argv);
  return { updateList, clientFactory, run };
}

describe("createUpdateListCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("renames a list with --name only", async () => {
    const { updateList, run } = setup();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await run({ list: "l1", name: "Town Hall" });

    expect(updateList).toHaveBeenCalledWith("l1", { name: "Town Hall" });
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ id: "l1", name: "Town Hall" }, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("sends --description as content", async () => {
    const { updateList, run } = setup();
    vi.spyOn(console, "log").mockImplementation(() => {});

    await run({ list: "l1", description: "- scope\n- rules" });

    expect(updateList).toHaveBeenCalledWith("l1", { content: "- scope\n- rules" });
    expect(process.exitCode).toBe(0);
  });

  it("sends name and description together", async () => {
    const { updateList, run } = setup();
    vi.spyOn(console, "log").mockImplementation(() => {});

    await run({ list: "l1", name: "B.2: Router", description: "text" });

    expect(updateList).toHaveBeenCalledWith("l1", { name: "B.2: Router", content: "text" });
  });

  it("reads the description from --description-file as UTF-8", async () => {
    const dir = mkdtempSync(join(tmpdir(), "update-list-"));
    try {
      const file = join(dir, "desc.md");
      writeFileSync(file, "- one\n- two — dash\n", "utf8");
      const { updateList, run } = setup();
      vi.spyOn(console, "log").mockImplementation(() => {});

      await run({ list: "l1", descriptionFile: file });

      expect(updateList).toHaveBeenCalledWith("l1", { content: "- one\n- two — dash\n" });
      expect(process.exitCode).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows an empty --description and sends it to clear the description", async () => {
    const { updateList, run } = setup();
    vi.spyOn(console, "log").mockImplementation(() => {});

    await run({ list: "l1", description: "" });

    expect(updateList).toHaveBeenCalledWith("l1", { content: "" });
    expect(process.exitCode).toBe(0);
  });

  it.each([
    ["an empty --list", { list: "", name: "x" }, "--list needs a list ID"],
    ["a whitespace --list", { list: "  ", name: "x" }, "--list needs a list ID"],
    ["an empty --name", { list: "l1", name: "" }, "--name needs a non-empty name"],
    ["a whitespace --name", { list: "l1", name: "   " }, "--name needs a non-empty name"],
    [
      "both description flags",
      { list: "l1", description: "a", descriptionFile: "b.md" },
      "use --description or --description-file, not both",
    ],
    [
      "no fields to update",
      { list: "l1" },
      "nothing to update — pass --name, --description or --description-file",
    ],
  ] as [string, Argv, string][])("rejects %s before creating a client", async (_label, argv, message) => {
    const { clientFactory, updateList, run } = setup();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await run(argv);

    expect(errorSpy).toHaveBeenCalledWith(`clickup update-list: ${message}`);
    expect(process.exitCode).toBe(1);
    expect(clientFactory).not.toHaveBeenCalled();
    expect(updateList).not.toHaveBeenCalled();
  });

  it("errors when --description-file cannot be read, without creating a client", async () => {
    const { clientFactory, run } = setup();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await run({ list: "l1", descriptionFile: join(tmpdir(), "no-such-dir", "missing.md") });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("clickup update-list: cannot read --description-file"),
    );
    expect(process.exitCode).toBe(1);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("errors and sets exitCode 1 when the API call throws", async () => {
    const { run } = setup(vi.fn().mockRejectedValue(new Error("HTTP 404")));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await run({ list: "l1", name: "x" });

    expect(errorSpy).toHaveBeenCalledWith("clickup update-list: HTTP 404");
    expect(process.exitCode).toBe(1);
  });
});
