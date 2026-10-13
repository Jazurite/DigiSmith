import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import yargs from "yargs";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClickUpClient, ClickUpTask } from "@digismith/clickup-client";
import { createUpdateTaskCommand } from "./update-task.ts";

describe("createUpdateTaskCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("describes --parent with its own wording", async () => {
    const builder = createUpdateTaskCommand().builder as (y: ReturnType<typeof yargs>) => ReturnType<typeof yargs>;
    const help = (await builder(yargs([]).wrap(null)).getHelp()).replace(/\s+/g, " ");
    expect(help).toContain("parent task id (moves the task into the parent's list); empty value clears it");
  });

  it("exposes the shared task-field options and its own ones", () => {
    const builder = createUpdateTaskCommand().builder as (y: ReturnType<typeof yargs>) => ReturnType<typeof yargs>;
    const keys = Object.keys(builder(yargs([])).getOptions().key).filter((k) => k !== "help" && k !== "version");
    expect(keys).toEqual([
      "task", "name",
      "description",
      "markdown-description",
      "markdown-description-file",
      "status",
      "start-date",
      "due-date",
      "priority",
      "parent",
      "type",
      "field",
    ]);
  });

  it("updates the given task and prints the result as JSON", async () => {
    const task = { id: "abc", status: { status: "done" } } as unknown as ClickUpTask;
    const updateTask = vi.fn().mockResolvedValue(task);
    const fakeClient = { updateTask } as unknown as ClickUpClient;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createUpdateTaskCommand(() => fakeClient);

    await (
      command.handler as (argv: { task: string; status?: string }) => Promise<void>
    )({ task: "abc", status: "done" });

    expect(updateTask).toHaveBeenCalledWith("abc", { status: "done" });
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(task, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("passes --parent through, and an empty value as none", async () => {
    const updateTask = vi.fn().mockResolvedValue({ id: "abc" });
    vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createUpdateTaskCommand(() => ({ updateTask }) as unknown as ClickUpClient);
    const handler = command.handler as (argv: { task: string; parent?: string }) => Promise<void>;

    await handler({ task: "abc", parent: "p1" });
    await handler({ task: "abc", parent: "" });

    expect(updateTask).toHaveBeenNthCalledWith(1, "abc", { parent: "p1" });
    expect(updateTask).toHaveBeenNthCalledWith(2, "abc", { parent: "none" });
  });

  describe("date order with one date given", () => {
    const run = async (argv: Record<string, unknown>, stored: { start_date: string | null; due_date: string | null }) => {
      const updateTask = vi.fn().mockResolvedValue({ id: "abc" });
      const get = vi.fn().mockResolvedValue(stored);
      vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const command = createUpdateTaskCommand(() => ({ updateTask, get }) as unknown as ClickUpClient);
      await (command.handler as (a: unknown) => Promise<void>)({ task: "abc", ...argv });
      return { updateTask, get, errorSpy };
    };

    it("refuses a due date before the stored start, and makes no update", async () => {
      const { updateTask, get, errorSpy } = await run({ dueDate: "2026-10-11" }, { start_date: "1791752400000", due_date: null });
      expect(get).toHaveBeenCalledWith("/task/abc");
      expect(updateTask).not.toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toMatch(/due date 2026-10-11 04:00 UTC\+7 is before the start date 2026-10-12 04:00 UTC\+7/);
      expect(process.exitCode).toBe(1);
    });

    it("refuses a start date after the stored due", async () => {
      const { updateTask, errorSpy } = await run({ startDate: "2026-10-13" }, { start_date: null, due_date: "1791752400000" });
      expect(updateTask).not.toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toMatch(/due date 2026-10-12 04:00 UTC\+7 is before the start date 2026-10-13 04:00 UTC\+7/);
    });

    it("updates when the order holds", async () => {
      const { updateTask } = await run({ dueDate: "2026-10-12" }, { start_date: "1791666000000", due_date: null });
      expect(updateTask).toHaveBeenCalledWith("abc", { due_date: 1791752400000, due_date_time: false });
      expect(process.exitCode).toBe(0);
    });

    it("does not check when the other date is not stored", async () => {
      const { updateTask } = await run({ dueDate: "2026-10-11" }, { start_date: null, due_date: null });
      expect(updateTask).toHaveBeenCalled();
    });

    it("does not read the task when both dates are given or none", async () => {
      const both = await run({ startDate: "2026-10-11", dueDate: "2026-10-12" }, { start_date: null, due_date: null });
      expect(both.get).not.toHaveBeenCalled();
      const none = await run({ status: "done" }, { start_date: null, due_date: null });
      expect(none.get).not.toHaveBeenCalled();
    });
  });

  it("errors and sets exitCode 1 when the client throws", async () => {
    const updateTask = vi.fn().mockRejectedValue(new Error("HTTP 404"));
    const fakeClient = { updateTask } as unknown as ClickUpClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createUpdateTaskCommand(() => fakeClient);

    await (command.handler as (argv: { task: string; status?: string }) => Promise<void>)({ task: "abc", status: "done" });

    expect(errorSpy).toHaveBeenCalledWith("clickup update-task: HTTP 404");
    expect(process.exitCode).toBe(1);
  });

  it("resolves --type by name and sends custom_item_id", async () => {
    const updateTask = vi.fn().mockResolvedValue({ id: "abc" });
    const getTaskTypes = vi.fn().mockResolvedValue([
      { id: 1030, name: "Epic", name_plural: "Epics", description: null, avatar: null },
    ]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createUpdateTaskCommand(() => ({ updateTask, getTaskTypes }) as unknown as ClickUpClient);

    await (command.handler as (argv: object) => Promise<void>)({ task: "abc", type: "epic" });

    expect(updateTask).toHaveBeenCalledWith("abc", { custom_item_id: 1030 });
  });

  it("errors without calling the API write when --type is unknown", async () => {
    const updateTask = vi.fn();
    const getTaskTypes = vi.fn().mockResolvedValue([]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createUpdateTaskCommand(() => ({ updateTask, getTaskTypes }) as unknown as ClickUpClient);

    await (command.handler as (argv: object) => Promise<void>)({ task: "abc", type: "saga" });

    expect(updateTask).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][0]).toMatch(/clickup update-task: unknown task type "saga"/);
    expect(process.exitCode).toBe(1);
  });

  describe("--field", () => {
    const fields = [
      { id: "f1", name: "ClickUp API Type", type: "drop_down", type_config: { options: [{ id: "o1", name: "Frontdoor" }] } },
    ];
    const mk = () => {
      const calls: string[] = [];
      const client = {
        get: vi.fn().mockImplementation(async () => ({ id: "abc", list: { id: "L" } })),
        getListFields: vi.fn().mockResolvedValue(fields),
        updateTask: vi.fn().mockImplementation(async () => { calls.push("put"); return { id: "abc" }; }),
        setCustomField: vi.fn().mockImplementation(async () => { calls.push("set"); }),
      };
      return { client, calls, handler: createUpdateTaskCommand(() => client as unknown as ClickUpClient).handler as (a: object) => Promise<void> };
    };

    it("sets the field on the task's list and skips the empty PUT", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const { client, handler } = mk();
      await handler({ task: "abc", field: ["ClickUp API Type=Frontdoor"] });
      expect(client.getListFields).toHaveBeenCalledWith("L");
      expect(client.updateTask).not.toHaveBeenCalled();
      expect(client.setCustomField).toHaveBeenCalledWith("abc", "f1", "o1");
      expect(process.exitCode).toBe(0);
    });

    it("sets a Relationship field with resolved task ids", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const { client, handler } = mk();
      (client.getListFields as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "f9", name: "Epic", type: "list_relationship", type_config: {} }]);
      (client as unknown as { getTaskByRef: unknown }).getTaskByRef = vi.fn(async (r: string) => ({ id: r === "DGS-343" ? "id343" : r }));
      await handler({ task: "abc", field: ["Epic=DGS-343,-old1"] });
      expect(client.setCustomField).toHaveBeenCalledWith("abc", "f9", { add: ["id343"], rem: ["old1"] });
      expect(process.exitCode).toBe(0);
    });

    it("puts the task flags first, then sets the fields", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const { calls, handler } = mk();
      await handler({ task: "abc", status: "done", field: ["f1=Frontdoor"] });
      expect(calls).toEqual(["put", "set"]);
    });

    it("writes nothing when a field is bad", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { client, handler } = mk();
      await handler({ task: "abc", status: "done", field: ["Nope=1"] });
      expect(client.updateTask).not.toHaveBeenCalled();
      expect(client.setCustomField).not.toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toMatch(/clickup update-task: unknown field "Nope"/);
      expect(process.exitCode).toBe(1);
    });
  });

  describe("markdown description", () => {
    const run = (argv: object, factory: () => ClickUpClient) =>
      (createUpdateTaskCommand(factory).handler as (a: object) => Promise<void>)({ task: "abc", ...argv });
    const fake = (write = vi.fn().mockResolvedValue({ id: "abc" })) => ({
      write,
      factory: () => ({ updateTask: write }) as unknown as ClickUpClient,
    });
    const throwingFactory = vi.fn(() => {
      throw new Error("no credentials");
    });

    it("sends --markdown-description as exactly markdown_description", async () => {
      const { write, factory } = fake();
      vi.spyOn(console, "log").mockImplementation(() => {});

      await run({ markdownDescription: "**hi**" }, factory);

      expect(write).toHaveBeenCalledWith("abc", { markdown_description: "**hi**" });
      expect(write.mock.calls[0][1]).not.toHaveProperty("description");
      expect(process.exitCode).toBe(0);
    });

    it("sends the content of --markdown-description-file", async () => {
      const dir = mkdtempSync(join(tmpdir(), "dg-md-handler-"));
      try {
        const file = join(dir, "d.md");
        writeFileSync(file, "\uFEFFa\r\nb\n", "utf8");
        const { write, factory } = fake();
        vi.spyOn(console, "log").mockImplementation(() => {});

        await run({ markdownDescriptionFile: file }, factory);

        expect(write).toHaveBeenCalledWith("abc", { markdown_description: "a\r\nb\n" });
        expect(write.mock.calls[0][1]).not.toHaveProperty("description");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it.each([
      ["--description and --markdown-description", { description: "a", markdownDescription: "b" }],
      ["--markdown-description and the file flag", { markdownDescription: "a", markdownDescriptionFile: "b.md" }],
    ])("refuses %s together, with no client and no write", async (_label, argv) => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await run(argv, throwingFactory);

      expect(throwingFactory).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("use only one of --description"));
      expect(process.exitCode).toBe(1);
    });

    it("reports a missing file with exit 1, no client and no write", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await run({ markdownDescriptionFile: join(tmpdir(), "no-such-dir", "x.md") }, throwingFactory);

      expect(throwingFactory).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("cannot read --markdown-description-file"));
      expect(process.exitCode).toBe(1);
    });
  });

  describe("--priority through the real parser", () => {
    const run = async (args: string[]) => {
      const write = vi.fn().mockResolvedValue({ id: "abc" });
      const factory = vi.fn(() => ({ updateTask: write }) as unknown as ClickUpClient);
      vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await yargs([]).command(createUpdateTaskCommand(factory)).parseAsync(["update-task", ...args, "--task", "abc"]);
      return { write, factory, errorSpy };
    };

    it.each([["7", "7"], ["0", "0"], ["abc", "NaN"]])("refuses --priority %s before any client is built", async (flag, shown) => {
      const { write, factory, errorSpy } = await run(["--priority", flag]);
      expect(factory).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toContain(`invalid --priority "${shown}" — expected an integer 1-4`);
      expect(process.exitCode).toBe(1);
    });

    it.each(["1", "2", "3", "4"])("accepts --priority %s", async (flag) => {
      process.exitCode = 1;
      const { write } = await run(["--priority", flag]);
      expect(write).toHaveBeenCalledTimes(1);
      expect(write.mock.calls[0].at(-1)).toMatchObject({ priority: Number(flag) });
      expect(process.exitCode).toBe(0);
    });
  });

  describe("no-op write", () => {
    type Handler = (argv: Record<string, unknown>) => Promise<void>;
    const parse = (args: string[]) => {
      const builder = createUpdateTaskCommand().builder as (y: ReturnType<typeof yargs>) => ReturnType<typeof yargs>;
      return builder(yargs(args)).exitProcess(false).parseSync() as Record<string, unknown>;
    };

    it("errors before any client or call when no change flag is given", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const factory = vi.fn();
      const command = createUpdateTaskCommand(factory);

      await (command.handler as Handler)({ task: "abc" });

      expect(factory).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("nothing to update"));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--markdown-description-file"));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--field"));
      expect(process.exitCode).toBe(1);
    });

    it("errors for the argv the real yargs parser gives for --task alone (no default adds a change)", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const factory = vi.fn();
      const argv = parse(["--task", "abc"]);

      await (createUpdateTaskCommand(factory).handler as Handler)(argv);

      expect(factory).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("nothing to update"));
      expect(process.exitCode).toBe(1);
    });

    it.each([
      ["--name", "n"],
      ["--name", ""],
      ["--description", "d"],
      ["--markdown-description", "# m"],
      ["--status", "done"],
      ["--start-date", "2026-10-01"],
      ["--due-date", "2026-10-02"],
      ["--priority", "2"],
      ["--parent", "p1"],
      ["--parent", ""],
      ["--description", ""],
      ["--type", "0"],
      ["--field", "Lesson=x"],
    ])("is not a no-op with %s %j alone", async (flag, value) => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const client = {
        updateTask: vi.fn().mockResolvedValue({ id: "abc" }),
        getTaskTypes: vi.fn().mockResolvedValue([{ id: 0, name: "Task", name_plural: "Tasks" }]),
        get: vi.fn().mockResolvedValue({ list: { id: "l1" }, id: "abc" }),
        getListFields: vi.fn().mockResolvedValue([{ id: "f1", name: "Lesson", type: "text", type_config: {} }]),
        setCustomField: vi.fn().mockResolvedValue(undefined),
      } as unknown as ClickUpClient;
      const factory = vi.fn(() => client);

      await (createUpdateTaskCommand(factory).handler as Handler)(parse(["--task", "abc", flag, value]));

      expect(factory).toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(0);
    });

    it("is not a no-op with --markdown-description-file alone", async () => {
      const dir = mkdtempSync(join(tmpdir(), "dgs11-"));
      const file = join(dir, "d.md");
      writeFileSync(file, "# hi");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "log").mockImplementation(() => {});
      const factory = vi.fn(() => ({ updateTask: vi.fn().mockResolvedValue({}) }) as unknown as ClickUpClient);
      try {
        await (createUpdateTaskCommand(factory).handler as Handler)(
          parse(["--task", "abc", "--markdown-description-file", file])
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
      expect(factory).toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(0);
    });
  });
});
