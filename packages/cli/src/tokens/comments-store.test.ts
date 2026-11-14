import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPosted, recordPosted } from "./comments-store.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dg178-"));
  process.env.DIGISMITH_TOKEN_REGISTRY_DIR = dir;
});
afterEach(() => {
  delete process.env.DIGISMITH_TOKEN_REGISTRY_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe("comments-store", () => {
  it("reads [] when there is no file", () => {
    expect(readPosted("DGS-1")).toEqual([]);
  });
  it("records and reads back, replacing the same head", () => {
    recordPosted("DGS-1", { head: "aaa", id: "1", posted_at: "t1" });
    recordPosted("DGS-1", { head: "bbb", id: "2", posted_at: "t2" });
    recordPosted("DGS-1", { head: "aaa", id: "3", posted_at: "t3" });
    expect(readPosted("DGS-1").map((r) => [r.head, r.id])).toEqual([["bbb", "2"], ["aaa", "3"]]);
  });
  it("reads a torn file as []", () => {
    writeFileSync(join(dir, "DGS-1.comments.json"), "{not json");
    expect(readPosted("DGS-1")).toEqual([]);
  });
  it("reads a non-array object file as []", () => {
    writeFileSync(join(dir, "DGS-1.comments.json"), "{}");
    expect(readPosted("DGS-1")).toEqual([]);
  });
  it("keeps only the valid entries of a mixed array", () => {
    const valid = { head: "aaa", id: "1", posted_at: "t1" };
    const mixed = [valid, { head: "bbb", id: 2, posted_at: "t2" }, null, "x", { head: "ccc" }];
    writeFileSync(join(dir, "DGS-1.comments.json"), JSON.stringify(mixed));
    expect(readPosted("DGS-1")).toEqual([valid]);
  });
  it("refuses a bad ticket key", () => {
    expect(() => readPosted("../x")).toThrow("invalid ticket key");
  });
});
