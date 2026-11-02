import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { approvalFile, authorityHits, readApproval, uncoveredHits } from "./authority-backstop.ts";

let dir: string;
const D = "packages/cli/src/autonomous/director/";
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "backstop-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
const write = (ticket: string, paths: string[]): void => {
  mkdirSync(join(dir, "director", "authority-approvals"), { recursive: true });
  writeFileSync(approvalFile(dir, ticket), JSON.stringify({ ticket, paths, line: "x", at: "t" }));
};

describe("authority-backstop", () => {
  it("authorityHits lists the authority files of a diff, in order", () => {
    expect(authorityHits(["README.md", `${D}refine.ts`, "profiles/emma.yml", ".digismith/profiles/x.yml", "packages/cli/src/run/rate-limit.ts", "packages/cli/src/run/limit-check.ts"]))
      .toEqual([`${D}refine.ts`, ".digismith/profiles/x.yml", "packages/cli/src/run/limit-check.ts"]);
  });
  it("the approval record lives under the autonomous state dir, never under the repo", () => {
    expect(approvalFile(dir, "DGS-9")).toBe(join(dir, "director", "authority-approvals", "DGS-9.json"));
    expect(approvalFile(dir, "DGS-9").startsWith(dir)).toBe(true);
  });
  it("readApproval: no file, a damaged file and a file without paths read as null (they cover nothing)", () => {
    expect(readApproval(dir, "DGS-9")).toBeNull();
    mkdirSync(join(dir, "director", "authority-approvals"), { recursive: true });
    writeFileSync(approvalFile(dir, "DGS-9"), "{nope");
    expect(readApproval(dir, "DGS-9")).toBeNull();
    writeFileSync(approvalFile(dir, "DGS-9"), JSON.stringify({ paths: "not a list" }));
    expect(readApproval(dir, "DGS-9")).toBeNull();
    write("DGS-9", ["director/refine.ts"]);
    expect(readApproval(dir, "DGS-9")).toEqual({ paths: ["director/refine.ts"] });
  });
  it("a bad ticket key never reaches the file system", () => {
    expect(readApproval(dir, "../x")).toBeNull();
  });
  it("uncoveredHits: an approval for director/refine.ts covers refine.ts and not authority.ts; a folder approval covers both; none covers nothing", () => {
    const files = [`${D}refine.ts`, `${D}authority.ts`];
    expect(uncoveredHits(files, { paths: ["director/refine.ts"] })).toEqual([`${D}authority.ts`]);
    expect(uncoveredHits(files, { paths: [D] })).toEqual([]);
    expect(uncoveredHits(files, null)).toEqual(files);
    expect(uncoveredHits(["src/a.ts"], null)).toEqual([]);
  });
  it("a diff that edits authority-backstop.ts, merge-gate.ts or breaker.ts is a hit", () => {
    expect(authorityHits([`${D}authority-backstop.ts`, "packages/cli/src/autonomous/merge-gate.ts", "packages/cli/src/autonomous/breaker.ts"])).toHaveLength(3);
  });
});
