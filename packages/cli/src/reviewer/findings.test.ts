import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseFindings, extractFindings, readReviews } from "./findings.ts";

const good = {
  id: "F1", path: "src/a.ts", line: 42, severity: "Important",
  what: "leaks a path", scenario: "run the build",
};

describe("parseFindings", () => {
  it("accepts a good array and an empty array", () => {
    expect(parseFindings(JSON.stringify([good]), "r")).toEqual([good]);
    expect(parseFindings("[]", "r")).toEqual([]);
  });
  it("accepts a null line", () => {
    expect(parseFindings(JSON.stringify([{ ...good, line: null }]), "r")[0].line).toBeNull();
  });
  it("names the source on invalid JSON", () => {
    expect(() => parseFindings("{", "report.md")).toThrow(/report\.md: .*JSON/);
  });
  it("rejects a non-array", () => {
    expect(() => parseFindings("{}", "r")).toThrow(/array/);
  });
  it("rejects a bad id, severity, line, empty what, duplicate id", () => {
    expect(() => parseFindings(JSON.stringify([{ ...good, id: "1" }]), "r")).toThrow(/id/);
    expect(() => parseFindings(JSON.stringify([{ ...good, severity: "High" }]), "r")).toThrow(/severity/);
    expect(() => parseFindings(JSON.stringify([{ ...good, line: 0 }]), "r")).toThrow(/line/);
    expect(() => parseFindings(JSON.stringify([{ ...good, what: "" }]), "r")).toThrow(/what/);
    expect(() => parseFindings(JSON.stringify([good, good]), "r")).toThrow(/duplicate/);
  });
});

describe("extractFindings", () => {
  const block = (json: string) => "```json findings\n" + json + "\n```";
  it("reads the last findings block of a report", () => {
    const report = `text\n${block("[]")}\nmore\n${block(JSON.stringify([good]))}\n`;
    expect(extractFindings(report, "r")).toEqual([good]);
  });
  it("ignores a plain json block", () => {
    expect(() => extractFindings("```json\n[]\n```\n", "r")).toThrow(/no "json findings" block/);
  });
  it("fails when there is no block", () => {
    expect(() => extractFindings("no block here", "report.md")).toThrow(/report\.md: no "json findings" block/);
  });
});

describe("readReviews", () => {
  let ws: string;
  beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), "reviews-")); });
  afterEach(() => { fs.rmSync(ws, { recursive: true, force: true }); });
  const put = (dir: string, report?: string) => {
    fs.mkdirSync(path.join(ws, "reviews", dir), { recursive: true });
    if (report !== undefined) fs.writeFileSync(path.join(ws, "reviews", dir, "report.md"), report);
  };
  it("returns nothing when there is no reviews folder", () => {
    expect(readReviews(ws)).toEqual([]);
  });
  it("reads every pack folder with its kind, id and round", () => {
    put("task-7-r2", "```json findings\n[]\n```\n");
    put("ticket-final-r1", "```json findings\n" + JSON.stringify([good]) + "\n```\n");
    const r = readReviews(ws);
    expect(r.map((x) => [x.kind, x.id, x.round])).toEqual([["task", "7", 2], ["ticket", "final", 1]]);
    expect(r[1].findings).toEqual([good]);
  });
  it("ignores folders and files that are not packs", () => {
    put("notes");
    fs.writeFileSync(path.join(ws, "reviews", "stray.txt"), "x");
    expect(readReviews(ws)).toEqual([]);
  });
  it("fails on a pack with no report", () => {
    put("task-3-r1");
    expect(() => readReviews(ws)).toThrow(/task-3-r1: no report\.md/);
  });
});
