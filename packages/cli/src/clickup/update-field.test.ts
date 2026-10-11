import { describe, it, expect, vi, afterEach } from "vitest";
import type { FrontdoorClient } from "@digismith/clickup-client";
import { createUpdateFieldCommand } from "./update-field.ts";

const field = (over: object = {}) => ({
  id: "f1",
  name: "Bucket",
  type: "drop_down",
  type_config: {
    options: [
      { id: "o1", name: "Frontdoor API", color: "#7C4DFF", orderindex: 0, type: "text", value: "Frontdoor API" },
      { id: "o2", name: "Public API", color: "#1bbc9c", orderindex: 1 },
    ],
  },
  description: null,
  hide_from_guests: false,
  pinned: true,
  required: false,
  required_on_subtasks: false,
  private: false,
  permission_level: null,
  default_value: null,
  members: [],
  groups: [],
  ...over,
});
function fake(f: object = field()) {
  const getField = vi.fn().mockResolvedValue(f);
  const updateField = vi.fn().mockResolvedValue({ id: "f1" });
  return { getField, updateField } as unknown as FrontdoorClient & {
    updateField: ReturnType<typeof vi.fn>;
  };
}
const run = (client: unknown, argv: object) =>
  (createUpdateFieldCommand(() => client as FrontdoorClient).handler as (a: object) => Promise<void>)(argv);

describe("update-field", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("renames the field only: name new, options untouched, every flag as read", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { field: "f1", name: "ClickUp API Type", yes: true });
    expect(client.updateField).toHaveBeenCalledWith("f1", {
      id: "f1",
      name: "ClickUp API Type",
      type_config: { sorting: "manual", new_drop_down: true, options: { add: [], update: [], rem: [] } },
      hide_from_guests: false,
      pinned: true,
      required: false,
      required_on_subtasks: false,
      description: "",
      private: false,
      permission_level: null,
      default_value: null,
      members: [],
      groups: [],
    });
  });

  it("renames options by name and by id, keeping id, color and order", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { field: "f1", option: ["frontdoor api=Frontdoor", "o2=Public"], yes: true });
    const body = client.updateField.mock.calls[0][1];
    expect(body.type_config.options.update).toEqual([
      { id: "o1", name: "Frontdoor", color: "#7C4DFF", orderindex: 0 },
      { id: "o2", name: "Public", color: "#1bbc9c", orderindex: 1 },
    ]);
    expect(body.name).toBe("Bucket");
  });

  it("keeps sorting and new_drop_down from the read", async () => {
    const client = fake(field({ type_config: { sorting: "custom", new_drop_down: false, options: [] } }));
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { field: "f1", name: "X", yes: true });
    expect(client.updateField.mock.calls[0][1].type_config).toMatchObject({ sorting: "custom", new_drop_down: false });
  });

  it("dry run by default prints the diff and the call and sends nothing", async () => {
    const client = fake();
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(client, { field: "f1", name: "ClickUp API Type", option: ["Public API=Public"] });
    expect(client.updateField).not.toHaveBeenCalled();
    const text = out.join("\n");
    expect(text).toContain('name: "Bucket" -> "ClickUp API Type"');
    expect(text).toContain('option o2: "Public API" -> "Public"');
    expect(text).toContain("PUT /customFields/v2/field/f1");
    expect(text).toContain("nothing sent");
  });

  it.each([
    ["unknown option", { option: ["Nope=X"] }, /unknown option "Nope"/],
    ["same option twice", { option: ["o1=A", "Frontdoor API=B"] }, /renamed twice/],
    ["new name already used", { option: ["Frontdoor API=public api"] }, /two options would be named/],
    ["malformed option", { option: ["Frontdoor API"] }, /must look like/],
    ["nothing to change", {}, /nothing to change/],
    ["empty name", { name: "  " }, /must not be empty/],
  ])("errors on %s and sends nothing", async (_n, argv, re) => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { field: "f1", yes: true, ...argv });
    expect(client.updateField).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(re);
    expect(process.exitCode).toBe(1);
  });

  it("errors on an ambiguous option name", async () => {
    const f = field();
    (f as any).type_config.options.push({ id: "o3", name: "public api", color: "#000", orderindex: 2 });
    const client = fake(f);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { field: "f1", option: ["Public API=X"], yes: true });
    expect(err.mock.calls[0][0]).toMatch(/more than one option/);
    expect(client.updateField).not.toHaveBeenCalled();
  });

  it("adds options: name, color and the next orderindex, the rest as read", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { field: "f1", addOption: ["Maestro", "Scout"], color: "#F9D900", yes: true });
    const body = client.updateField.mock.calls[0][1];
    expect(body.type_config.options).toEqual({
      add: [
        { name: "Maestro", color: "#F9D900", orderindex: 2 },
        { name: "Scout", color: "#F9D900", orderindex: 3 },
      ],
      update: [],
      rem: [],
    });
    expect(body.name).toBe("Bucket");
  });

  it("adds with the web app's default color when --color is missing", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { field: "f1", addOption: ["Maestro"], yes: true });
    expect(client.updateField.mock.calls[0][1].type_config.options.add).toEqual([
      { name: "Maestro", color: "#cecece", orderindex: 2 },
    ]);
  });

  it("adds, renames and renames the field in one PUT", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { field: "f1", name: "N", option: ["o2=Public"], addOption: ["Maestro"], yes: true });
    expect(client.updateField).toHaveBeenCalledTimes(1);
    const body = client.updateField.mock.calls[0][1];
    expect(body.type_config.options.add).toHaveLength(1);
    expect(body.type_config.options.update).toHaveLength(1);
  });

  it("dry run of an add lists the current options and the planned add, and sends nothing", async () => {
    const client = fake();
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(client, { field: "f1", addOption: ["Maestro"], color: "#F9D900" });
    expect(client.updateField).not.toHaveBeenCalled();
    const text = out.join("\n");
    expect(text).toContain("current options: Frontdoor API (o1), Public API (o2)");
    expect(text).toContain('add option "Maestro" #F9D900 at position 2');
    expect(text).toContain("nothing sent");
  });

  it.each([
    ["an existing name", { addOption: ["public api"] }, /already exists/],
    ["the same name twice", { addOption: ["X", "x"] }, /added twice/],
    ["an empty name", { addOption: [" "] }, /must not be empty/],
    ["a bad color", { addOption: ["X"], color: "red" }, /--color must look like/],
    ["--color without --add-option", { name: "N", color: "#fff" }, /--color needs --add-option/],
  ])("errors on add with %s and sends nothing", async (_n, argv, re) => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { field: "f1", yes: true, ...argv });
    expect(client.updateField).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(re);
    expect(process.exitCode).toBe(1);
  });

  it("refuses a field that is not a dropdown", async () => {
    const client = fake(field({ type: "text" }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { field: "f1", name: "X", yes: true });
    expect(err.mock.calls[0][0]).toMatch(/only drop_down/);
    expect(client.updateField).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
