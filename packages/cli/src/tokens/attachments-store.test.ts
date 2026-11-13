import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAttached, recordAttached } from "./attachments-store.ts";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "att-")); process.env.DIGISMITH_TOKEN_REGISTRY_DIR = dir; });
afterEach(() => { delete process.env.DIGISMITH_TOKEN_REGISTRY_DIR; rmSync(dir, { recursive: true, force: true }); });

describe("attachments-store", () => {
  it("reads [] when there is no file", () => { expect(readAttached("DGS-1")).toEqual([]); });
  it("keeps the latest record per name", () => {
    recordAttached("DGS-1", { name: "plan.md", sha256: "a", id: "1", attached_at: "t1" });
    recordAttached("DGS-1", { name: "plan.md", sha256: "b", id: "2", attached_at: "t2" });
    recordAttached("DGS-1", { name: "spec.md", sha256: "c", id: "3", attached_at: "t3" });
    expect(readAttached("DGS-1").map((r) => [r.name, r.id])).toEqual([["plan.md", "2"], ["spec.md", "3"]]);
  });
  it("reads [] from a torn file", () => {
    writeFileSync(join(dir, "DGS-2.attachments.json"), "{not json");
    expect(readAttached("DGS-2")).toEqual([]);
  });
  it("leaves no temp files after a record", () => {
    recordAttached("DGS-3", { name: "a.md", sha256: "a", id: "1", attached_at: "t" });
    recordAttached("DGS-3", { name: "b.md", sha256: "b", id: "2", attached_at: "t" });
    expect(readdirSync(dir)).toEqual(["DGS-3.attachments.json"]);
  });
  it("records over a torn file", () => {
    writeFileSync(join(dir, "DGS-4.attachments.json"), "{not json");
    recordAttached("DGS-4", { name: "a.md", sha256: "a", id: "1", attached_at: "t" });
    expect(readAttached("DGS-4")).toEqual([{ name: "a.md", sha256: "a", id: "1", attached_at: "t" }]);
    expect(readdirSync(dir)).toEqual(["DGS-4.attachments.json"]);
  });
  it("drops invalid elements on read", () => {
    const good = { name: "a.md", sha256: "a", id: "1", attached_at: "t" };
    writeFileSync(join(dir, "DGS-5.attachments.json"), JSON.stringify([good, null, 7, "x", { name: "b" }, { ...good, id: 2 }]));
    expect(readAttached("DGS-5")).toEqual([good]);
  });
  it("removes the temp file when the rename fails", () => {
    mkdirSync(join(dir, "DGS-6.attachments.json"));
    expect(() => recordAttached("DGS-6", { name: "a.md", sha256: "a", id: "1", attached_at: "t" })).toThrow();
    expect(readdirSync(dir)).toEqual(["DGS-6.attachments.json"]);
  });
  it("rejects a bad ticket key", () => { expect(() => readAttached("../x")).toThrow(/invalid ticket key/); });
});
