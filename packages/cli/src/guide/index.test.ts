import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ClickUpClient } from "@digismith/clickup-client";
import { handlerOf } from "../clickup/handler-of.test-util.ts";
import { readIndex, readPage, writeIndexAtomic, writePageAtomic, type GuideIndexEntry } from "./cache.ts";
import { createGuideListCommand, createGuideRefreshCommand, createGuideShowCommand } from "./index.ts";

const ADOPTED = "Adopted by Jack on 2026-11-14.";
const PAGE = `**Adopted by Jack on 2026-11-14.**\n\n### 5\\. Start it\n\nText.`;
const CLEAN = `**Adopted by Jack on 2026-11-14.**\n\n### 5. Start it\n\nText.`;
const FETCHED = "2026-11-14T10:00:00.000Z"; // 17:00 UTC+7

interface T {
  id: string;
  custom_id: string;
  name: string;
  text_content: string;
  date_updated: string;
  markdown_description?: string;
}
const task = (key: string, name: string, md: string = PAGE): T => ({
  id: `id-${key}`,
  custom_id: key,
  name,
  text_content: ADOPTED,
  date_updated: "100",
  markdown_description: md,
});

function fake(tasks: T[], opts: { listError?: Error; taskError?: Error; hang?: boolean; pages?: Record<string, string> } = {}) {
  const never = (): Promise<never> => new Promise(() => {});
  const getListTasks = vi.fn(async () => {
    if (opts.hang) return never();
    if (opts.listError) throw opts.listError;
    return tasks;
  });
  const getTaskByRef = vi.fn(async (ref: string) => {
    if (opts.hang) return never();
    if (opts.taskError) throw opts.taskError;
    const t = tasks.find((x) => x.custom_id === ref)!;
    return { ...t, markdown_description: opts.pages?.[ref] ?? t.markdown_description };
  });
  return { client: { getListTasks, getTaskByRef } as unknown as ClickUpClient, getListTasks, getTaskByRef };
}

const entry = (slug: string, key: string, kind: "guide" | "manual" = "guide"): GuideIndexEntry => ({
  slug,
  key,
  id: `id-${key}`,
  kind,
  name: slug,
  when: `when ${slug}`,
  updated: "100",
});

function seed(guides: GuideIndexEntry[], pages: Record<string, string> = {}): void {
  writeIndexAtomic({ version: 1, fetched_at: FETCHED, list_id: "1301150000002968", guides });
  for (const [slug, md] of Object.entries(pages)) writePageAtomic(slug, md);
}

let depot: string;
let out: string[];
let err: string[];
const oldDepot = process.env.DIGISMITH_DEPOT_DIR;

beforeEach(() => {
  depot = fs.mkdtempSync(path.join(os.tmpdir(), "guide-cmd-"));
  process.env.DIGISMITH_DEPOT_DIR = depot;
  out = [];
  err = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void err.push(a.join(" ")));
  vi.spyOn(process.stdout, "write").mockImplementation((s: string | Uint8Array) => {
    out.push(String(s));
    return true;
  });
});

afterEach(() => {
  process.exitCode = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (oldDepot === undefined) delete process.env.DIGISMITH_DEPOT_DIR;
  else process.env.DIGISMITH_DEPOT_DIR = oldDepot;
  fs.rmSync(depot, { recursive: true, force: true });
});

const tasks = (): T[] => [task("DGS-758", "Guide: Close a ticket"), task("DGS-759", "Manual: Epics (group intro)")];
type ListArgv = { json?: boolean; offline?: boolean };
type ShowArgv = { name?: string };

describe("dg guide list", () => {
  it("live ok prints slug, key, when (guides then manuals) and exits 0", async () => {
    const f = fake(tasks());
    await handlerOf<ListArgv>(createGuideListCommand(() => f.client))({});
    const lines = out.join("\n").split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].split("\t").slice(0, 2)).toEqual(["close-a-ticket", "DGS-758"]);
    expect(lines[1].split("\t")[0]).toBe("manual-epics");
    expect(process.exitCode).toBe(0);
  });

  it("--json prints the guides array", async () => {
    const f = fake(tasks());
    await handlerOf<ListArgv>(createGuideListCommand(() => f.client))({ json: true });
    const parsed = JSON.parse(out.join("\n")) as GuideIndexEntry[];
    expect(parsed.map((g) => g.slug)).toEqual(["close-a-ticket", "manual-epics"]);
  });

  it("--offline makes no client call", async () => {
    seed([entry("a", "DGS-1")]);
    const f = fake(tasks());
    const factory = vi.fn(() => f.client);
    await handlerOf<ListArgv>(createGuideListCommand(factory))({ offline: true });
    expect(factory).not.toHaveBeenCalled();
    expect(f.getListTasks).not.toHaveBeenCalled();
    expect(out.join("\n").split("\t")[0]).toBe("a");
    expect(err).toEqual([]);
  });

  it("client down with cache: prints cache, UTC+7 stderr line, exit 0", async () => {
    seed([entry("a", "DGS-1")]);
    const f = fake(tasks(), { listError: new Error("HTTP 503") });
    await handlerOf<ListArgv>(createGuideListCommand(() => f.client))({});
    expect(out.join("\n").split("\t")[0]).toBe("a");
    expect(err).toEqual(["guide: ClickUp unreachable, using cache from 2026-11-14 17:00 UTC+7"]);
    expect(process.exitCode).toBe(0);
  });

  it("client down without cache: exit 1", async () => {
    const f = fake(tasks(), { listError: new Error("HTTP 503") });
    await handlerOf<ListArgv>(createGuideListCommand(() => f.client))({});
    expect(err).toEqual(["guide list: ClickUp unreachable and no cache"]);
    expect(out).toEqual([]);
    expect(process.exitCode).toBe(1);
  });

  it("an 8-second hang is cut and the cache path runs", async () => {
    vi.useFakeTimers();
    seed([entry("a", "DGS-1")]);
    const f = fake(tasks(), { hang: true });
    const p = handlerOf<ListArgv>(createGuideListCommand(() => f.client))({});
    await vi.advanceTimersByTimeAsync(7_999);
    expect(err).toEqual([]);
    await vi.advanceTimersByTimeAsync(2);
    await p;
    expect(err).toEqual(["guide: ClickUp unreachable, using cache from 2026-11-14 17:00 UTC+7"]);
    expect(process.exitCode).toBe(0);
  });
});

describe("dg guide <name>", () => {
  it("live ok prints exactly the cleaned page and updates the cache", async () => {
    seed([entry("close-a-ticket", "DGS-758")], { "close-a-ticket": "old" });
    const f = fake(tasks());
    await handlerOf<ShowArgv>(createGuideShowCommand(() => f.client))({ name: "close-a-ticket" });
    expect(out).toEqual([CLEAN]);
    expect(out.join("").startsWith("**Adopted by Jack")).toBe(true);
    expect(readPage("close-a-ticket")).toBe(CLEAN);
    expect(process.exitCode).toBe(0);
  });

  it("unknown name: exit 2 with closest", async () => {
    seed([entry("alpha", "DGS-1"), entry("alps", "DGS-2"), entry("beta", "DGS-3")]);
    const f = fake(tasks());
    await handlerOf<ShowArgv>(createGuideShowCommand(() => f.client))({ name: "alpx" });
    expect(err).toEqual(['guide: no guide "alpx". Closest: alpha, alps']);
    expect(out).toEqual([]);
    expect(process.exitCode).toBe(2);
  });

  it("ambiguous prefix: exit 2", async () => {
    seed([entry("close-a", "DGS-1"), entry("close-b", "DGS-2")]);
    const f = fake(tasks());
    await handlerOf<ShowArgv>(createGuideShowCommand(() => f.client))({ name: "close" });
    expect(err).toEqual(['guide: "close" matches: close-a, close-b']);
    expect(process.exitCode).toBe(2);
  });

  it("a task no longer adopted is unknown", async () => {
    seed([entry("close-a-ticket", "DGS-758")], { "close-a-ticket": "old" });
    const f = fake(tasks(), { pages: { "DGS-758": "Draft, not adopted.\n\ntext" } });
    await handlerOf<ShowArgv>(createGuideShowCommand(() => f.client))({ name: "close-a-ticket" });
    expect(err).toEqual(['guide: no guide "close-a-ticket".']);
    expect(out).toEqual([]);
    expect(process.exitCode).toBe(2);
  });

  it("ClickUp down, page cached: prints it with the cache line, exit 0", async () => {
    seed([entry("close-a-ticket", "DGS-758")], { "close-a-ticket": CLEAN });
    const f = fake(tasks(), { taskError: new Error("ECONNRESET") });
    await handlerOf<ShowArgv>(createGuideShowCommand(() => f.client))({ name: "close-a-ticket" });
    expect(out).toEqual([CLEAN]);
    expect(err).toEqual(["guide: ClickUp unreachable, using cache from 2026-11-14 17:00 UTC+7"]);
    expect(process.exitCode).toBe(0);
  });

  it("ClickUp down, no cached page: exit 1", async () => {
    seed([entry("close-a-ticket", "DGS-758")]);
    const f = fake(tasks(), { taskError: new Error("ECONNRESET") });
    await handlerOf<ShowArgv>(createGuideShowCommand(() => f.client))({ name: "close-a-ticket" });
    expect(err).toEqual(['guide: ClickUp unreachable and no cached page for "close-a-ticket"']);
    expect(process.exitCode).toBe(1);
  });

  it("an 8-second hang is cut and the cached page is printed", async () => {
    vi.useFakeTimers();
    seed([entry("close-a-ticket", "DGS-758")], { "close-a-ticket": CLEAN });
    const f = fake(tasks(), { hang: true });
    const p = handlerOf<ShowArgv>(createGuideShowCommand(() => f.client))({ name: "close-a-ticket" });
    await vi.advanceTimersByTimeAsync(8_001);
    await p;
    expect(out).toEqual([CLEAN]);
    expect(err).toHaveLength(1);
    expect(process.exitCode).toBe(0);
  });

  it("a failing client leaves stdout clean and puts no token on stderr", async () => {
    seed([entry("close-a-ticket", "DGS-758")]);
    const f = fake(tasks(), { taskError: new Error("bad Bearer sk-live-123 and pk_abc and sk-xyz") });
    const spy = vi.spyOn(console, "error");
    await handlerOf<ShowArgv>(createGuideShowCommand(() => f.client))({ name: "close-a-ticket" });
    expect(out).toEqual([]);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/sk-live|pk_abc|sk-xyz/);
  });
});

describe("process end after the limit", () => {
  type RArgv = { quiet?: boolean };
  it("list: a hung call leads to exit(code) once the limit passed", async () => {
    vi.useFakeTimers();
    seed([entry("a", "DGS-1")]);
    const f = fake(tasks(), { hang: true });
    const exit = vi.fn();
    const p = handlerOf<ListArgv>(createGuideListCommand(() => f.client, exit))({});
    await vi.advanceTimersByTimeAsync(8_001);
    await p;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("show: a hung call with no cached page exits 1; a fast call never calls exit", async () => {
    vi.useFakeTimers();
    seed([entry("a", "DGS-1")]);
    const exit = vi.fn();
    const h = fake(tasks(), { hang: true });
    const p = handlerOf<ShowArgv>(createGuideShowCommand(() => h.client, exit))({ name: "a" });
    await vi.advanceTimersByTimeAsync(8_001);
    await p;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(exit).toHaveBeenCalledWith(1);
    const ok = fake(tasks());
    const exit2 = vi.fn();
    await handlerOf<ShowArgv>(createGuideShowCommand(() => ok.client, exit2))({ name: "a" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(exit2).not.toHaveBeenCalled();
  });
});

describe("dg guide refresh", () => {
  type RArgv = { quiet?: boolean };
  it("prints the counts and exits 0", async () => {
    const f = fake(tasks());
    await handlerOf<RArgv>(createGuideRefreshCommand(() => f.client))({});
    expect(out).toEqual(["guides: 2 (2 changed)"]);
    expect(readIndex()?.guides).toHaveLength(2);
    expect(process.exitCode).toBe(0);
  });

  it("--quiet prints nothing, also on failure; exit 1 only on failure", async () => {
    const ok = fake(tasks());
    await handlerOf<RArgv>(createGuideRefreshCommand(() => ok.client))({ quiet: true });
    expect(out).toEqual([]);
    expect(process.exitCode).toBe(0);
    const bad = fake(tasks(), { listError: new Error("HTTP 503") });
    await handlerOf<RArgv>(createGuideRefreshCommand(() => bad.client))({ quiet: true });
    expect(out).toEqual([]);
    expect(err).toEqual([]);
    expect(process.exitCode).toBe(1);
  });

  it("a list failure prints a scrubbed error and exits 1", async () => {
    const bad = fake(tasks(), { listError: new Error("denied Bearer sk-live-123") });
    await handlerOf<RArgv>(createGuideRefreshCommand(() => bad.client))({});
    expect(err.join("\n")).toContain("***");
    expect(err.join("\n")).not.toContain("sk-live");
    expect(process.exitCode).toBe(1);
  });

  it("prints each per-task failure to stderr (scrubbed), exit stays 0; quiet hides them", async () => {
    const t = [task("DGS-758", "Guide: Close a ticket", undefined as unknown as string)];
    delete t[0].markdown_description;
    const f = fake(t, { taskError: new Error("boom Bearer sk-live-123") });
    await handlerOf<RArgv>(createGuideRefreshCommand(() => f.client))({});
    expect(err).toEqual(["guide: failed DGS-758: boom ***"]);
    expect(out).toEqual(["guides: 0 (0 changed)"]);
    expect(process.exitCode).toBe(0);
    err.length = 0;
    out.length = 0;
    await handlerOf<RArgv>(createGuideRefreshCommand(() => f.client))({ quiet: true });
    expect(err).toEqual([]);
    expect(out).toEqual([]);
  });
});
