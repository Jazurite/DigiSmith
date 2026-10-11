import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient, FrontdoorClient } from "@digismith/clickup-client";
import { createMoveListCommand } from "./move-list.ts";

function fake() {
  const moveList = vi.fn().mockResolvedValue(undefined);
  return { moveList } as unknown as FrontdoorClient & { moveList: ReturnType<typeof vi.fn> };
}
function reader(folder: { id: string; hidden?: boolean } = { id: "999", hidden: false }) {
  const getList = vi.fn().mockResolvedValue({ id: "1", name: "x", folder });
  return { getList } as unknown as ClickUpClient & { getList: ReturnType<typeof vi.fn> };
}
const run = (client: unknown, argv: object, rd: unknown = reader()) =>
  (createMoveListCommand(() => client as FrontdoorClient, () => rd as ClickUpClient).handler as (a: object) => Promise<void>)(argv);

describe("move-list", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("dry run prints the call and sends nothing", async () => {
    const client = fake();
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(client, { list: "1301150000002956", folder: "1301150000002921", position: 1 });
    expect(client.moveList).not.toHaveBeenCalled();
    const text = out.join("\n");
    expect(text).toContain(
      "PUT /hierarchy/v2/subcategory/1301150000002956/position?v2=true&conflict_modal=true&return_conflict_on_cancel=true"
    );
    expect(text).toContain('"position": 1');
    expect(text).toContain('"include_archived": false');
    expect(text).toContain('"category": "1301150000002921"');
    expect(text).toContain("nothing sent");
    expect(process.exitCode).toBe(0);
  });

  it("dry run never builds the client, so it works without a session", async () => {
    const factory = vi.fn(() => {
      throw new Error("CLICKUP_FRONTDOOR_AUTH missing");
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await (createMoveListCommand(factory as unknown as () => FrontdoorClient, () => reader() as unknown as ClickUpClient).handler as (a: object) => Promise<void>)({
      list: "1",
      folder: "2",
    });
    expect(factory).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it("position defaults to 0", async () => {
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(fake(), { list: "1", folder: "2" });
    expect(out.join("\n")).toContain('"position": 0');
  });

  it("--yes calls moveList and points at get-lists", async () => {
    const client = fake();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { list: "1301150000002956", folder: "1301150000002921", position: 1, yes: true });
    expect(client.moveList).toHaveBeenCalledWith("1301150000002956", { folderId: "1301150000002921", position: 1 });
    expect(log.mock.calls.join("\n")).toContain("get-lists");
    expect(process.exitCode).toBe(0);
  });

  it.each([
    [{ list: "abc", folder: "2" }, "--list"],
    [{ list: "1", folder: "x" }, "--folder"],
    [{ list: "1", folder: "2", position: -1 }, "--position"],
    [{ list: "1", folder: "2", position: 1.5 }, "--position"],
  ])("rejects %j before any call", async (argv, word) => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { ...argv, yes: true });
    expect(client.moveList).not.toHaveBeenCalled();
    expect(err.mock.calls.join("\n")).toContain(word);
    expect(process.exitCode).toBe(1);
  });

  it("a failed send prints the message and sets exit code 1", async () => {
    const client = fake();
    client.moveList.mockRejectedValue(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { list: "1", folder: "2", yes: true });
    expect(err.mock.calls.join("\n")).toContain("clickup move-list: boom");
    expect(process.exitCode).toBe(1);
  });

  it("--yes without a session prints the factory error and sets exit code 1", async () => {
    const factory = vi.fn(() => {
      throw new Error("CLICKUP_FRONTDOOR_AUTH missing");
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await (createMoveListCommand(factory as unknown as () => FrontdoorClient, () => reader() as unknown as ClickUpClient).handler as (a: object) => Promise<void>)({
      list: "1",
      folder: "2",
      yes: true,
    });
    expect(err.mock.calls.join("\n")).toContain("CLICKUP_FRONTDOOR_AUTH missing");
    expect(process.exitCode).toBe(1);
  });

  describe("reorder inside the list's own folder", () => {
    const own = { id: "55", hidden: false };

    it.each([
      ["--folder is the current folder", { list: "7", folder: "55", position: 3 }],
      ["--folder is left out", { list: "7", position: 3 }],
    ])("dry run prints the position-only body when %s", async (_n, argv) => {
      const client = fake();
      const out: string[] = [];
      vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
      await run(client, argv, reader(own));
      const text = out.join("\n");
      expect(client.moveList).not.toHaveBeenCalled();
      expect(text).toContain("PUT /hierarchy/v2/subcategory/7/position?v2=true");
      expect(text).toContain('"position": 3');
      expect(text).toContain('"include_archived": false');
      expect(text).not.toContain("category");
      expect(text).toContain("reorder");
      expect(process.exitCode).toBe(0);
    });

    it("dry run of a folder change says it is a folder change", async () => {
      const out: string[] = [];
      vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
      await run(fake(), { list: "7", folder: "2", position: 1 }, reader(own));
      expect(out.join("\n")).toContain("folder change");
    });

    it.each([
      [{ list: "7", folder: "55", position: 3 }, { folderId: undefined, position: 3 }],
      [{ list: "7", position: 0 }, { folderId: undefined, position: 0 }],
    ])("--yes sends the position only for %j", async (argv, _t) => {
      const client = fake();
      vi.spyOn(console, "log").mockImplementation(() => {});
      await run(client, { ...argv, yes: true }, reader(own));
      expect(client.moveList).toHaveBeenCalledWith("7", { position: (argv as { position: number }).position });
      expect(process.exitCode).toBe(0);
    });

    it.each([
      ["no --folder and no --position", { list: "7" }],
      ["--folder is the current folder and no --position", { list: "7", folder: "55" }],
    ])("refuses with %s", async (_n, argv) => {
      const client = fake();
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      await run(client, { ...argv, yes: true }, reader(own));
      expect(client.moveList).not.toHaveBeenCalled();
      expect(err.mock.calls.join("\n")).toContain("--position is required");
      expect(process.exitCode).toBe(1);
    });

    it("refuses a folderless list without --folder", async () => {
      const client = fake();
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      await run(client, { list: "7", position: 1, yes: true }, reader({ id: "90", hidden: true }));
      expect(client.moveList).not.toHaveBeenCalled();
      expect(err.mock.calls.join("\n")).toContain("not in a folder");
      expect(process.exitCode).toBe(1);
    });

    it("a failed read sends nothing and exits 1", async () => {
      const client = fake();
      const rd = reader();
      rd.getList.mockRejectedValue(new Error("read failed"));
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      await run(client, { list: "7", folder: "2", yes: true }, rd);
      expect(client.moveList).not.toHaveBeenCalled();
      expect(err.mock.calls.join("\n")).toContain("read failed");
      expect(process.exitCode).toBe(1);
    });

    it("prints ClickUp's error body from a failed reorder", async () => {
      const client = fake();
      client.moveList.mockRejectedValue(new Error('Request failed with status code 400: {"err":"nope"}'));
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      await run(client, { list: "7", position: 1, yes: true }, reader(own));
      expect(err.mock.calls.join("\n")).toContain('{"err":"nope"}');
    });
  });
});
