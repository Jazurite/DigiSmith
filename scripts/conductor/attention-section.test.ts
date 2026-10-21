import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { attentionSection } from "./attention-section.ts";

const NOW = Date.parse("2026-10-21T12:00:00Z");
let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "dgs583-section-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const line = (o: object): string => JSON.stringify(o) + "\n";
const open = { id: "a1", ts: "2026-10-21T10:00:00Z", ticket: "DGS-5", run: "r1", kind: "blocked", cause: "stuck", since: "2026-10-21T10:00:00Z" };
const file = (): string => path.join(dir, "attention.jsonl");

describe("attentionSection", () => {
  it("is empty without an attention file", () => {
    expect(attentionSection(dir, NOW)).toBe("");
  });
  it("shows the heading and an open item", () => {
    fs.writeFileSync(file(), line(open));
    const s = attentionSection(dir, NOW);
    expect(s.startsWith("\n## Needs Jack, Nightwatch\n")).toBe(true);
    expect(s).toContain("a1");
  });
  it("shows none when every item is resolved", () => {
    fs.writeFileSync(file(), line(open) + line({ id: "a1", resolved: true, by: "jack", ts: "2026-10-21T11:00:00Z" }));
    expect(attentionSection(dir, NOW)).toBe("\n## Needs Jack, Nightwatch\nnone");
  });
  it("skips a corrupt line", () => {
    fs.writeFileSync(file(), "{not json\n" + line(open));
    expect(attentionSection(dir, NOW)).toContain("a1");
  });
});
