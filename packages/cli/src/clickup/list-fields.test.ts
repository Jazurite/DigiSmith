import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createListFieldsCommand, formatFields } from "./list-fields.ts";

const fields = [
  { id: "f1", name: "ClickUp API Type", type: "drop_down", type_config: { options: [{ id: "o1", name: "Frontdoor" }] } },
  { id: "f2", name: "Notes", type: "text", type_config: {} },
];
const run = (argv: object, getListFields = vi.fn().mockResolvedValue(fields)) =>
  (createListFieldsCommand(() => ({ getListFields }) as unknown as ClickUpClient).handler as (a: object) => Promise<void>)(argv);

describe("list-fields", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });
  it("prints id, name, type and options", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run({ list: "L" });
    expect(log.mock.calls.map((c) => c[0])).toEqual(["f1  ClickUp API Type  drop_down", "    Frontdoor (o1)", "f2  Notes  text"]);
    expect(process.exitCode).toBe(0);
  });
  it("formatFields prints the default under a field that has one", () => {
    const f = { id: "f1", name: "Mode", type: "drop_down", type_config: { options: [{ id: "o1", name: "Autonomous" }] }, default_value: { value: "Autonomous" } };
    expect(formatFields([f])).toEqual(["f1  Mode  drop_down", "    default: Autonomous", "    Autonomous (o1)"]);
  });
  it("formatFields prints no default line when the field has none or null", () => {
    const base = { id: "f2", name: "Notes", type: "text" };
    expect(formatFields([base, { ...base, default_value: null }])).toEqual(["f2  Notes  text", "f2  Notes  text"]);
  });
  it("--json prints the raw array", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run({ list: "L", json: true });
    expect(log).toHaveBeenCalledWith(JSON.stringify(fields, null, 2));
  });
  it("errors with exit 1 when the client throws", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run({ list: "L" }, vi.fn().mockRejectedValue(new Error("HTTP 401")));
    expect(err).toHaveBeenCalledWith("clickup list-fields: HTTP 401");
    expect(process.exitCode).toBe(1);
  });
});
