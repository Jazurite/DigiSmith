import { describe, it, expect, vi, afterEach } from "vitest";
import { ClickUpApiError } from "@digismith/clickup-client";
import type { ClickUpClient, FrontdoorClient } from "@digismith/clickup-client";
import { createDeleteFolderCommand } from "./delete-folder.ts";
import { createDeleteListCommand } from "./delete-list.ts";

const notFound = () => new ClickUpApiError("404", { method: "GET", path: "/x", status: 404 });

function reader(opts: { gone?: boolean; tasks?: number } = {}) {
  let deleted = false;
  const getFolder = vi.fn(async () => {
    if (deleted && opts.gone !== false) throw notFound();
    return { id: "55", name: "Projects" };
  });
  const getList = vi.fn(async () => {
    if (deleted && opts.gone !== false) throw notFound();
    return { id: "42", name: "Imperium" };
  });
  const getFolderLists = vi.fn().mockResolvedValue([{ id: "l1", name: "One" }, { id: "l2", name: "Two" }]);
  const getListTasks = vi.fn(async (_i: string, o: { params?: { archived?: boolean } } = {}) =>
    o.params?.archived ? [] : Array.from({ length: opts.tasks ?? 2 }, (_, i) => ({ id: `t${i}`, name: "t" })),
  );
  const mark = () => (deleted = true);
  return { client: { getFolder, getList, getFolderLists, getListTasks } as unknown as ClickUpClient, mark, getFolder, getList };
}

function door(mark: () => void = () => {}) {
  const deleteFolderWithContents = vi.fn(async () => mark());
  const deleteListWithContents = vi.fn(async () => mark());
  return { fd: { deleteFolderWithContents, deleteListWithContents } as unknown as FrontdoorClient, deleteFolderWithContents, deleteListWithContents };
}

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void err.push(a.join(" ")));
  return { out, err };
}

const runFolder = (r: ClickUpClient, f: FrontdoorClient, argv: object) =>
  (createDeleteFolderCommand(() => r, () => f).handler as (a: object) => Promise<void>)(argv);
const runList = (r: ClickUpClient, f: FrontdoorClient, argv: object) =>
  (createDeleteListCommand(() => r, () => f).handler as (a: object) => Promise<void>)(argv);

describe("--with-contents", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("folder dry run: prints name, lists, task counts, sends nothing, builds no Frontdoor client", async () => {
    const r = reader();
    const fd = vi.fn();
    const { out } = capture();
    await (createDeleteFolderCommand(() => r.client, fd as never).handler as (a: object) => Promise<void>)({ folder: "55", "with-contents": true });
    const text = out.join("\n");
    expect(text).toContain("folder 55  Projects");
    expect(text).toContain("list l1  One  (2 tasks)");
    expect(text).toContain("2 list(s), 4 task(s)");
    expect(text).toContain("DELETE /hierarchy/v1/category/55");
    expect(text).toContain("nothing sent");
    expect(fd).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it("folder --yes: one DELETE, then reads back and reports gone", async () => {
    const r = reader();
    const d = door(r.mark);
    const { out } = capture();
    await runFolder(r.client, d.fd, { folder: "55", yes: true, "with-contents": true });
    expect(d.deleteFolderWithContents).toHaveBeenCalledTimes(1);
    expect(d.deleteFolderWithContents).toHaveBeenCalledWith("55");
    expect(out.join("\n")).toContain("folder 55 is gone");
    expect(process.exitCode).toBe(0);
  });

  it("folder --yes: still readable after the delete exits 1", async () => {
    const r = reader({ gone: false });
    const d = door();
    const { out } = capture();
    await runFolder(r.client, d.fd, { folder: "55", yes: true, "with-contents": true });
    expect(out.join("\n")).toContain("STILL readable");
    expect(process.exitCode).toBe(1);
  });

  it("folder: a non-numeric id is refused before any call", async () => {
    const r = reader();
    const d = door();
    const { err } = capture();
    await runFolder(r.client, d.fd, { folder: "55,56", yes: true, "with-contents": true });
    expect(err.join("\n")).toContain("digits only");
    expect(r.getFolder).not.toHaveBeenCalled();
    expect(d.deleteFolderWithContents).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("folder: an id the public read refuses (a space id) is not deleted", async () => {
    const r = reader();
    r.getFolder.mockRejectedValue(notFound());
    const d = door();
    const { err } = capture();
    await runFolder(r.client, d.fd, { folder: "1301150000003164", yes: true, "with-contents": true });
    expect(err.join("\n")).toContain("not a readable folder id");
    expect(d.deleteFolderWithContents).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("list dry run counts the tasks and sends nothing", async () => {
    const r = reader({ tasks: 3 });
    const { out } = capture();
    await (createDeleteListCommand(() => r.client, (() => { throw new Error("no"); }) as never).handler as (a: object) => Promise<void>)({ list: "42", "with-contents": true });
    const text = out.join("\n");
    expect(text).toContain("list 42  Imperium  (3 tasks");
    expect(text).toContain("DELETE /hierarchy/v1/subcategory/42");
    expect(text).toContain("nothing sent");
    expect(process.exitCode).toBe(0);
  });

  it("list --yes on a list WITH tasks deletes once and reads back gone", async () => {
    const r = reader({ tasks: 3 });
    const d = door(r.mark);
    const { out } = capture();
    await runList(r.client, d.fd, { list: "42", yes: true, "with-contents": true });
    expect(d.deleteListWithContents).toHaveBeenCalledWith("42");
    expect(d.deleteListWithContents).toHaveBeenCalledTimes(1);
    expect(out.join("\n")).toContain("list 42 is gone");
    expect(process.exitCode).toBe(0);
  });

  it("list: non-numeric and unreadable (space) ids are refused", async () => {
    const r = reader();
    const d = door();
    capture();
    await runList(r.client, d.fd, { list: "abc", yes: true, "with-contents": true });
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    r.getList.mockRejectedValue(notFound());
    await runList(r.client, d.fd, { list: "1301150000003164", yes: true, "with-contents": true });
    expect(process.exitCode).toBe(1);
    expect(d.deleteListWithContents).not.toHaveBeenCalled();
  });

  it("a failed Frontdoor DELETE exits 1 and does not read back", async () => {
    const r = reader();
    const d = door();
    d.deleteListWithContents.mockRejectedValue(new Error("boom"));
    const { err } = capture();
    await runList(r.client, d.fd, { list: "42", yes: true, "with-contents": true });
    expect(err.join("\n")).toContain("clickup delete-list: boom");
    expect(process.exitCode).toBe(1);
  });

  it("without --with-contents a non-empty list is still refused and Frontdoor is untouched", async () => {
    const r = reader({ tasks: 1 });
    const d = door();
    const deleteList = vi.fn();
    (r.client as unknown as { deleteList: unknown }).deleteList = deleteList;
    const { err } = capture();
    await runList(r.client, d.fd, { list: "42", yes: true });
    expect(err.join("\n")).toContain("delete refused");
    expect(d.deleteListWithContents).not.toHaveBeenCalled();
    expect(deleteList).not.toHaveBeenCalled();
  });
});
