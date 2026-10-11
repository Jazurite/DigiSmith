import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createDeleteListCommand } from "./delete-list.ts";

type Task = { id: string; name: string };
const tasks = (n: number): Task[] => Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, name: `Task ${i + 1}` }));

// ClickUp: archived=false gives the live tasks (closed and subtasks with the flags), archived=true gives ONLY the archived ones.
function fake(live: Task[] = [], archived: Task[] = []) {
  const getListTasks = vi.fn(async (_id: string, opts: { params?: { archived?: boolean } } = {}) =>
    opts.params?.archived ? archived : live
  );
  const deleteList = vi.fn().mockResolvedValue(undefined);
  return { getListTasks, deleteList } as unknown as ClickUpClient & {
    getListTasks: ReturnType<typeof vi.fn>;
    deleteList: ReturnType<typeof vi.fn>;
  };
}
const run = (client: unknown, argv: object) =>
  (createDeleteListCommand(() => client as ClickUpClient).handler as (a: object) => Promise<void>)(argv);

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void err.push(a.join(" ")));
  return { out, err };
}

describe("delete-list", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it.each([undefined, "abc", "12 3", ""])("rejects --list %j before any call", async (list) => {
    const client = fake();
    const factory = vi.fn(() => client);
    const { err } = capture();
    await (createDeleteListCommand(factory as unknown as () => ClickUpClient).handler as (a: object) => Promise<void>)({ list });
    expect(factory).not.toHaveBeenCalled();
    expect(err.join("\n")).toContain("--list must be a list id");
    expect(process.exitCode).toBe(1);
  });

  it("reads twice: archived=false and archived=true, both with closed and subtasks", async () => {
    const client = fake();
    capture();
    await run(client, { list: "42" });
    expect(client.getListTasks).toHaveBeenCalledWith("42", {
      params: { include_closed: true, subtasks: true, archived: false },
    });
    expect(client.getListTasks).toHaveBeenCalledWith("42", {
      params: { include_closed: true, subtasks: true, archived: true },
    });
  });

  it("REFUSES when archived=true returns [] but archived=false returns tasks (the DGS-83 incident)", async () => {
    const client = fake(tasks(2), []);
    const { err } = capture();
    await run(client, { list: "42", yes: true });
    expect(client.deleteList).not.toHaveBeenCalled();
    expect(err.join("\n")).toContain("holds 2 tasks");
    expect(process.exitCode).toBe(1);
  });

  it("refuses when only archived tasks exist", async () => {
    const client = fake([], tasks(1));
    const { err } = capture();
    await run(client, { list: "42", yes: true });
    expect(client.deleteList).not.toHaveBeenCalled();
    expect(err.join("\n")).toContain("holds 1 task (");
  });

  it("merges the two reads by id: a task seen twice counts once", async () => {
    const client = fake(tasks(2), tasks(3));
    const { err } = capture();
    await run(client, { list: "42" });
    expect(err.join("\n")).toContain("holds 3 tasks");
  });

  it("dry run on an empty list prints the call and 'would delete', sends no DELETE", async () => {
    const client = fake();
    const { out } = capture();
    await run(client, { list: "42" });
    expect(client.deleteList).not.toHaveBeenCalled();
    const text = out.join("\n");
    expect(text).toContain("DELETE /list/42");
    expect(text).toContain("would delete: list is empty");
    expect(text).toContain("nothing sent");
    expect(process.exitCode).toBe(0);
  });

  it("--yes on an empty list deletes once", async () => {
    const client = fake();
    const { out } = capture();
    await run(client, { list: "42", yes: true });
    expect(client.deleteList).toHaveBeenCalledTimes(1);
    expect(client.deleteList).toHaveBeenCalledWith("42");
    expect(out.join("\n")).toContain("get-lists");
    expect(process.exitCode).toBe(0);
  });

  it("dry run on a list with tasks prints the refusal and exits 1", async () => {
    const client = fake(tasks(3));
    const { err } = capture();
    await run(client, { list: "42" });
    expect(client.deleteList).not.toHaveBeenCalled();
    const text = err.join("\n");
    expect(text).toContain("list 42 holds 3 tasks (archived and closed included); delete refused");
    expect(text).toContain("t1  Task 1");
    expect(text).toContain("t3  Task 3");
    expect(text).not.toContain("more");
    expect(process.exitCode).toBe(1);
  });

  it("--yes on a list with tasks never calls deleteList", async () => {
    const client = fake(tasks(1));
    const { err } = capture();
    await run(client, { list: "42", yes: true });
    expect(client.deleteList).not.toHaveBeenCalled();
    expect(err.join("\n")).toContain("holds 1 task (");
    expect(process.exitCode).toBe(1);
  });

  it("the refusal shows at most 5 tasks and counts the rest", async () => {
    const client = fake(tasks(8));
    const { err } = capture();
    await run(client, { list: "42", yes: true });
    const text = err.join("\n");
    expect(text).toContain("holds 8 tasks");
    expect(text).toContain("t5  Task 5");
    expect(text).not.toContain("t6  Task 6");
    expect(text).toContain("... and 3 more");
    expect(client.deleteList).not.toHaveBeenCalled();
  });

  it("a failed read with --yes exits 1 and does not delete", async () => {
    const client = fake();
    client.getListTasks.mockRejectedValue(new Error("boom"));
    const { err } = capture();
    await run(client, { list: "42", yes: true });
    expect(client.deleteList).not.toHaveBeenCalled();
    expect(err.join("\n")).toContain("clickup delete-list: boom");
    expect(process.exitCode).toBe(1);
  });

  it("a failed delete prints the message and exits 1", async () => {
    const client = fake();
    client.deleteList.mockRejectedValue(new Error("nope"));
    const { err } = capture();
    await run(client, { list: "42", yes: true });
    expect(err.join("\n")).toContain("clickup delete-list: nope");
    expect(process.exitCode).toBe(1);
  });
});
