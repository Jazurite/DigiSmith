import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import yargs from "yargs";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClickUpClient, ClickUpTask } from "@digismith/clickup-client";
import { createCreateTaskCommand } from "./create-task.ts";
import { handlerOf } from "./handler-of.test-util.ts";

describe("createCreateTaskCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("describes --parent with its own wording", async () => {
    const builder = createCreateTaskCommand().builder as (y: ReturnType<typeof yargs>) => ReturnType<typeof yargs>;
    const help = (await builder(yargs([]).wrap(null)).getHelp()).replace(/\s+/g, " ");
    expect(help).toContain("parent task id (a subtask must be in the parent's list)");
  });

  it("exposes the shared task-field options and its own ones", () => {
    const builder = createCreateTaskCommand().builder as (y: ReturnType<typeof yargs>) => ReturnType<typeof yargs>;
    const keys = Object.keys(builder(yargs([])).getOptions().key).filter((k) => k !== "help" && k !== "version");
    expect(keys).toEqual([
      "list", "name",
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

  it("creates a task on the given list and prints it as JSON", async () => {
    const task = { id: "abc", name: "V.1" } as unknown as ClickUpTask;
    const createTask = vi.fn().mockResolvedValue(task);
    const fakeClient = { createTask } as unknown as ClickUpClient;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createCreateTaskCommand(() => fakeClient);

    await handlerOf<{
        list: string;
        name: string;
        status?: string;
      }>(command)({ list: "901", name: "V.1", status: "done" });

    expect(createTask).toHaveBeenCalledWith("901", { name: "V.1", status: "done" });
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(task, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("refuses a due date before the start date and makes no call", async () => {
    const createTask = vi.fn();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createCreateTaskCommand(() => ({ createTask }) as unknown as ClickUpClient);
    await handlerOf<object>(command)({ list: "901", name: "x", startDate: "2026-10-12", dueDate: "2026-10-11" });
    expect(createTask).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][0]).toMatch(/is before the start date/);
    expect(process.exitCode).toBe(1);
  });

  it("passes --parent through to the task body", async () => {
    const createTask = vi.fn().mockResolvedValue({ id: "abc" });
    vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createCreateTaskCommand(() => ({ createTask }) as unknown as ClickUpClient);

    await handlerOf<{ list: string; name: string; parent?: string }>(command)({
      list: "901",
      name: "Child",
      parent: "p1",
    });

    expect(createTask).toHaveBeenCalledWith("901", { name: "Child", parent: "p1" });
  });

  it("errors and sets exitCode 1 when the client throws", async () => {
    const createTask = vi.fn().mockRejectedValue(new Error("HTTP 400"));
    const fakeClient = { createTask } as unknown as ClickUpClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createCreateTaskCommand(() => fakeClient);

    await handlerOf<{ list: string; name: string }>(command)({ list: "901", name: "V.1" });

    expect(errorSpy).toHaveBeenCalledWith("clickup create-task: HTTP 400");
    expect(process.exitCode).toBe(1);
  });

  it("resolves --type by name and sends custom_item_id", async () => {
    const createTask = vi.fn().mockResolvedValue({ id: "abc" });
    const getTaskTypes = vi.fn().mockResolvedValue([
      { id: 1030, name: "Epic", name_plural: "Epics", description: null, avatar: null },
    ]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createCreateTaskCommand(() => ({ createTask, getTaskTypes }) as unknown as ClickUpClient);

    await handlerOf<object>(command)({ list: "901", name: "V.1", type: "epic" });

    expect(createTask).toHaveBeenCalledWith("901", { name: "V.1", custom_item_id: 1030 });
  });

  it("errors without calling the API write when --type is unknown", async () => {
    const createTask = vi.fn();
    const getTaskTypes = vi.fn().mockResolvedValue([]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createCreateTaskCommand(() => ({ createTask, getTaskTypes }) as unknown as ClickUpClient);

    await handlerOf<object>(command)({ list: "901", name: "V.1", type: "saga" });

    expect(createTask).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][0]).toMatch(/clickup create-task: unknown task type "saga"/);
    expect(process.exitCode).toBe(1);
  });

  describe("--field", () => {
    const fields = [
      { id: "f1", name: "ClickUp API Type", type: "drop_down", type_config: { options: [{ id: "o1", name: "Frontdoor", orderindex: 0 }] } },
      { id: "f2", name: "Notes", type: "text", type_config: {} },
    ];
    const mk = () => {
      const calls: string[] = [];
      const client = {
        get: vi.fn().mockResolvedValue({ id: "new1", custom_fields: [{ id: "f1", value: 0 }, { id: "f2", value: "hello" }] }),
        getListFields: vi.fn().mockResolvedValue(fields),
        createTask: vi.fn().mockImplementation(async () => { calls.push("create"); return { id: "new1" }; }),
        setCustomField: vi.fn().mockImplementation(async () => { calls.push("set"); }),
      };
      return { client, calls, handler: createCreateTaskCommand(() => client as unknown as ClickUpClient).handler as (a: object) => Promise<void> };
    };

    it("creates the task, then sets each field (repeatable)", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const { client, calls, handler } = mk();
      await handler({ list: "L", name: "t", field: ["ClickUp API Type=Frontdoor", "Notes=hello"] });
      expect(client.getListFields).toHaveBeenCalledWith("L");
      expect(calls).toEqual(["create", "set", "set"]);
      expect(client.setCustomField).toHaveBeenNthCalledWith(1, "new1", "f1", "o1");
      expect(client.setCustomField).toHaveBeenNthCalledWith(2, "new1", "f2", "hello");
    });

    it("sets a Relationship field with resolved task ids", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const { client, handler } = mk();
      (client.getListFields as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "f9", name: "Epic", type: "list_relationship", type_config: {} }]);
      (client as unknown as { getTaskByRef: unknown }).getTaskByRef = vi.fn(async (r: string) => ({ id: r === "DGS-343" ? "id343" : r }));
      await handler({ list: "L", name: "t", field: ["Epic=DGS-343"] });
      expect(client.setCustomField).toHaveBeenCalledWith("new1", "f9", { add: ["id343"], rem: [] });
    });

    describe("read-back", () => {
      const twoFields = [
        { id: "fs", name: "Sign-off", type: "drop_down", type_config: { options: [{ id: "s-auto", name: "Auto", orderindex: 0 }, { id: "s-jack", name: "Jack", orderindex: 1 }] } },
        { id: "fm", name: "Mode", type: "drop_down", type_config: { options: [{ id: "m-auto", name: "Autonomous", orderindex: 0 }, { id: "m-man", name: "Manual", orderindex: 1 }] } },
      ];
      const task = (sign: number, mode: number) => ({ id: "new1", custom_fields: [{ id: "fs", value: sign }, { id: "fm", value: mode }] });
      const mk2 = () => {
        const m = mk();
        (m.client.getListFields as ReturnType<typeof vi.fn>).mockResolvedValue(twoFields);
        return m;
      };

      it("sets two dropdowns where the wanted option is not orderindex 0", async () => {
        vi.spyOn(console, "log").mockImplementation(() => {});
        const cases: [string[], [string, string][], [number, number]][] = [
          [["Sign-off=Auto", "Mode=Manual"], [["fs", "s-auto"], ["fm", "m-man"]], [0, 1]],
          [["Mode=Manual", "Sign-off=Auto"], [["fm", "m-man"], ["fs", "s-auto"]], [0, 1]],
          [["Mode=Manual", "Sign-off=Jack"], [["fm", "m-man"], ["fs", "s-jack"]], [1, 1]],
        ];
        for (const [flags, calls, [sign, mode]] of cases) {
          process.exitCode = undefined;
          const { client, handler } = mk2();
          (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(task(sign, mode));
          await handler({ list: "L", name: "t", field: flags });
          expect((client.setCustomField as ReturnType<typeof vi.fn>).mock.calls).toEqual(calls.map(([f, v]) => ["new1", f, v]));
          expect(process.exitCode).toBe(0);
        }
      });

      it("exits 1 and prints both values when Mode reads back wrong", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const { client, handler } = mk2();
        (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(task(0, 0));
        await handler({ list: "L", name: "t", field: ["Sign-off=Auto", "Mode=Manual"] });
        expect(process.exitCode).toBe(1);
        const text = String(errorSpy.mock.calls[0][0]);
        expect(text).toContain("Mode");
        expect(text).toContain("Manual (1)");
        expect(text).toContain("Autonomous (0)");
        expect(text).toContain("new1");
        expect(logSpy).toHaveBeenCalledWith(JSON.stringify(task(0, 0), null, 2));
      });

      it("retries a mismatched field once and passes", async () => {
        vi.spyOn(console, "log").mockImplementation(() => {});
        const { client, handler } = mk2();
        (client.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(task(0, 0)).mockResolvedValueOnce(task(0, 1));
        await handler({ list: "L", name: "t", field: ["Sign-off=Auto", "Mode=Manual"] });
        expect((client.setCustomField as ReturnType<typeof vi.fn>).mock.calls).toEqual([
          ["new1", "fs", "s-auto"],
          ["new1", "fm", "m-man"],
          ["new1", "fm", "m-man"],
        ]);
        expect(process.exitCode).toBe(0);
      });

      it("does not read back or retry without --field", async () => {
        vi.spyOn(console, "log").mockImplementation(() => {});
        const { client, handler } = mk2();
        await handler({ list: "L", name: "t" });
        expect(client.get).not.toHaveBeenCalled();
        expect(client.createTask).toHaveBeenCalledTimes(1);
      });
    });

    it("creates nothing when a field is bad", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { client, handler } = mk();
      await handler({ list: "L", name: "t", field: ["ClickUp API Type=Nope"] });
      expect(client.createTask).not.toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toMatch(/clickup create-task: unknown option "Nope"/);
      expect(process.exitCode).toBe(1);
    });
  });

  describe("markdown description", () => {
    const run = (argv: object, factory: () => ClickUpClient) =>
      (createCreateTaskCommand(factory).handler as (a: object) => Promise<void>)({ list: "l1", name: "n", ...argv });
    const fake = (write = vi.fn().mockResolvedValue({ id: "abc" })) => ({
      write,
      factory: () => ({ createTask: write }) as unknown as ClickUpClient,
    });
    const throwingFactory = vi.fn(() => {
      throw new Error("no credentials");
    });

    it("sends --markdown-description as exactly markdown_description", async () => {
      const { write, factory } = fake();
      vi.spyOn(console, "log").mockImplementation(() => {});

      await run({ markdownDescription: "**hi**" }, factory);

      expect(write).toHaveBeenCalledWith("l1", { name: "n", markdown_description: "**hi**" });
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

        expect(write).toHaveBeenCalledWith("l1", { name: "n", markdown_description: "a\r\nb\n" });
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
      const factory = vi.fn(() => ({ createTask: write }) as unknown as ClickUpClient);
      vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await yargs([]).command(createCreateTaskCommand(factory)).parseAsync(["create-task", ...args, "--list", "901", "--name", "x"]);
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
});
