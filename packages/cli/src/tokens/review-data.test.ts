import { describe, expect, it } from "vitest";
import { reviewData } from "./review-data.ts";

const table = (rows: string[]) =>
  ["# Review findings", "", "| Reviewer type | Round | Path:line | Severity | What is wrong | Failing scenario | Verdict |", "| --- | --- | --- | --- | --- | --- | --- |", ...rows].join("\n");

describe("reviewData", () => {
  it("reads a role-mode ledger", () => {
    const ledger = ["Task 2: reviewed (2 findings)", "Review task 2 r1: F1 -> fixed", "Review task 2 r1: F2 -> parked (reason)", "Task 2: reviewed (clean)"].join("\n");
    expect(reviewData("2", { ledgerText: ledger })).toMatchObject({ rounds: 2, findings: 2, fixed: 1, parked: 1, rejected: 0, source: "ledger" });
  });
  it("latest ruling per finding wins", () => {
    const ledger = ["Task 2: reviewed (2 findings)", "Review task 2 r1: F1 -> fixed", "Review task 2 r1: F2 -> parked (reason)", "Review task 2 r2: F2 -> fixed", "Task 2: reviewed (clean)"].join("\n");
    expect(reviewData("2", { ledgerText: ledger })).toMatchObject({ findings: 2, fixed: 2, parked: 0 });
  });
  it("counts rejected apart from fixed", () => {
    const ledger = ["Task 2: reviewed (1 findings)", "Review task 2 r1: F1 -> rejected (nope)"].join("\n");
    expect(reviewData("2", { ledgerText: ledger })).toMatchObject({ fixed: 0, rejected: 1 });
  });
  it("counts a fixing entry with no later ruling as open", () => {
    const ledger = ["Task 2: reviewed (1 findings)", "Review task 2 r1: F1 -> fixing (working)"].join("\n");
    expect(reviewData("2", { ledgerText: ledger })).toMatchObject({ findings: 1, fixed: 0, parked: 0, rejected: 0 });
  });
  it("falls back to hand-mode lines", () => {
    const ledger = ["Task 2: reviewed (2 findings)", "Task 2: fix round 1/5 (1 addressed, 1 open — x; commits a..b)", "Task 2: reviewed (clean)", "Task 2: parked — x — ruling: y"].join("\n");
    expect(reviewData("2", { ledgerText: ledger })).toMatchObject({ rounds: 2, findings: 2, parked: 1, fixed: 1, fixRounds: 1, source: "ledger" });
  });
  it("reads the final review", () => {
    const ledger = ["Task final: reviewed (3 findings)", "Review ticket final r1: F1 -> fixed", "Review ticket final r1: F2 -> fixed", "Review ticket final r1: F3 -> parked (why)", "Scoped re-review (fix base a..b, m): clean", "Scoped re-review (fix base b..c, m): clean"].join("\n");
    expect(reviewData("final", { ledgerText: ledger })).toMatchObject({ rounds: 1, findings: 3, fixed: 2, parked: 1, fixRounds: 2 });
  });
  it("skips a malformed verdict line", () => {
    const ledger = ["Task 2: reviewed (2 findings)", "Review task 2 r1: F1 -> fixed", "Review task 2 r1: garbage", "Review task 2 r1: F2 -> parked (r)"].join("\n");
    expect(reviewData("2", { ledgerText: ledger })).toMatchObject({ findings: 2, fixed: 1, parked: 1 });
  });
  it("reads findings.md when the ledger lacks the task", () => {
    const f = table([
      "| task 3 | 1 | a.ts:1 | Minor | w | s | fixed (commit abc) |",
      "| task 3 | 2 | b.ts:2 | Minor | w | s | parked (why) |",
      "| task 3 | 2 | - | - | approved, no findings | - | - |",
      "| task 4 | 1 | - | - | approved, no findings | - | - |",
    ]);
    expect(reviewData("3", { ledgerText: "Task 9: reviewed (clean)", findingsText: f })).toEqual({ rounds: 2, findings: 2, fixed: 1, parked: 1, rejected: 0, open: 0, fixRounds: null, source: "findings.md" });
  });
  it("reads ticket rows for final", () => {
    const f = table(["| ticket | 1 | a.ts:1 | Minor | w | s | fixed (x) |"]);
    expect(reviewData("final", { findingsText: f })).toMatchObject({ rounds: 1, findings: 1, fixed: 1, source: "findings.md" });
  });
  it("returns nulls when neither source has the task; ledger wins otherwise", () => {
    expect(reviewData("7", {})).toEqual({ rounds: null, findings: null, fixed: null, parked: null, rejected: null, open: null, fixRounds: null, source: "none" });
    const f = table(["| task 2 | 1 | a | Minor | w | s | fixed (x) |"]);
    expect(reviewData("2", { ledgerText: "Task 2: reviewed (clean)", findingsText: f }).source).toBe("ledger");
  });
  it("counts an unruled finding as open, never fixed", () => {
    const role = ["Task 2: reviewed (3 findings)", "Review task 2 r1: F1 -> fixed"].join("\n");
    expect(reviewData("2", { ledgerText: role })).toMatchObject({ findings: 3, fixed: 1, open: 2 });
    expect(reviewData("2", { ledgerText: "Task 2: reviewed (3 findings)" })).toMatchObject({ findings: 3, fixed: 0, parked: 0, open: 3 });
    const fixing = ["Task 2: reviewed (1 findings)", "Review task 2 r1: F1 -> fixing (x)"].join("\n");
    expect(reviewData("2", { ledgerText: fixing })).toMatchObject({ findings: 1, open: 1 });
  });
  it("lets a lone Scoped re-review line fall through to findings.md", () => {
    const f = table(["| ticket | 1 | a.ts:1 | Minor | w | s | fixed (x) |"]);
    const r = reviewData("final", { ledgerText: "Scoped re-review (fix base a..b, m): clean", findingsText: f });
    expect(r).toMatchObject({ source: "findings.md", rounds: 1, findings: 1 });
    expect(reviewData("2", { ledgerText: "Task 2: fix round 1/5 (x)" }).source).toBe("none");
  });
});
