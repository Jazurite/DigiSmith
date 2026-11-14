import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readIndex, readPage, takeLock, guidesDir } from "./cache.ts";
import { refreshGuides, type RefreshClient } from "./refresh.ts";

let depot: string;
let env: NodeJS.ProcessEnv;
const NOW = 1_800_000_000_000;
const fixture = (n: string): string => fs.readFileSync(path.join(import.meta.dirname, "fixtures", n), "utf8");
const CLOSE = fixture("close-a-ticket.md");
const EPIC = fixture("start-an-epic.md");

interface T {
  id: string;
  custom_id: string;
  name: string;
  text_content: string;
  date_updated: string;
  markdown_description?: string;
}
const task = (key: string, name: string, text: string, updated = "100", md?: string): T => ({
  id: `id-${key}`,
  custom_id: key,
  name,
  text_content: text,
  date_updated: updated,
  ...(md === undefined ? {} : { markdown_description: md }),
});

const ADOPTED = "Adopted by Jack on 2026-11-14.";
const pages: Record<string, string> = { "DGS-758": CLOSE, "DGS-759": EPIC };

function fake(tasks: T[], opts: { failKey?: string; listFails?: boolean } = {}) {
  const getListTasks = vi.fn(async () => {
    if (opts.listFails) throw new Error("list down");
    return tasks;
  });
  const getTaskByRef = vi.fn(async (ref: string) => {
    if (ref === opts.failKey) throw new Error("boom");
    return { ...tasks.find((t) => t.custom_id === ref)!, markdown_description: pages[ref] ?? "" };
  });
  return { client: { getListTasks, getTaskByRef } as unknown as RefreshClient, getListTasks, getTaskByRef };
}

const base = (): T[] => [
  task("DGS-758", "Guide: Close a ticket", ADOPTED),
  task("DGS-759", "Guide: Start an epic", `Version 2. ${ADOPTED}`),
  task("DGS-760", "Guide: Draft thing", "Draft. Not adopted yet."),
  task("DGS-761", "SOP: something", ADOPTED),
];

beforeEach(() => {
  depot = fs.mkdtempSync(path.join(os.tmpdir(), "guide-refresh-"));
  env = { DIGISMITH_DEPOT_DIR: depot };
});
afterEach(() => fs.rmSync(depot, { recursive: true, force: true }));

const run = (client: RefreshClient) => refreshGuides(client, { env, now: NOW, listId: "L1" });

describe("refreshGuides", () => {
  it("1: fetches, writes and lists only the adopted guides", async () => {
    const f = fake(base());
    const res = await run(f.client);
    expect(f.getTaskByRef.mock.calls.map((c) => c[0]).sort()).toEqual(["DGS-758", "DGS-759"]);
    expect(f.getTaskByRef).toHaveBeenCalledWith("DGS-758", { include_markdown_description: true });
    expect(res).toEqual({ changed: 2, failed: 0, total: 2 });
    const idx = readIndex(env)!;
    expect(idx.list_id).toBe("L1");
    expect(idx.guides.map((g) => g.key).sort()).toEqual(["DGS-758", "DGS-759"]);
    expect(idx.guides[0]!.updated).toBe("100");
    expect(readPage("close-a-ticket", env)).toContain("Closing a ticket moves it");
    expect(fs.existsSync(path.join(guidesDir(env), "pages", "draft-thing.md"))).toBe(false);
    expect(fs.existsSync(path.join(guidesDir(env), "pages", "something.md"))).toBe(false);
    expect(f.getListTasks).toHaveBeenCalledWith("L1", { params: { include_closed: true, subtasks: true, include_markdown_description: true } });
  });

  it("2: a task that passes text_content but fails the Markdown check is dropped", async () => {
    pages["DGS-762"] = "Not adopted at all.\n";
    const f = fake([...base(), task("DGS-762", "Guide: Liar", ADOPTED)]);
    const res = await run(f.client);
    expect(res.total).toBe(2);
    expect(readIndex(env)!.guides.map((g) => g.key)).not.toContain("DGS-762");
  });

  it("3: an unchanged task with its page is not fetched again", async () => {
    await run(fake(base()).client);
    const f = fake(base());
    const res = await run(f.client);
    expect(f.getTaskByRef).not.toHaveBeenCalled();
    expect(res).toEqual({ changed: 0, failed: 0, total: 2 });
    // a changed date_updated fetches again
    const g = fake(base().map((t) => (t.custom_id === "DGS-758" ? { ...t, date_updated: "200" } : t)));
    const res2 = await run(g.client);
    expect(g.getTaskByRef).toHaveBeenCalledTimes(1);
    expect(res2.changed).toBe(1);
    // a missing page file fetches again
    fs.rmSync(path.join(guidesDir(env), "pages", "start-an-epic.md"));
    const h = fake(base().map((t) => (t.custom_id === "DGS-758" ? { ...t, date_updated: "200" } : t)));
    await run(h.client);
    expect(h.getTaskByRef).toHaveBeenCalledTimes(1);
  });

  it("4: a vanished or un-adopted guide leaves the index; its page file stays", async () => {
    await run(fake(base()).client);
    const next = base().filter((t) => t.custom_id !== "DGS-759");
    const res = await run(fake(next).client);
    expect(res.total).toBe(1);
    expect(readIndex(env)!.guides.map((g) => g.key)).toEqual(["DGS-758"]);
    expect(fs.existsSync(path.join(guidesDir(env), "pages", "start-an-epic.md"))).toBe(true);
    const unadopted = base().map((t) => (t.custom_id === "DGS-758" ? { ...t, text_content: "Draft" } : t));
    await run(fake(unadopted).client);
    expect(readIndex(env)!.guides.map((g) => g.key)).toEqual(["DGS-759"]);
  });

  it("5: one failing fetch keeps its old entry and counts as failed", async () => {
    await run(fake(base()).client);
    const bumped = base().map((t) => ({ ...t, date_updated: "300" }));
    const res = await run(fake(bumped, { failKey: "DGS-758" }).client);
    expect(res).toEqual({ changed: 1, failed: 1, total: 2 });
    const idx = readIndex(env)!;
    expect(idx.guides.find((g) => g.key === "DGS-758")!.updated).toBe("100");
    expect(idx.guides.find((g) => g.key === "DGS-759")!.updated).toBe("300");
  });

  it("5b: a failing fetch with no old entry is omitted; a failing list call rejects", async () => {
    const res = await run(fake(base(), { failKey: "DGS-758" }).client);
    expect(res).toEqual({ changed: 1, failed: 1, total: 1 });
    await expect(run(fake(base(), { listFails: true }).client)).rejects.toThrow("list down");
    expect(takeLock(NOW, env)).toBe(true);
  });

  it("6: a fresh lock skips everything; the lock is released after success", async () => {
    expect(takeLock(NOW, env)).toBe(true);
    const f = fake(base());
    expect(await run(f.client)).toEqual({ skipped: "locked" });
    expect(f.getListTasks).not.toHaveBeenCalled();
    fs.rmSync(path.join(guidesDir(env), "refresh.lock"));
    await run(fake(base()).client);
    expect(takeLock(NOW, env)).toBe(true);
  });

  it("7: markdown_description on the list task means no per-task call", async () => {
    const tasks = [task("DGS-758", "Guide: Close a ticket", ADOPTED, "100", CLOSE)];
    const f = fake(tasks);
    const res = await run(f.client);
    expect(f.getTaskByRef).not.toHaveBeenCalled();
    expect(res).toEqual({ changed: 1, failed: 0, total: 1 });
    expect(readPage("close-a-ticket", env)).toContain("Closing a ticket moves it");
  });
});
