import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { parseRelationArgv, describeCall, hasRelation } from "./relation-write.ts";
import { createAddDependencyCommand } from "./add-dependency.ts";
import { createRemoveDependencyCommand } from "./remove-dependency.ts";
import { createAddLinkCommand } from "./add-link.ts";
import { createRemoveLinkCommand } from "./remove-link.ts";

const dep = { kind: "dependency", action: "add" } as const;
const link = { kind: "link", action: "add" } as const;

type Handler = (argv: Record<string, unknown>) => Promise<void>;
const run = (c: { handler: unknown }, argv: Record<string, unknown>) => (c.handler as Handler)(argv);

const task = (id: string, key: string, extra: Record<string, unknown> = {}) => ({
  id,
  custom_id: key,
  name: `name ${key}`,
  dependencies: [],
  linked_tasks: [],
  ...extra,
});

describe("parseRelationArgv", () => {
  it("reads --waiting-on and --blocking", () => {
    expect(parseRelationArgv(dep, { task: "a1", waitingOn: "DGS-2" })).toEqual({ task: "a1", other: "DGS-2", side: "waiting-on" });
    expect(parseRelationArgv(dep, { task: "a1", blocking: "b2" })).toEqual({ task: "a1", other: "b2", side: "blocking" });
  });
  it("needs exactly one of --waiting-on and --blocking", () => {
    expect(() => parseRelationArgv(dep, { task: "a1" })).toThrow("exactly one");
    expect(() => parseRelationArgv(dep, { task: "a1", waitingOn: "b", blocking: "c" })).toThrow("exactly one");
  });
  it("refuses --to on a dependency and --waiting-on on a link", () => {
    expect(() => parseRelationArgv(dep, { task: "a1", to: "b" })).toThrow("no --to");
    expect(() => parseRelationArgv(link, { task: "a1", waitingOn: "b" })).toThrow("no --waiting-on");
    expect(() => parseRelationArgv(link, { task: "a1" })).toThrow("--to");
  });
  it("refuses a bad ref and a self relation", () => {
    expect(() => parseRelationArgv(link, { task: "a/b", to: "c" })).toThrow("--task");
    expect(() => parseRelationArgv(link, { task: "a1", to: "../x" })).toThrow("other task");
    expect(() => parseRelationArgv(link, { task: "DGS-1", to: "dgs-1" })).toThrow("itself");
  });
});

describe("describeCall", () => {
  it("builds the four calls", () => {
    const req = { task: "a", other: "b", side: "waiting-on" as const };
    expect(describeCall(dep, req)).toEqual({ method: "POST", path: "/task/a/dependency", body: { depends_on: "b" } });
    expect(describeCall({ kind: "dependency", action: "remove" }, { ...req, side: "blocking" })).toEqual({
      method: "DELETE",
      path: "/task/a/dependency?dependency_of=b",
    });
    expect(describeCall(link, req)).toEqual({ method: "POST", path: "/task/a/link/b" });
    expect(describeCall({ kind: "link", action: "remove" }, req)).toEqual({ method: "DELETE", path: "/task/a/link/b" });
  });
});

describe("hasRelation", () => {
  it("reads dependency rows as task_id waits on depends_on", () => {
    const t = task("a", "DGS-1", { dependencies: [{ task_id: "a", depends_on: "b" }] }) as never;
    expect(hasRelation(dep, t, { task: "a", other: "b", side: "waiting-on" })).toBe(true);
    expect(hasRelation(dep, t, { task: "a", other: "b", side: "blocking" })).toBe(false);
    const u = task("b", "DGS-2", { dependencies: [{ task_id: "a", depends_on: "b" }] }) as never;
    expect(hasRelation(dep, u, { task: "b", other: "a", side: "blocking" })).toBe(true);
  });
  it("finds a link by either id", () => {
    const t = task("a", "DGS-1", { linked_tasks: [{ task_id: "a", link_id: "b" }] }) as never;
    expect(hasRelation(link, t, { task: "a", other: "b" })).toBe(true);
    expect(hasRelation(link, t, { task: "a", other: "c" })).toBe(false);
  });
});

describe("relation commands", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("a dry run with plain ids prints the call and never builds a client", async () => {
    const factory = vi.fn(() => {
      throw new Error("no credentials");
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createAddDependencyCommand(factory), { task: "a1", waitingOn: "b2" });
    expect(factory).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("POST /task/a1/dependency");
    expect(log).toHaveBeenCalledWith("nothing sent; add --yes to send");
    expect(process.exitCode).toBe(0);
  });

  it("a dry run with keys reads both tasks, sends no write", async () => {
    const getTaskByRef = vi.fn(async (r: string) => (r === "DGS-338" ? task("id338", "DGS-338") : task("id327", "DGS-327")));
    const addDependency = vi.fn();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createAddDependencyCommand(() => ({ getTaskByRef, addDependency }) as unknown as ClickUpClient), {
      task: "DGS-338",
      waitingOn: "DGS-327",
    });
    expect(addDependency).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("POST /task/id338/dependency");
    expect(log).toHaveBeenCalledWith(JSON.stringify({ depends_on: "id327" }, null, 2));
  });

  it("--yes adds the dependency and reads it back", async () => {
    const after = task("id338", "DGS-338", { dependencies: [{ task_id: "id338", depends_on: "id327" }] });
    const getTaskByRef = vi
      .fn()
      .mockResolvedValueOnce(task("id338", "DGS-338"))
      .mockResolvedValueOnce(task("id327", "DGS-327"))
      .mockResolvedValueOnce(after);
    const addDependency = vi.fn().mockResolvedValue(undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createAddDependencyCommand(() => ({ getTaskByRef, addDependency }) as unknown as ClickUpClient), {
      task: "DGS-338",
      waitingOn: "DGS-327",
      yes: true,
    });
    expect(addDependency).toHaveBeenCalledWith("id338", { dependsOn: "id327" });
    expect(log.mock.calls.flat().join("\n")).toContain("read back OK");
    expect(process.exitCode).toBe(0);
  });

  it("--yes on an add that is already set sends nothing", async () => {
    const t = task("a", "DGS-1", { linked_tasks: [{ task_id: "a", link_id: "b" }] });
    const getTaskByRef = vi.fn().mockResolvedValueOnce(t).mockResolvedValueOnce(task("b", "DGS-2"));
    const addLink = vi.fn();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createAddLinkCommand(() => ({ getTaskByRef, addLink }) as unknown as ClickUpClient), { task: "a", to: "b", yes: true });
    expect(addLink).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join("\n")).toContain("already set");
  });

  it("removing a relation that is not set is an error and sends nothing", async () => {
    const getTaskByRef = vi.fn().mockResolvedValueOnce(task("a", "DGS-1")).mockResolvedValueOnce(task("b", "DGS-2"));
    const removeLink = vi.fn();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createRemoveLinkCommand(() => ({ getTaskByRef, removeLink }) as unknown as ClickUpClient), { task: "a", to: "b", yes: true });
    expect(removeLink).not.toHaveBeenCalled();
    expect(err.mock.calls.flat().join("")).toContain("not set");
    expect(process.exitCode).toBe(1);
  });

  it("remove-dependency --yes removes it and checks it is gone", async () => {
    const before = task("a", "DGS-1", { dependencies: [{ task_id: "b", depends_on: "a" }] });
    const getTaskByRef = vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(task("b", "DGS-2")).mockResolvedValueOnce(task("a", "DGS-1"));
    const removeDependency = vi.fn().mockResolvedValue(undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createRemoveDependencyCommand(() => ({ getTaskByRef, removeDependency }) as unknown as ClickUpClient), {
      task: "a",
      blocking: "b",
      yes: true,
    });
    expect(removeDependency).toHaveBeenCalledWith("a", { dependencyOf: "b" });
    expect(log.mock.calls.flat().join("\n")).toContain("read back OK");
    expect(process.exitCode).toBe(0);
  });

  it("an unknown key stops before any write", async () => {
    const getTaskByRef = vi.fn().mockRejectedValue(new Error("Request failed with status code 404"));
    const addLink = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createAddLinkCommand(() => ({ getTaskByRef, addLink }) as unknown as ClickUpClient), { task: "DGS-9999", to: "b", yes: true });
    expect(addLink).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("a write the read-back does not show is an error, and the write was sent", async () => {
    const getTaskByRef = vi.fn(async (r: string) => (r === "a" ? task("a", "DGS-1") : task("b", "DGS-2")));
    const addLink = vi.fn().mockResolvedValue(undefined);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createAddLinkCommand(() => ({ getTaskByRef, addLink }) as unknown as ClickUpClient), { task: "a", to: "b", yes: true });
    expect(addLink).toHaveBeenCalledWith("a", "b");
    expect(err.mock.calls.flat().join("")).toContain("read-back");
    expect(process.exitCode).toBe(1);
  });

  it("add-link --yes sends the link and reads it back", async () => {
    const getTaskByRef = vi
      .fn()
      .mockResolvedValueOnce(task("a", "DGS-1"))
      .mockResolvedValueOnce(task("b", "DGS-2"))
      .mockResolvedValueOnce(task("a", "DGS-1", { linked_tasks: [{ task_id: "a", link_id: "b" }] }));
    const addLink = vi.fn().mockResolvedValue(undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createAddLinkCommand(() => ({ getTaskByRef, addLink }) as unknown as ClickUpClient), { task: "a", to: "b", yes: true });
    expect(addLink).toHaveBeenCalledWith("a", "b");
    expect(log.mock.calls.flat().join("\n")).toContain("added:");
    expect(log.mock.calls.flat().join("\n")).toContain("read back OK");
    expect(process.exitCode).toBe(0);
  });

  it("remove-link --yes removes the link and reads it back", async () => {
    const getTaskByRef = vi
      .fn()
      .mockResolvedValueOnce(task("a", "DGS-1", { linked_tasks: [{ task_id: "a", link_id: "b" }] }))
      .mockResolvedValueOnce(task("b", "DGS-2"))
      .mockResolvedValueOnce(task("a", "DGS-1"));
    const removeLink = vi.fn().mockResolvedValue(undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createRemoveLinkCommand(() => ({ getTaskByRef, removeLink }) as unknown as ClickUpClient), { task: "a", to: "b", yes: true });
    expect(removeLink).toHaveBeenCalledWith("a", "b");
    expect(log.mock.calls.flat().join("\n")).toContain("removed:");
    expect(log.mock.calls.flat().join("\n")).toContain("read back OK");
    expect(process.exitCode).toBe(0);
  });

  it("--yes with plain ids still reads both tasks", async () => {
    const getTaskByRef = vi.fn(async (r: string) => task(r, `K-${r}`));
    const addLink = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createAddLinkCommand(() => ({ getTaskByRef, addLink }) as unknown as ClickUpClient), { task: "a1", to: "b2", yes: true });
    expect(getTaskByRef).toHaveBeenCalledWith("a1");
    expect(getTaskByRef).toHaveBeenCalledWith("b2");
  });

  it("a dry run with one key and one id reads both and says it made read calls", async () => {
    const getTaskByRef = vi.fn(async (r: string) => task(r === "DGS-1" ? "id1" : r, r));
    const addLink = vi.fn();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createAddLinkCommand(() => ({ getTaskByRef, addLink }) as unknown as ClickUpClient), { task: "DGS-1", to: "b2" });
    expect(getTaskByRef).toHaveBeenCalledTimes(2);
    expect(addLink).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join("\n")).toContain("read 2 tasks (read-only calls) to resolve and check");
    expect(log).toHaveBeenCalledWith("POST /task/id1/link/b2");
  });

  it("a dry run with plain ids says it made no calls", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createAddLinkCommand(() => { throw new Error("no auth"); }), { task: "a1", to: "b2" });
    expect(log.mock.calls.flat().join("\n")).not.toContain("read 2 tasks");
  });

  it("a lower-case key is looked up like any key", async () => {
    const getTaskByRef = vi.fn(async (r: string) => task(r === "dgs-1" ? "id1" : "id2", r));
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createAddLinkCommand(() => ({ getTaskByRef }) as unknown as ClickUpClient), { task: "dgs-1", to: "dgs-2" });
    expect(getTaskByRef).toHaveBeenCalledWith("dgs-1");
  });

  it.each([
    ["link", createAddLinkCommand, { task: "DGS-1", to: "id1" }],
    ["dependency", createAddDependencyCommand, { task: "DGS-1", waitingOn: "id1" }],
  ])("a key and its own id are the same task (%s): error, nothing sent", async (_n, make, argv) => {
    const getTaskByRef = vi.fn(async (r: string) => task("id1", r));
    const addLink = vi.fn();
    const addDependency = vi.fn();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(make(() => ({ getTaskByRef, addLink, addDependency }) as unknown as ClickUpClient), { ...argv, yes: true });
    expect(addLink).not.toHaveBeenCalled();
    expect(addDependency).not.toHaveBeenCalled();
    expect(err.mock.calls.flat().join("")).toContain("itself");
    expect(process.exitCode).toBe(1);
  });
});
