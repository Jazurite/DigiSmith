import { describe, it, expect, vi, afterEach } from "vitest";
import type { FrontdoorClient } from "@digismith/clickup-client";
import { createCreateFieldCommand, parseLocation } from "./create-field.ts";

function fake() {
  const createField = vi.fn().mockResolvedValue({
    id: "f9",
    name: "Profile",
    type: "drop_down",
    type_config: {
      options: [
        { id: "o1", name: "DigiSmith", color: "#7C4DFF", orderindex: 0 },
        { id: "o2", name: "Emma", color: "#1bbc9c", orderindex: 1 },
      ],
    },
  });
  const setFieldLocations = vi.fn().mockResolvedValue(undefined);
  return { teamId: "5738747", createField, setFieldLocations } as unknown as FrontdoorClient & {
    createField: ReturnType<typeof vi.fn>;
    setFieldLocations: ReturnType<typeof vi.fn>;
    getFieldLocations: ReturnType<typeof vi.fn>;
  };
}
const run = (client: unknown, argv: object) =>
  (createCreateFieldCommand(() => client as FrontdoorClient).handler as (a: object) => Promise<void>)({
    type: "drop_down",
    yes: false,
    ...argv,
  });

describe("create-field", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("dry run sends nothing and prints the call", async () => {
    const client = fake();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { name: "Profile", option: ["DigiSmith", "Emma"], folder: "1301150000002921" });
    expect(client.createField).not.toHaveBeenCalled();
    const out = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain("POST /customFields/v2/field?ignore_existing=true");
    expect(out).toContain('"category_id": "1301150000002921"');
    expect(out).toContain("nothing sent");
    expect(process.exitCode).toBe(0);
  });

  it("--yes sends the full body: default colours by position, explicit colour kept", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, {
      name: " Profile ",
      option: ["DigiSmith", "Emma:1bbc9c", "Jazurite:#ABCDEF", "Note: x"],
      folder: "1301150000002921",
      description: "who",
      yes: true,
    });
    expect(client.createField).toHaveBeenCalledWith({
      name: "Profile",
      description: "who",
      type: "drop_down",
      type_config: {
        new_drop_down: true,
        sorting: "manual",
        options: [
          { id: null, name: "DigiSmith", color: "#7C4DFF", orderindex: null },
          { id: null, name: "Emma", color: "#1bbc9c", orderindex: null },
          { id: null, name: "Jazurite", color: "#ABCDEF", orderindex: null },
          { id: null, name: "Note: x", color: "#e50000", orderindex: null },
        ],
      },
      category_id: "1301150000002921",
      required: false,
      required_on_subtasks: false,
      pinned: false,
      private: false,
      hide_from_guests: false,
      permission_level: null,
      members: [],
      groups: [],
    });
  });

  it("a tail that is only hex-looking text stays in the option name", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { name: "P", option: ["Plan:add", "V: 100", "Ok:#fff"], folder: "1", yes: true });
    const options = client.createField.mock.calls[0][0].type_config.options;
    expect(options.map((o: { name: string; color: string }) => [o.name, o.color])).toEqual([
      ["Plan:add", "#7C4DFF"],
      ["V: 100", "#1bbc9c"],
      ["Ok", "#fff"],
    ]);
  });

  it("--yes prints the field id and each option id", async () => {
    const client = fake();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { name: "Profile", option: ["DigiSmith", "Emma"], folder: "1", yes: true });
    const out = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain("field f9");
    expect(out).toContain("option o1 DigiSmith (orderindex 0)");
    expect(out).toContain("option o2 Emma (orderindex 1)");
  });

  it.each([
    ["--list", { name: "P", option: ["a"], list: "5" }, "Use --folder or --location"],
    ["other type", { name: "P", option: ["a"], folder: "1", type: "text" }, "only drop_down"],
    ["no folder", { name: "P", option: ["a"] }, "--folder or --location is required"],
    ["non-numeric folder", { name: "P", option: ["a"], folder: "abc" }, "--folder must be a numeric id"],
    ["no option", { name: "P", folder: "1" }, "at least one --option"],
    ["duplicate option", { name: "P", option: ["Ab", "ab:#fff"], folder: "1" }, 'duplicate option "ab"'],
    ["empty option", { name: "P", option: [":#fff"], folder: "1" }, "option name must not be empty"],
    ["repeated --name", { name: ["a", "b"], option: ["a"], folder: "1" }, "--name was given more than once"],
    ["empty name", { name: "  ", option: ["a"], folder: "1" }, "--name must not be empty"],
  ])("refuses %s", async (_label, argv, message) => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { ...argv, yes: true });
    expect(client.createField).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toContain(message);
    expect(process.exitCode).toBe(1);
  });

  it("reports a client error and exits 1", async () => {
    const client = fake();
    client.createField.mockRejectedValue(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { name: "P", option: ["a"], folder: "1", yes: true });
    expect(err).toHaveBeenCalledWith("clickup create-field: boom");
    expect(process.exitCode).toBe(1);
  });

  it("parseLocation reads type:id and refuses anything else", () => {
    expect(parseLocation("4:1301150000001271")).toEqual({ type: 4, id: "1301150000001271" });
    for (const bad of ["4", ":1", "x:1", "4:", "4:abc", "0:1", "100:1"]) expect(() => parseLocation(bad)).toThrow(/--location/);
  });

  it("--location dry run prints both calls and sends nothing", async () => {
    const client = fake();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { name: "Mode", option: ["Autonomous", "Manual"], location: ["4:1301150000001271"] });
    const out = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain("POST /customFields/v2/field?ignore_existing=true");
    expect(out).toContain('"team_id": "5738747"');
    expect(out).not.toContain("category_id");
    expect(out).toContain("PUT /field/v3/experience/workspaces/5738747/fields/<new field id>/locations");
    expect(out).toContain('"type": 4');
    expect(client.createField).not.toHaveBeenCalled();
    expect(client.setFieldLocations).not.toHaveBeenCalled();
  });

  it("--location --yes creates the field, then sets every location, then reads it back", async () => {
    const client = fake();
    client.getFieldLocations = vi.fn().mockResolvedValue({ id: "f9", name: "Mode", type: "drop_down", type_config: { options: [] }, locations: [{ parent: { type: 4, id: "1301150000001271" } }] });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { name: "Mode", option: ["Autonomous", "Manual"], location: ["4:1301150000001271", "5:42"], yes: true });
    expect(client.createField.mock.calls[0][0]).toMatchObject({ name: "Mode", type: "drop_down", team_id: "5738747" });
    expect(client.createField.mock.calls[0][0]).not.toHaveProperty("category_id");
    expect(client.setFieldLocations).toHaveBeenCalledWith("f9", [
      { parent: { type: 4, id: "1301150000001271" }, required: false, required_on_subtasks: false, hide_from_guests: false },
      { parent: { type: 5, id: "42" }, required: false, required_on_subtasks: false, hide_from_guests: false },
    ]);
    expect(client.getFieldLocations).toHaveBeenCalledWith("f9");
    expect(log.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("locations read back: 1");
  });

  it("--folder and --location together is refused", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(fake(), { name: "Mode", option: ["A"], folder: "1", location: ["4:1"] });
    expect(err.mock.calls[0][0]).toBe("clickup create-field: use --folder or --location, not both");
    expect(process.exitCode).toBe(1);
  });

  it("neither --folder nor --location is refused", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(fake(), { name: "Mode", option: ["A"] });
    expect(err.mock.calls[0][0]).toBe("clickup create-field: --folder or --location is required");
    expect(process.exitCode).toBe(1);
  });

  it("a failed read-back says the field and its locations exist, gives the id, exits 1", async () => {
    const client = fake();
    client.getFieldLocations = vi.fn().mockRejectedValue(new Error("502"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { name: "Mode", option: ["A"], location: ["4:1"], yes: true });
    expect(client.setFieldLocations).toHaveBeenCalledTimes(1);
    const msg = err.mock.calls[0][0] as string;
    expect(msg).toContain("field f9 was created and its locations were set");
    expect(msg).toContain("read-back failed: 502");
    expect(msg).toContain("get-field f9");
    expect(process.exitCode).toBe(1);
  });

  it("repeated --location values are sent once, in first-seen order", async () => {
    const client = fake();
    client.getFieldLocations = vi.fn().mockResolvedValue({ locations: [] });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { name: "Mode", option: ["A"], location: ["4:1", "5:2", "4:1", " 5:2"], yes: true });
    const sent = client.setFieldLocations.mock.calls[0][1] as { parent: { type: number; id: string } }[];
    expect(sent.map((l) => `${l.parent.type}:${l.parent.id}`)).toEqual(["4:1", "5:2"]);
  });

  it("a failed location call says the field exists without a location", async () => {
    const client = fake();
    client.setFieldLocations = vi.fn().mockRejectedValue(new Error("400"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { name: "Mode", option: ["A"], location: ["4:1"], yes: true });
    expect(err.mock.calls[0][0]).toBe("clickup create-field: field f9 was created, but setting its locations failed: 400. Run get-field f9 and set the locations again; do not create the field twice.");
    expect(process.exitCode).toBe(1);
  });
});
