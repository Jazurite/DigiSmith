import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClickUpClient, FrontdoorClient } from "@digismith/clickup-client";
import { FACTORY_FIELDS, createCreateFactoryFieldsCommand } from "./create-factory-fields.ts";

const OCL = "1301150000003197";
const opt = (name: string, i: number) => ({ id: `o${i}`, name, orderindex: i, color: "#000" });
const field = (name: string, options: string[]) => ({ id: `id-${name}`, name, type: "drop_down", type_config: { options: options.map(opt) } });

function read(fields: unknown[]) {
  return {
    getSpaceFolders: vi.fn().mockResolvedValue([{ id: "F", name: "Product", lists: [{ id: "L1", name: "Backlog" }] }]),
    getFolderlessLists: vi.fn().mockResolvedValue([{ id: "L2", name: "Loose" }]),
    getListFields: vi.fn().mockResolvedValue(fields),
  } as unknown as ClickUpClient & { getListFields: ReturnType<typeof vi.fn> };
}
function front() {
  let n = 0;
  return {
    teamId: "5738747",
    createField: vi.fn(async (b: { name: string }) => ({ id: `new-${++n}`, name: b.name, type: "drop_down", type_config: { options: [] } })),
    setFieldLocations: vi.fn().mockResolvedValue(undefined),
    getFieldLocations: vi.fn().mockResolvedValue({ locations: [{}] }),
  } as unknown as FrontdoorClient & { createField: ReturnType<typeof vi.fn>; setFieldLocations: ReturnType<typeof vi.fn>; getFieldLocations: ReturnType<typeof vi.fn> };
}
const run = (r: unknown, f: unknown, argv: object) =>
  (createCreateFactoryFieldsCommand(() => r as ClickUpClient, () => f as FrontdoorClient).handler as (a: object) => Promise<void>)({ yes: false, ...argv });
const out = () => (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0])).join("\n");

afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });

describe("create-factory-fields", () => {
  it("the field pair equals DigiSmith's (pinned)", () => {
    expect(FACTORY_FIELDS).toEqual([
      { name: "Mode", options: ["Autonomous:#2ecd6f", "Manual:#e67e22"] },
      { name: "Sign-off", options: ["Auto:#1bbc9c", "Jack:#e67e22"] },
    ]);
  });
  it("dry run prints both calls with the space-level location and sends nothing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const f = front();
    await run(read([]), f, { space: OCL });
    expect(f.createField).not.toHaveBeenCalled();
    expect(out()).toContain('"name": "Mode"');
    expect(out()).toContain('"name": "Sign-off"');
    expect(out()).toContain(`"id": "${OCL}"`);
    expect(out()).toContain("nothing sent; add --yes to send");
    expect(process.exitCode).toBe(0);
  });
  it("--yes creates both missing fields at the space, then reads the locations back", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const f = front();
    await run(read([]), f, { space: OCL, yes: true });
    expect(f.createField.mock.calls.map((c) => (c[0] as { name: string }).name)).toEqual(["Mode", "Sign-off"]);
    expect(f.setFieldLocations).toHaveBeenCalledTimes(2);
    expect(f.setFieldLocations.mock.calls[0][1]).toEqual([
      { parent: { type: 4, id: OCL }, required: false, required_on_subtasks: false, hide_from_guests: false },
    ]);
    expect(f.getFieldLocations).toHaveBeenCalledTimes(2);
    expect(f.getFieldLocations.mock.calls.map((c) => c[0])).toEqual(["new-1", "new-2"]);
    expect(out()).toContain("locations read back: 1");
    expect(process.exitCode).toBe(0);
  });
  it("--yes creates only the missing field", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const f = front();
    await run(read([field("Mode", ["Autonomous", "Manual"])]), f, { space: OCL, yes: true });
    expect(f.createField.mock.calls.map((c) => (c[0] as { name: string }).name)).toEqual(["Sign-off"]);
    expect(out()).toContain("skip Mode: exists (id-Mode)");
  });
  it("a second run with both fields present creates nothing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const f = front();
    await run(read([field("Mode", ["Autonomous", "Manual"]), field("Sign-off", ["Auto", "Jack"])]), f, { space: OCL, yes: true });
    expect(f.createField).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });
  it("a field with other options is an error and nothing is created", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = front();
    await run(read([field("Mode", ["Autonomous", "Maual"])]), f, { space: OCL, yes: true });
    expect(f.createField).not.toHaveBeenCalled();
    expect(String(err.mock.calls[0][0])).toContain('"Mode" exists with options Autonomous, Maual');
    expect(process.exitCode).toBe(1);
  });
  it("refuses a space that is not in the space list", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(read([]), front(), { space: "999" });
    expect(String(err.mock.calls[0][0])).toContain("not a known space");
    expect(process.exitCode).toBe(1);
  });
  it("a failed location call says the field exists without a location and exits 1", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = front();
    f.setFieldLocations.mockRejectedValueOnce(new Error("boom"));
    await run(read([]), f, { space: OCL, yes: true });
    expect(String(err.mock.calls[0][0])).toContain("new-1 was created, but setting its locations failed: boom");
    expect(f.createField).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });
});
