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
  describe("real ledger lines", () => {
    const real = [
      "# SDD ledger — plan: p.md",
      "- Task 2: minor (deferred): the helper is long",
      "Task 2: parked — F1 wording — ruling: the code stands",
      "Task 2: complete (commits aaaaaaa..bbbbbbb, 1 parked)",
      "Task 2: reviewed (clean)",
      "Task 2: reviewed (3 findings)",
      "Review task 2 r1: F1 -> fixed (abc1234)",
      "Task 9: complete (commits c9)",
      "Task 10: complete (commits c10)",
      "Final review: parked — F2 naming — ruling: keep",
    ].join("\n");
    const o = renderLedgerSummary(real);
    it("puts deferred and parked lines in the Notes of the task", () => {
      expect(o).toContain("minor (deferred): the helper is long; parked — F1 wording — ruling: the code stands");
    });
    it("keeps complete as Delivered and ignores the Review task line", () => {
      expect(o).toMatch(/\| 2 \| commits aaaaaaa\.\.bbbbbbb, 1 parked \|/);
      expect(o).not.toContain("abc1234");
    });
    it("shows two reviews with the last verdict", () => { expect(o).toContain("2 reviews, last: 3 findings"); });
    it("sorts Task 10 after Task 9", () => { expect(o.indexOf("| 9 |")).toBeLessThan(o.indexOf("| 10 |")); });
    it("puts a Final review parked line in the whole-branch section and strips bullets", () => {
      expect(o.split("## Whole-branch review")[1]).toContain("Final review: parked — F2 naming — ruling: keep");
      expect(o).not.toContain("- - ");
    });
  });
});
