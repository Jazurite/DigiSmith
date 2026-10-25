import { describe, it, expect, vi, afterEach } from "vitest";
import type { FrontdoorClient } from "@digismith/clickup-client";
import { createGetFieldCommand } from "./get-field.ts";

const answer = {
  id: "f1", name: "Sign-off", type: "drop_down",
  type_config: { options: [{ id: "o1", name: "Auto", orderindex: 0 }, { id: "o2", name: "Jack", orderindex: 1 }] },
  locations: [{ parent: { type: 4, id: "1301150000001271" } }],
};
const run = (client: unknown, argv: object) =>
  (createGetFieldCommand(() => client as FrontdoorClient).handler as (a: object) => Promise<void>)({ json: false, ...argv });

describe("get-field", () => {
  afterEach(() => { process.exitCode = 0; vi.restoreAllMocks(); });

  it("prints the field, its options and its locations", async () => {
    const getFieldLocations = vi.fn().mockResolvedValue(answer);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run({ getFieldLocations }, { id: "f1" });
    expect(getFieldLocations).toHaveBeenCalledWith("f1");
    const out = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain('field f1 (drop_down) "Sign-off"');
    expect(out).toContain("option o1 Auto (orderindex 0)");
    expect(out).toContain('"type": 4');
    expect(process.exitCode).toBe(0);
  });
  it("says none when there are no locations", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run({ getFieldLocations: vi.fn().mockResolvedValue({ ...answer, locations: [] }) }, { id: "f1" });
    expect(log.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("locations: none");
  });
  it("--json prints the whole answer", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run({ getFieldLocations: vi.fn().mockResolvedValue(answer) }, { id: "f1", json: true });
    expect(JSON.parse(log.mock.calls[0][0] as string)).toEqual(answer);
  });
  it("prints the default", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run({ getFieldLocations: vi.fn().mockResolvedValue({ ...answer, default_value: { value: "Autonomous" } }) }, { id: "f1" });
    expect(log.mock.calls.map((c) => c.join(" "))).toContain("default: Autonomous");
  });
  it("prints default: none for null and for a missing key", async () => {
    for (const a of [{ ...answer, default_value: null }, answer]) {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      await run({ getFieldLocations: vi.fn().mockResolvedValue(a) }, { id: "f1" });
      expect(log.mock.calls.map((c) => c.join(" "))).toContain("default: none");
      log.mockRestore();
    }
  });
  it("a failed read exits 1 with one line", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run({ getFieldLocations: vi.fn().mockRejectedValue(new Error("404")) }, { id: "f1" });
    expect(err.mock.calls[0][0]).toBe("clickup get-field: 404");
    expect(process.exitCode).toBe(1);
  });
});
