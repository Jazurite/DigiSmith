import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildGuideIndex, maybeRefresh, readGuideIndexBlock } from "./index-text.ts";

const HEADER = "User manual (DigiSmith): before acting on a request that matches a line, read the page with dg guide <slug>.";
const NOW = Date.parse("2026-11-14T10:00:00Z");
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

interface E {
  slug: string;
  key: string;
  id: string;
  kind: "guide" | "manual";
  name: string;
  when: string;
  updated: string;
}
function entry(i: number, kind: "guide" | "manual", when: string): E {
  return { slug: `${kind}-${i}`, key: `K-${i}`, id: `id${i}`, kind, name: `Name ${i}`, when, updated: "2026-11-01T00:00:00Z" };
}
function cache(guides: E[], fetchedAt: number = NOW - MIN): string {
  return JSON.stringify({ version: 1, fetched_at: new Date(fetchedAt).toISOString(), list_id: "L", guides });
}
const bytes = (s: string) => Buffer.byteLength(s);
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

function tempEnv(): { env: NodeJS.ProcessEnv; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guide-index-"));
  return { env: { DIGISMITH_DEPOT_DIR: dir }, dir };
}

describe("buildGuideIndex", () => {
  it("starts with the exact header", () => {
    const block = buildGuideIndex(cache([entry(1, "guide", "to do x")]), NOW);
    expect(block.split("\n")[0]).toBe(HEADER);
    expect(block).toContain("guide-1");
  });

  it("never holds page bodies", () => {
    const { env, dir } = tempEnv();
    fs.mkdirSync(path.join(dir, "guides", "pages"), { recursive: true });
    fs.writeFileSync(path.join(dir, "guides", "pages", "guide-1.md"), "BODY-SENTINEL-7f3a\n## Steps\n");
    fs.writeFileSync(path.join(dir, "guides", "index.json"), cache([entry(1, "guide", "to do x")]));
    const block = readGuideIndexBlock(env, NOW, { spawn: vi.fn() })!;
    expect(block).toContain("guide-1");
    expect(block).not.toContain("BODY-SENTINEL-7f3a");
    expect(block).not.toContain("## Steps");
  });

  it.each([0, 2, 40, 150])("stays at or under 3000 bytes for %i guides", (n) => {
    const guides = Array.from({ length: n }, (_, i) => entry(i, i % 5 === 0 ? "manual" : "guide", "x".repeat(300)));
    expect(bytes(buildGuideIndex(cache(guides), NOW))).toBeLessThanOrEqual(3000);
  });

  it("cuts multi-byte text at a character boundary", () => {
    const guides = Array.from({ length: 40 }, (_, i) => entry(i, "guide", "Việt Nam — " + "ệ".repeat(300)));
    const block = buildGuideIndex(cache(guides), NOW);
    expect(bytes(block)).toBeLessThanOrEqual(3000);
    expect(block).not.toContain("�");
    expect(Buffer.from(block).toString("utf8")).toBe(block);
  });

  it("lists guides then manuals and drops manuals first, then guides from the end", () => {
    const guides = [
      ...Array.from({ length: 100 }, (_, i) => entry(i, "guide", words(50))),
      ...Array.from({ length: 50 }, (_, i) => entry(i, "manual", words(50))),
    ];
    const block = buildGuideIndex(cache(guides), NOW);
    const lines = block.split("\n");
    const listed = lines.filter((l) => /^(guide|manual)-\d+/.test(l));
    const m = /^\((\d+) more: dg guide list\)$/.exec(lines[lines.length - 1]!);
    expect(m).not.toBeNull();
    expect(listed.length + Number(m![1])).toBe(150);
    expect(Number(m![1])).toBeGreaterThan(50);
    expect(block).not.toContain("manual-0 ");
    expect(listed[0]!.startsWith("guide-0")).toBe(true);
    listed.forEach((l, i) => expect(l.startsWith(`guide-${i}`)).toBe(true));
    expect(bytes(block)).toBeLessThanOrEqual(3000);
  });

  it("drops only manuals when only a few lines must go", () => {
    const guides = [
      ...Array.from({ length: 20 }, (_, i) => entry(i, "guide", "g " + words(30))),
      ...Array.from({ length: 60 }, (_, i) => entry(i, "manual", "m " + words(30))),
    ];
    const block = buildGuideIndex(cache(guides), NOW);
    const lines = block.split("\n");
    expect(lines.filter((l) => l.startsWith("guide-")).length).toBe(20);
    const kept = lines.filter((l) => l.startsWith("manual-")).length;
    expect(kept).toBeLessThan(60);
    expect(lines[lines.length - 1]).toBe(`(${60 - kept} more: dg guide list)`);
  });

  it("clamps each line to 40..200 bytes", () => {
    const few = buildGuideIndex(cache([entry(1, "guide", words(200)), entry(2, "guide", words(200))]), NOW);
    for (const l of few.split("\n").slice(1)) expect(bytes(l)).toBeLessThanOrEqual(200);
    const many = buildGuideIndex(cache(Array.from({ length: 150 }, (_, i) => entry(i, "guide", words(200)))), NOW);
    for (const l of many.split("\n").slice(1, -1)) expect(bytes(l)).toBeLessThanOrEqual(40);
  });

  it("ends a long when with an ellipsis at a word boundary", () => {
    const block = buildGuideIndex(cache([entry(1, "guide", words(200))]), NOW);
    const line = block.split("\n")[1]!;
    expect(line.endsWith("…")).toBe(true);
    const lastWord = line.slice(0, -1).split(" ").pop()!;
    expect(lastWord).toMatch(/^word\d+$/);
    expect(words(200).split(" ")).toContain(lastWord);
  });

  it("prints the slug alone for an empty when", () => {
    const block = buildGuideIndex(cache([entry(1, "guide", "")]), NOW);
    expect(block.split("\n")[1]).toBe("guide-1");
  });

  it("gives one line for a missing or corrupt cache", () => {
    const line = "Guide index: not cached yet. Run dg guide list.";
    expect(buildGuideIndex(undefined, NOW)).toBe(line);
    expect(buildGuideIndex("{not json", NOW)).toBe(line);
    expect(buildGuideIndex(JSON.stringify({ version: 2, guides: [] }), NOW)).toBe(line);
  });

  it("notes a cache older than 7 days and stays under the cap", () => {
    const guides = Array.from({ length: 150 }, (_, i) => entry(i, "guide", "x".repeat(300)));
    const block = buildGuideIndex(cache(guides, NOW - 9 * DAY), NOW);
    expect(block.split("\n")[0]).toBe(`${HEADER} (cache is 9 days old)`);
    expect(bytes(block)).toBeLessThanOrEqual(3000);
    expect(buildGuideIndex(cache([entry(1, "guide", "a")], NOW - 6 * DAY), NOW)).not.toContain("days old");
  });
});

describe("maybeRefresh", () => {
  function setup(fetchedAgoMin?: number, lockAgoMin?: number) {
    const { env, dir } = tempEnv();
    fs.mkdirSync(path.join(dir, "guides"), { recursive: true });
    if (fetchedAgoMin !== undefined) fs.writeFileSync(path.join(dir, "guides", "index.json"), cache([], NOW - fetchedAgoMin * MIN));
    if (lockAgoMin !== undefined) fs.writeFileSync(path.join(dir, "guides", "refresh.lock"), String(NOW - lockAgoMin * MIN));
    const unref = vi.fn();
    const spawn = vi.fn(() => ({ unref }));
    return { env, spawn, unref };
  }

  it.each([undefined, 16])("spawns a detached refresh once for cache age %s", (age) => {
    const { env, spawn, unref } = setup(age);
    maybeRefresh({ now: NOW, env, spawn });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith("dg", ["guide", "refresh", "--quiet"], { detached: true, stdio: "ignore" });
    expect(unref).toHaveBeenCalledTimes(1);
  });

  it("does not spawn for a 14-minute-old cache", () => {
    const { env, spawn } = setup(14);
    maybeRefresh({ now: NOW, env, spawn });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("does not spawn while a fresh lock exists", () => {
    const { env, spawn } = setup(16, 1);
    maybeRefresh({ now: NOW, env, spawn });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("spawns when the lock is older than 2 minutes", () => {
    const { env, spawn } = setup(16, 3);
    maybeRefresh({ now: NOW, env, spawn });
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("swallows a spawn that throws", () => {
    const { env } = setup(undefined);
    const spawn = vi.fn(() => {
      throw Object.assign(new Error("spawn dg ENOENT"), { code: "ENOENT" });
    });
    expect(() => maybeRefresh({ now: NOW, env, spawn })).not.toThrow();
  });

  it("returns synchronously without awaiting", () => {
    const { env, spawn } = setup(undefined);
    expect(maybeRefresh({ now: NOW, env, spawn })).toBeUndefined();
  });
});

describe("readGuideIndexBlock", () => {
  it("does not throw for a missing depot and returns the not-cached line", () => {
    const env = { DIGISMITH_DEPOT_DIR: path.join(os.tmpdir(), "guide-index-missing-" + process.pid) };
    const spawn = vi.fn(() => ({ unref: vi.fn() }));
    expect(readGuideIndexBlock(env, NOW, { spawn })).toBe("Guide index: not cached yet. Run dg guide list.");
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("does not throw when guides is a file, not a folder", () => {
    const { env, dir } = tempEnv();
    fs.writeFileSync(path.join(dir, "guides"), "x");
    expect(() => readGuideIndexBlock(env, NOW, { spawn: vi.fn(() => ({ unref: vi.fn() })) })).not.toThrow();
  });
});
