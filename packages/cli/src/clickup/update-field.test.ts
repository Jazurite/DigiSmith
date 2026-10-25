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
function fake(f: object = field(), valueCount = 0, readBack?: object) {
  const getField = vi.fn().mockResolvedValue(f);
  if (readBack !== undefined) getField.mockResolvedValueOnce(f).mockResolvedValueOnce(readBack);
  const updateField = vi.fn().mockResolvedValue({ id: "f1" });
  const getFieldValueCount = vi.fn().mockResolvedValue(valueCount);
  return { getField, updateField, getFieldValueCount } as unknown as FrontdoorClient & {
    updateField: ReturnType<typeof vi.fn>;
    getFieldValueCount: ReturnType<typeof vi.fn>;
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
    ["nothing to change", {}, /nothing to change: pass .*--default.*--clear-default/],
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
    expect(client.updateField.mock.calls[0][1]).toEqual({
      id: "f1",
      name: "N",
      type_config: {
        sorting: "manual",
        new_drop_down: true,
        options: {
          add: [{ name: "Maestro", color: "#cecece", orderindex: 2 }],
          update: [{ id: "o2", name: "Public", color: "#1bbc9c", orderindex: 1 }],
          rem: [],
        },
      },
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

  it("removes by name and by id: the ids go in rem, the rest as read (mock only)", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { field: "f1", removeOption: ["frontdoor api", "o2"], confirmRemove: ["Frontdoor API", "Public API"], yes: true });
    const body = client.updateField.mock.calls[0][1];
    expect(body.type_config.options).toEqual({ add: [], update: [], rem: ["o1", "o2"] });
    expect(body.name).toBe("Bucket");
  });

  it("adds and removes in one PUT", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { field: "f1", addOption: ["Maestro"], removeOption: ["o2"], confirmRemove: ["Public API"], yes: true });
    expect(client.updateField).toHaveBeenCalledTimes(1);
    const o = client.updateField.mock.calls[0][1].type_config.options;
    expect(o.add).toHaveLength(1);
    expect(o.rem).toEqual(["o2"]);
  });

  it("dry run of a remove warns with the ticket count and sends nothing", async () => {
    const client = fake(field(), 3);
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(client, { field: "f1", removeOption: ["Public API"] });
    expect(client.getFieldValueCount).toHaveBeenCalledWith("f1", "o2");
    expect(client.updateField).not.toHaveBeenCalled();
    const text = out.join("\n");
    expect(text).toContain('remove option "Public API" (o2)');
    expect(text).toContain('WARNING: 3 ticket(s) hold "Public API"; removing it changes their value (what ClickUp does to values is not captured)');
    expect(text).toContain("nothing sent");
  });

  it("dry run of a remove with no ticket using it prints no warning", async () => {
    const client = fake(field(), 0);
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(client, { field: "f1", removeOption: ["Public API"] });
    const text = out.join("\n");
    expect(text).not.toContain("WARNING");
    expect(text).toContain('no ticket holds "Public API"');
  });

  it.each([
    ["no --confirm-remove", {}],
    ["a wrong name", { confirmRemove: ["public api"] }],
    ["a confirm for another option", { confirmRemove: ["Frontdoor API"] }],
  ])("--yes remove with %s exits 1 and sends nothing", async (_n, extra) => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { field: "f1", removeOption: ["Public API"], yes: true, ...extra });
    expect(client.updateField).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(/--confirm-remove "Public API"/);
    expect(process.exitCode).toBe(1);
  });

  it.each([
    ["an unknown option", { removeOption: ["Nope"] }, /unknown option "Nope"/],
    ["the same option twice", { removeOption: ["o1", "Frontdoor API"] }, /removed twice/],
    ["an option that is also renamed", { removeOption: ["o1"], option: ["o1=X"] }, /both removed and renamed/],
  ])("errors on remove of %s and sends nothing", async (_n, argv, re) => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { field: "f1", yes: true, ...argv });
    expect(client.updateField).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(re);
    expect(process.exitCode).toBe(1);
  });

  it("dry run: a failed ticket count prints the plan, a WARNING and nothing sent", async () => {
    const client = fake();
    client.getFieldValueCount.mockRejectedValue(new Error("value_count is not a count"));
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(client, { field: "f1", removeOption: ["Public API"] });
    expect(client.updateField).not.toHaveBeenCalled();
    const text = out.join("\n");
    expect(text).toContain('remove option "Public API" (o2)');
    expect(text).toContain('WARNING: could not count tickets for "Public API": value_count is not a count');
    expect(text).not.toContain("no ticket holds");
    expect(text).toContain("nothing sent");
    expect(process.exitCode).toBe(0);
  });

  it("--yes: a failed ticket count exits 1 and sends nothing", async () => {
    const client = fake();
    client.getFieldValueCount.mockRejectedValue(new Error("value_count is not a count"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { field: "f1", removeOption: ["Public API"], confirmRemove: ["Public API"], yes: true });
    expect(client.updateField).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(/value_count is not a count/);
    expect(process.exitCode).toBe(1);
  });

  it("dry run prints the WARNING line before the PUT line", async () => {
    const client = fake(field(), 2);
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(client, { field: "f1", removeOption: ["Public API"] });
    const text = out.join("\n");
    expect(text.indexOf("WARNING")).toBeGreaterThan(-1);
    expect(text.indexOf("WARNING")).toBeLessThan(text.indexOf("PUT /customFields/v2/field/f1"));
  });

  it("two removals with only one confirmed exits 1 and sends nothing", async () => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { field: "f1", removeOption: ["o1", "o2"], confirmRemove: ["Frontdoor API"], yes: true });
    expect(client.updateField).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(/--confirm-remove "Public API"/);
    expect(process.exitCode).toBe(1);
  });

  it.each([
    ["other case", "public api"],
    ["trailing space", "Public API "],
    ["leading space", " Public API"],
    ["a look-alike unicode letter", "Publіc API"],
  ])("--confirm-remove with %s does not match", async (_n, confirm) => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { field: "f1", removeOption: ["Public API"], confirmRemove: [confirm], yes: true });
    expect(client.updateField).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(/--confirm-remove "Public API"/);
    expect(process.exitCode).toBe(1);
  });

  it.each([
    ["a 5-digit color", "#12345"],
    ["a 7-digit color", "#1234567"],
    ["an 8-digit color", "#12345678"],
  ])("errors on %s", async (_n, color) => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { field: "f1", addOption: ["X"], color, yes: true });
    expect(client.updateField).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(/--color must look like/);
  });

  it.each(["#fff", "#FFAA00"])("accepts the color %s", async (color) => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { field: "f1", addOption: ["X"], color, yes: true });
    expect(client.updateField.mock.calls[0][1].type_config.options.add[0].color).toBe(color);
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

describe("update-field default", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });
  const withDefault = (v: string | null) => field({ default_value: v === null ? null : { value: v } });

  it("--default sets the default by option name", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { field: "f1", default: "Public API", yes: true });
    const body = client.updateField.mock.calls[0][1];
    expect(body.default_value).toEqual({ value: "Public API" });
    expect(body.name).toBe("Bucket");
    expect(body.type_config.options).toEqual({ add: [], update: [], rem: [] });
  });

  it("--default accepts an option id (stored by name)", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { field: "f1", default: "o1", yes: true });
    expect(client.updateField.mock.calls[0][1].default_value).toEqual({ value: "Frontdoor API" });
  });

  it("--default dry run prints the diff and the PUT, sends nothing", async () => {
    const client = fake();
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(client, { field: "f1", default: "Public API" });
    expect(client.updateField).not.toHaveBeenCalled();
    const text = out.join("\n");
    expect(text).toContain('default: none -> "Public API"');
    expect(text).toContain("PUT /customFields/v2/field/f1");
    expect(text).toContain("nothing sent");
  });

  it("--clear-default sends default_value null", async () => {
    const client = fake(withDefault("Public API"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { field: "f1", clearDefault: true, yes: true });
    expect(client.updateField.mock.calls[0][1].default_value).toBeNull();
  });

  it("--default with an unknown option exits 1 and lists the options", async () => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { field: "f1", default: "Nope", yes: true });
    expect(client.updateField).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(/unknown option "Nope"/);
    expect(err.mock.calls[0][0]).toContain("Public API");
    expect(process.exitCode).toBe(1);
  });

  it("--default and --clear-default together exit 1", async () => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { field: "f1", default: "Public API", clearDefault: true, yes: true });
    expect(client.updateField).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(/--default and --clear-default exclude each other/);
    expect(process.exitCode).toBe(1);
  });

  it("a field that is not drop_down exits 1 with --default", async () => {
    const client = fake(field({ type: "text" }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { field: "f1", default: "X", yes: true });
    expect(client.updateField).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(/only drop_down/);
    expect(process.exitCode).toBe(1);
  });

  it.each([false, true])('--default equal to the current default prints "default already <name>", sends nothing (yes=%s)', async (yes) => {
    const client = fake(withDefault("Public API"));
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
    await run(client, { field: "f1", default: "o2", yes });
    expect(client.updateField).not.toHaveBeenCalled();
    expect(out.join("\n")).toContain("default already Public API");
    expect(process.exitCode).toBe(0);
  });

  it("renaming the current default option moves the default to the new name", async () => {
    const client = fake(withDefault("Public API"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { field: "f1", option: ["Public API=Open API"], yes: true });
    const body = client.updateField.mock.calls[0][1];
    expect(body.default_value).toEqual({ value: "Open API" });
    expect(body.type_config.options.update).toEqual([{ id: "o2", name: "Open API", color: "#1bbc9c", orderindex: 1 }]);
  });

  it("removing the current default option exits 1 without --default or --clear-default", async () => {
    const client = fake(withDefault("Public API"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { field: "f1", removeOption: ["Public API"], confirmRemove: ["Public API"], yes: true });
    expect(client.updateField).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(/removes the current default/);
    expect(process.exitCode).toBe(1);
  });

  it("removing the current default option passes with --default <other>", async () => {
    const client = fake(withDefault("Public API"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { field: "f1", removeOption: ["Public API"], confirmRemove: ["Public API"], default: "Frontdoor API", yes: true });
    const body = client.updateField.mock.calls[0][1];
    expect(body.default_value).toEqual({ value: "Frontdoor API" });
    expect(body.type_config.options.rem).toEqual(["o2"]);
  });

  it("--yes fails with exit 1 when the read-back default differs", async () => {
    const client = fake(field(), 0, field({ default_value: null }));
    vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { field: "f1", default: "Public API", yes: true });
    expect(client.updateField).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
    const text = err.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(text).toContain("Public API");
    expect(text).toContain("none");
  });

  it("--yes passes when the read-back default matches", async () => {
    const client = fake(field(), 0, withDefault("Public API"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { field: "f1", default: "Public API", yes: true });
    expect(client.getField).toHaveBeenCalledTimes(2);
    expect(process.exitCode).toBe(0);
  });

  it.each([false, true])("--default naming an option removed in the same call exits 1, sends nothing (yes=%s)", async (yes) => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { field: "f1", removeOption: ["Public API"], confirmRemove: ["Public API"], default: "Public API", yes });
    expect(client.updateField).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toContain("cannot set the default to an option removed in the same call");
    expect(process.exitCode).toBe(1);
  });

  it.each([false, true])("--default naming the old side of a rename exits 1, sends nothing (yes=%s)", async (yes) => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { field: "f1", option: ["Public API=Open API"], default: "o2", yes });
    expect(client.updateField).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toContain("cannot set the default to an option renamed in the same call; use the new name in a second call");
    expect(process.exitCode).toBe(1);
  });

  it("--default equal to the current default with another change sends it unchanged and does not read back", async () => {
    const client = fake(withDefault("Public API"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { field: "f1", default: "Public API", name: "N", yes: true });
    expect(client.updateField).toHaveBeenCalledTimes(1);
    const body = client.updateField.mock.calls[0][1];
    expect(body.default_value).toEqual({ value: "Public API" });
    expect(body.name).toBe("N");
    expect(client.getField).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(0);
  });

  it("--yes without a default flag does not read back the default", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { field: "f1", name: "N", yes: true });
    expect(client.getField).toHaveBeenCalledTimes(1);
  });
});

describe("update-field argv (parsed by yargs)", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  const parse = async (client: unknown, args: string[]) => {
    const { default: yargs } = await import("yargs");
    await yargs(["update-field", "--field", "f1", ...args])
      .command(createUpdateFieldCommand(() => client as FrontdoorClient))
      .fail(false)
      .exitProcess(false)
      .parseAsync();
  };

  it("--remove-option A --remove-option B needs a confirm for each", async () => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await parse(client, ["--remove-option", "Frontdoor API", "--remove-option", "Public API", "--confirm-remove", "Frontdoor API", "--yes"]);
    expect(client.updateField).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(/--confirm-remove "Public API"/);
    expect(process.exitCode).toBe(1);
  });

  it("--remove-option A B (greedy array) removes both, and each still needs its --confirm-remove", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await parse(client, ["--remove-option", "o1", "o2", "--confirm-remove", "Frontdoor API", "--yes"]);
    expect(client.updateField).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(err.mock.calls[0][0]).toMatch(/--confirm-remove "Public API"/);
    process.exitCode = 0;
    await parse(client, ["--remove-option", "o1", "o2", "--confirm-remove", "Frontdoor API", "--confirm-remove", "Public API", "--yes"]);
    expect(client.updateField.mock.calls[0][1].type_config.options.rem).toEqual(["o1", "o2"]);
  });

  it("an empty --remove-option value is an unknown option and sends nothing", async () => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await parse(client, ["--remove-option", "", "--yes"]);
    expect(client.updateField).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(err.mock.calls[0][0]).toMatch(/unknown option ""/);
  });

  it("a value starting with a dash: '--add-option -x' is refused by yargs, '--add-option=-x' adds it", async () => {
    const client = fake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(parse(client, ["--add-option", "-x", "--yes"])).rejects.toThrow(/Not enough arguments/);
    expect(client.updateField).not.toHaveBeenCalled();
    await parse(client, ["--add-option=-x", "--yes"]);
    expect(client.updateField.mock.calls[0][1].type_config.options.add[0].name).toBe("-x");
  });
});
