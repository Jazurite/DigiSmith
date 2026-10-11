import { describe, it, expect, vi, afterEach } from "vitest";
import type { FrontdoorClient } from "@digismith/clickup-client";
import { createCreateFieldCommand } from "./create-field.ts";

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
  return { createField } as unknown as FrontdoorClient & { createField: ReturnType<typeof vi.fn> };
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
    ["--list", { name: "P", option: ["a"], list: "5" }, "--list is not supported yet"],
    ["other type", { name: "P", option: ["a"], folder: "1", type: "text" }, "only drop_down"],
    ["no folder", { name: "P", option: ["a"] }, "--folder is required"],
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
});
