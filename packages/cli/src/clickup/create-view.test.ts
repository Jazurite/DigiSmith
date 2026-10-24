import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { buildViewBody, createCreateViewCommand } from "./create-view.ts";

const fake = (views: { id: string; name: string; type: string }[] = []) => ({
  getSpaceViews: vi.fn().mockResolvedValue(views),
  createSpaceView: vi.fn().mockResolvedValue({ id: "v9", name: "Schedule", type: "list" }),
});
const run = (client: unknown, argv: object) =>
  (createCreateViewCommand(() => client as ClickUpClient).handler as (a: object) => Promise<void>)({ yes: false, "column-field-id": [], columnFieldId: [], ...argv });
const base = { space: "1301150000001271", name: "Schedule", status: "scheduled", sortFieldId: "fs" , columnFieldId: ["fs", "fm"] };

describe("create-view", () => {
  afterEach(() => { process.exitCode = 0; vi.restoreAllMocks(); });

  it("buildViewBody: a list view filtered on the status, sorted by the field, the columns shown", () => {
    expect(buildViewBody("Schedule", "scheduled", "fs", ["fs", "fm"])).toEqual({
      name: "Schedule", type: "list",
      filters: { op: "AND", fields: [{ field: "status", op: "EQ", values: ["scheduled"] }], search: "", show_closed: false },
      sorting: { fields: [{ field: "cf_fs", dir: 1 }] },
      columns: { fields: [{ field: "cf_fs", hidden: false }, { field: "cf_fm", hidden: false }] },
    });
  });
  it("dry run prints the call and sends nothing", async () => {
    const client = fake();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, base);
    const out = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain("POST /space/1301150000001271/view");
    expect(out).toContain("nothing sent");
    expect(client.createSpaceView).not.toHaveBeenCalled();
  });
  it("--yes creates the view and reads the views back", async () => {
    const client = fake();
    client.getSpaceViews.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "v9", name: "Schedule", type: "list" }]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { ...base, yes: true });
    expect(client.createSpaceView).toHaveBeenCalledWith("1301150000001271", buildViewBody("Schedule", "scheduled", "fs", ["fs", "fm"]));
    expect(log.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("view v9 (list) \"Schedule\", read back");
  });
  it("a view of that name already in the space is refused, before any write", async () => {
    const client = fake([{ id: "v1", name: "schedule", type: "list" }]);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { ...base, yes: true });
    expect(client.createSpaceView).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toBe('clickup create-view: the space already has a view named "schedule" (v1); nothing sent');
    expect(process.exitCode).toBe(1);
  });
  it("a view missing on read-back is an error", async () => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { ...base, yes: true });
    expect(err.mock.calls[0][0]).toBe("clickup create-view: view v9 was created but is not in the space's views on read-back");
    expect(process.exitCode).toBe(1);
  });
  it("refuses a non-numeric space and an empty name", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(fake(), { ...base, space: "abc" });
    await run(fake(), { ...base, name: " " });
    await run(fake(), { ...base, status: " " });
    await run(fake(), { ...base, sortFieldId: "  " });
    expect(err.mock.calls.map((c) => c[0])).toEqual([
      "clickup create-view: --space must be a numeric id",
      "clickup create-view: --name must not be empty",
      "clickup create-view: --status must not be empty",
      "clickup create-view: --sort-field-id must not be empty",
    ]);
  });
});
