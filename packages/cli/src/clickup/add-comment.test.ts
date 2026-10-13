import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClickUpClient } from "@digismith/clickup-client";
import { parseCommentArgv, createAddCommentCommand } from "./add-comment.ts";

type Handler = (argv: Record<string, unknown>) => Promise<void>;
const run = (c: { handler: unknown }, argv: Record<string, unknown>) => (c.handler as Handler)(argv);
const task = (id: string, key: string) => ({ id, custom_id: key, name: `name ${key}` });
const out = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.flat().join("\n");

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
});

describe("parseCommentArgv", () => {
  it("reads --text", () => {
    expect(parseCommentArgv({ task: "a1", text: "hello" })).toEqual({ task: "a1", text: "hello" });
  });
  it("reads --markdown-file as plain text", () => {
    const dir = mkdtempSync(join(tmpdir(), "dg442-"));
    try {
      const f = join(dir, "c.md");
      writeFileSync(f, "# Title\n\nbody\n");
      expect(parseCommentArgv({ task: "DGS-1", markdownFile: f }).text).toBe("# Title\n\nbody\n");
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
  it("refuses a flag given twice and strips a leading BOM", () => {
    expect(() => parseCommentArgv({ task: "a1", text: ["a", "b"] as unknown as string })).toThrow("once");
    const dir = mkdtempSync(join(tmpdir(), "dg442-"));
    try {
      const f = join(dir, "b.md");
      writeFileSync(f, "\uFEFFhi");
      expect(parseCommentArgv({ task: "a1", markdownFile: f }).text).toBe("hi");
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
  it("needs exactly one of --text and --markdown-file", () => {
    expect(() => parseCommentArgv({ task: "a1" })).toThrow("exactly one");
    expect(() => parseCommentArgv({ task: "a1", text: "x", markdownFile: "f" })).toThrow("exactly one");
  });
  it("refuses a bad ref, an empty text, a missing file and an empty file", () => {
    expect(() => parseCommentArgv({ task: "a/b", text: "x" })).toThrow("--task");
    expect(() => parseCommentArgv({ task: "a1", text: "   " })).toThrow("empty");
    expect(() => parseCommentArgv({ task: "a1", markdownFile: "/no/such/file.md" })).toThrow("cannot read");
    const dir = mkdtempSync(join(tmpdir(), "dg442-"));
    try {
      const f = join(dir, "e.md");
      writeFileSync(f, "\n");
      expect(() => parseCommentArgv({ task: "a1", markdownFile: f })).toThrow("empty");
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe("add-comment command", () => {
  it("a dry run with a plain id prints the call, needs no client and says a second --yes posts a second comment", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createAddCommentCommand(() => { throw new Error("no auth"); }), { task: "a1", text: "hi" });
    expect(log).toHaveBeenCalledWith("POST /task/a1/comment");
    expect(out(log)).toContain('"comment_text": "hi"');
    expect(out(log)).toContain("notify_all");
    expect(out(log)).toContain("second comment");
    expect(out(log)).toContain("nothing sent; add --yes to send");
    expect(process.exitCode).toBe(0);
  });

  it("a dry run with a key resolves it, sends nothing and says it read", async () => {
    const getTaskByRef = vi.fn().mockResolvedValue(task("id436", "DGS-436"));
    const addTaskComment = vi.fn();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createAddCommentCommand(() => ({ getTaskByRef, addTaskComment }) as unknown as ClickUpClient), { task: "DGS-436", text: "hi" });
    expect(addTaskComment).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("POST /task/id436/comment");
    expect(out(log)).toContain("read 1 task (read-only call) to resolve; no write made");
  });

  it("--yes posts to the resolved id and reads the comment back", async () => {
    const getTaskByRef = vi.fn().mockResolvedValue(task("id436", "DGS-436"));
    const addTaskComment = vi.fn().mockResolvedValue({ id: 77 });
    const getTaskComments = vi.fn().mockResolvedValue([{ id: "77", comment_text: "hi" }]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createAddCommentCommand(() => ({ getTaskByRef, addTaskComment, getTaskComments }) as unknown as ClickUpClient), {
      task: "DGS-436",
      text: "hi",
      yes: true,
    });
    expect(addTaskComment).toHaveBeenCalledWith("id436", "hi");
    expect(out(log)).toContain("added comment 77");
    expect(out(log)).toContain("read back OK");
    expect(process.exitCode).toBe(0);
  });

  it("--yes with --markdown-file posts the file text", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dg442-"));
    try {
      const f = join(dir, "c.md");
      writeFileSync(f, "from file");
      const getTaskByRef = vi.fn().mockResolvedValue(task("a1", "K-1"));
      const addTaskComment = vi.fn().mockResolvedValue({ id: 5 });
      const getTaskComments = vi.fn().mockResolvedValue([{ id: 5, comment_text: "from file" }]);
      vi.spyOn(console, "log").mockImplementation(() => {});
      await run(createAddCommentCommand(() => ({ getTaskByRef, addTaskComment, getTaskComments }) as unknown as ClickUpClient), {
        task: "a1",
        markdownFile: f,
        yes: true,
      });
      expect(addTaskComment).toHaveBeenCalledWith("a1", "from file");
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("a read-back that misses the comment is an error, and the post was sent", async () => {
    const getTaskByRef = vi.fn().mockResolvedValue(task("a1", "K-1"));
    const addTaskComment = vi.fn().mockResolvedValue({ id: 9 });
    const getTaskComments = vi.fn().mockResolvedValue([{ id: "1" }]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createAddCommentCommand(() => ({ getTaskByRef, addTaskComment, getTaskComments }) as unknown as ClickUpClient), {
      task: "a1",
      text: "x",
      yes: true,
    });
    expect(addTaskComment).toHaveBeenCalled();
    expect(out(err)).toContain("read-back");
    expect(process.exitCode).toBe(1);
  });

  it("a failed read-back after the post says it was sent and not to send again", async () => {
    const getTaskByRef = vi.fn().mockResolvedValue(task("a1", "K-1"));
    const addTaskComment = vi.fn().mockResolvedValue({ id: 9 });
    const getTaskComments = vi.fn().mockRejectedValue(new Error("status code 429"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createAddCommentCommand(() => ({ getTaskByRef, addTaskComment, getTaskComments }) as unknown as ClickUpClient), {
      task: "a1",
      text: "x",
      yes: true,
    });
    expect(out(err)).toContain("sent (comment 9)");
    expect(out(err)).toContain("do not send again");
    expect(process.exitCode).toBe(1);
  });

  it("an unknown key stops before any post", async () => {
    const getTaskByRef = vi.fn().mockRejectedValue(new Error("Request failed with status code 404"));
    const addTaskComment = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createAddCommentCommand(() => ({ getTaskByRef, addTaskComment }) as unknown as ClickUpClient), { task: "DGS-9999", text: "x", yes: true });
    expect(addTaskComment).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("a bad flag combination exits 1 with no client made", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createAddCommentCommand(() => { throw new Error("no auth"); }), { task: "a1" });
    expect(out(err)).toContain("exactly one");
    expect(process.exitCode).toBe(1);
  });
});
