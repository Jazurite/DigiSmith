import { describe, it, expect, vi, afterEach } from "vitest";
import type { FrontdoorClient } from "@digismith/clickup-client";
import { createRestoreListCommand } from "./restore-list.ts";

function fake() {
  const restoreList = vi.fn().mockResolvedValue(undefined);
  return { restoreList } as unknown as FrontdoorClient & { restoreList: ReturnType<typeof vi.fn> };
}
const run = (client: unknown, argv: object) =>
  (createRestoreListCommand(() => client as FrontdoorClient).handler as (a: object) => Promise<void>)(argv);

describe("restore-list", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("dry run prints the call and sends nothing", async () => {
    const client = fake();
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(client, { list: "1301150000002237" });
    expect(client.restoreList).not.toHaveBeenCalled();
    const text = out.join("\n");
    expect(text).toContain("PUT /v1/subcategory/1301150000002237/undo");
    expect(text).toContain('"method": "delete"');
    expect(text).toContain("nothing sent; add --yes to send");
    expect(process.exitCode).toBe(0);
  });

  it("dry run never builds the client, so it works without a session", async () => {
    const factory = vi.fn(() => {
      throw new Error("CLICKUP_FRONTDOOR_AUTH missing");
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await (createRestoreListCommand(factory as unknown as () => FrontdoorClient).handler as (a: object) => Promise<void>)({ list: "1" });
    expect(factory).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it("--yes calls restoreList and points at get-lists", async () => {
    const client = fake();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { list: "1301150000002237", yes: true });
    expect(client.restoreList).toHaveBeenCalledWith("1301150000002237");
    expect(log.mock.calls.join("\n")).toContain("check with dg clickup get-lists");
    expect(process.exitCode).toBe(0);
  });

  it.each([["abc"], [""], ["12a"], ["1 2"]])("rejects --list %j before any call", async (list) => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { list, yes: true });
    expect(client.restoreList).not.toHaveBeenCalled();
    expect(err.mock.calls.join("\n")).toContain("--list");
    expect(process.exitCode).toBe(1);
  });

  it("a failed send prints the message with ClickUp's body and sets exit code 1", async () => {
    const client = fake();
    client.restoreList.mockRejectedValue(new Error('Request failed with status code 404: {"err":"nope"}'));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { list: "1", yes: true });
    expect(err.mock.calls.join("\n")).toContain('clickup restore-list: Request failed with status code 404: {"err":"nope"}');
    expect(process.exitCode).toBe(1);
  });

  it("--yes without a session prints the factory error and sets exit code 1", async () => {
    const factory = vi.fn(() => {
      throw new Error("CLICKUP_FRONTDOOR_AUTH missing");
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await (createRestoreListCommand(factory as unknown as () => FrontdoorClient).handler as (a: object) => Promise<void>)({ list: "1", yes: true });
    expect(err.mock.calls.join("\n")).toContain("CLICKUP_FRONTDOOR_AUTH missing");
    expect(process.exitCode).toBe(1);
  });
});
