import { describe, it, expect, vi, afterEach } from "vitest";
import type { FrontdoorClient } from "@digismith/clickup-client";
import { createMoveListCommand } from "./move-list.ts";

function fake() {
  const moveList = vi.fn().mockResolvedValue(undefined);
  return { moveList } as unknown as FrontdoorClient & { moveList: ReturnType<typeof vi.fn> };
}
const run = (client: unknown, argv: object) =>
  (createMoveListCommand(() => client as FrontdoorClient).handler as (a: object) => Promise<void>)(argv);

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
    await (createMoveListCommand(factory as unknown as () => FrontdoorClient).handler as (a: object) => Promise<void>)({
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
});
