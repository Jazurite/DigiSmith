import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, appendFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { plan, settle, resultsOf, openLines, closeOpen, readJournal, journalPath } from "./journal.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "nw-journal-"));
const T0 = new Date("2026-10-21T01:00:00.000Z");
const e = { ticket: "DGS-1", phase: "merge-ready", attempt: 1, action: "order-merge" };

describe("journal", () => {
  it("plan writes a planned line with the key, settle writes the settled line", () => {
    const d = tmp();
    const key = plan(d, T0, e);
    expect(key).toBe("DGS-1:merge-ready:1:order-merge");
    expect(resultsOf(d)[key]).toBe("open");
    settle(d, T0, key, "succeeded", "sent");
    expect(resultsOf(d)[key]).toBe("succeeded");
    const lines = readJournal(d);
    expect(lines.map((l) => l.status)).toEqual(["planned", "settled"]);
    expect(lines[0]).toMatchObject({ schema: "nightwatch-journal/v1", ticket: "DGS-1", try: 1 });
  });
  it("is append only: the file only grows and old bytes never change", () => {
    const d = tmp();
    const k = plan(d, T0, e);
    const before = readFileSync(journalPath(d), "utf8");
    settle(d, T0, k, "uncertain");
    const after = readFileSync(journalPath(d), "utf8");
    expect(after.startsWith(before)).toBe(true);
    expect(after.length).toBeGreaterThan(before.length);
  });
  it("a used key is refused: open, succeeded, uncertain and permanent", () => {
    for (const r of [null, "succeeded", "uncertain", "permanent"] as const) {
      const d = tmp();
      const k = plan(d, T0, e);
      if (r !== null) settle(d, T0, k, r);
      expect(() => plan(d, T0, e)).toThrow(/already used/);
    }
  });
  it("retryable frees the key, try counts up, the third retryable becomes permanent", () => {
    const d = tmp();
    const k = plan(d, T0, e);
    expect(settle(d, T0, k, "retryable")).toBe("retryable");
    plan(d, T0, e);
    expect(settle(d, T0, k, "retryable")).toBe("retryable");
    plan(d, T0, e);
    expect(settle(d, T0, k, "retryable", "x")).toBe("permanent");
    expect(readJournal(d).at(-1)?.note).toBe("x; retries exhausted");
    expect(readJournal(d).filter((l) => l.status === "planned").map((l) => l.try)).toEqual([1, 2, 3]);
  });
  it("a garbage line and a line without a key are skipped", () => {
    const d = tmp();
    plan(d, T0, e);
    appendFileSync(journalPath(d), "not json\n{\"schema\":\"nightwatch-journal/v1\"}\n");
    expect(readJournal(d)).toHaveLength(1);
  });
  it("openLines lists open and uncertain keys; closeOpen settles them permanent", () => {
    const d = tmp();
    const a = plan(d, T0, e);
    const b = plan(d, T0, { ...e, action: "order-fix", phase: "building" });
    settle(d, T0, b, "uncertain");
    plan(d, T0, { ticket: "DGS-2", phase: "building", attempt: 1, action: "phase-marker" });
    expect(openLines(d).map((l) => [l.key, l.state])).toEqual([[a, "open"], [b, "uncertain"], ["DGS-2:building:1:phase-marker", "open"]]);
    expect(closeOpen(d, T0, "DGS-1", "released")).toBe(2);
    expect(resultsOf(d)[a]).toBe("permanent");
    expect(resultsOf(d)["DGS-2:building:1:phase-marker"]).toBe("open");
  });
  it("two writer processes keep every line whole", () => {
    const d = tmp();
    const script = join(import.meta.dirname, "journal-writer.test-util.ts");
    const run = (tag: string) => spawnSync(process.execPath, ["--experimental-strip-types", script, d, tag, "50"], { encoding: "utf8" });
    const [r1, r2] = [run("a"), run("b")];
    expect(r1.status).toBe(0);
    expect(r2.status).toBe(0);
    const text = readFileSync(journalPath(d), "utf8");
    const lines = text.trimEnd().split("\n");
    expect(lines).toHaveLength(200);
    for (const l of lines) JSON.parse(l);
    expect(statSync(journalPath(d)).size).toBe(text.length);
  });
});
