import { describe, expect, it } from "vitest";
import { renderLedgerSummary } from "./ledger-summary.ts";

const ledger = [
  "# SDD ledger — plan: .digismith/board/DGS-9—x/plan.md",
  "Review mode: hand",
  "Task 1: implemented",
  "Task 1: reviewed (clean)",
  "Task 1: complete (commits abc1234; added a|b)",
  "Task 2: reviewed (2 findings)",
  "Task 2: parked F1 minor: naming",
  "Final review (base aaa..bbb, opus): F1 minor naming",
  "Scoped re-review (fix base ccc..ddd, opus): clean",
].join("\n");

describe("renderLedgerSummary", () => {
  const out = renderLedgerSummary(ledger);
  it("names the plan", () => { expect(out).toContain("plan.md"); });
  it("has one row per task with the delivered text", () => {
    expect(out).toMatch(/\| 1 \| commits abc1234; added a\\\|b \| 1 review, last: clean \|/);
    expect(out).toMatch(/\| 2 \| not completed \| 1 review, last: 2 findings \| parked F1 minor: naming \|/);
  });
  it("keeps the whole-branch lines verbatim", () => {
    expect(out).toContain("Final review (base aaa..bbb, opus): F1 minor naming");
    expect(out).toContain("Scoped re-review (fix base ccc..ddd, opus): clean");
  });
  it("renders an empty ledger without throwing", () => { expect(renderLedgerSummary("")).toContain("No tasks recorded"); });
});
