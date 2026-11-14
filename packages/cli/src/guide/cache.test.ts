import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  guidesDir,
  readIndex,
  readPage,
  releaseLock,
  takeLock,
  writeIndexAtomic,
  writePageAtomic,
  type GuideIndex,
} from "./cache.ts";

let depot: string;
let env: NodeJS.ProcessEnv;

const index: GuideIndex = {
  version: 1,
  fetched_at: "2026-11-14T00:00:00.000Z",
  list_id: "123",
  guides: [{ slug: "a", key: "DGS-1", id: "x", kind: "guide", name: "Guide: A", when: "when a", updated: "1" }],
};

beforeEach(() => {
  depot = fs.mkdtempSync(path.join(os.tmpdir(), "guide-cache-"));
  env = { DIGISMITH_DEPOT_DIR: depot };
});
afterEach(() => fs.rmSync(depot, { recursive: true, force: true }));

describe("guide cache", () => {
  it("guidesDir is <depot>/guides", () => {
    expect(guidesDir(env)).toBe(path.join(depot, "guides"));
  });

  it("round-trips the index and leaves no tmp file", () => {
    writeIndexAtomic(index, env);
    expect(readIndex(env)).toEqual(index);
    expect(fs.readdirSync(guidesDir(env)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("an interrupted write (stray temp file) leaves the old index readable", () => {
    writeIndexAtomic(index, env);
    fs.writeFileSync(path.join(guidesDir(env), "index.json.123.tmp"), "{half");
    expect(readIndex(env)).toEqual(index);
  });

  it("readIndex returns undefined for bad input and never throws", () => {
    expect(readIndex(env)).toBeUndefined();
    fs.mkdirSync(guidesDir(env), { recursive: true });
    const f = path.join(guidesDir(env), "index.json");
    fs.writeFileSync(f, "not json");
    expect(readIndex(env)).toBeUndefined();
    fs.writeFileSync(f, JSON.stringify({ ...index, version: 2 }));
    expect(readIndex(env)).toBeUndefined();
    fs.writeFileSync(f, JSON.stringify({ ...index, guides: {} }));
    expect(readIndex(env)).toBeUndefined();
    fs.writeFileSync(f, "null");
    expect(readIndex(env)).toBeUndefined();
  });

  it("round-trips pages and rejects unsafe slugs", () => {
    writePageAtomic("my-guide", "# Hi\n", env);
    expect(readPage("my-guide", env)).toBe("# Hi\n");
    expect(readPage("missing", env)).toBeUndefined();
    for (const bad of ["a/b", "..", "../x", "A", "", "a.b"]) {
      expect(() => writePageAtomic(bad, "x", env)).toThrow();
      expect(readPage(bad, env)).toBeUndefined();
    }
  });

  it("lock: free, held, taken over when older than 2 minutes, released", () => {
    const t = Date.parse("2026-11-14T00:00:00Z");
    expect(takeLock(t, env)).toBe(true);
    expect(takeLock(t + 119_000, env)).toBe(false);
    expect(takeLock(t + 121_000, env)).toBe(true);
    releaseLock(env);
    expect(fs.existsSync(path.join(guidesDir(env), "refresh.lock"))).toBe(false);
    expect(takeLock(t + 122_000, env)).toBe(true);
  });
});
