import { describe, it, expect } from "vitest";
import { formatTime, renderMergeComment, type MergeCommentInput } from "./merge-comment-render.ts";

const base: MergeCommentInput = {
  key: "DGS-178",
  now: new Date("2026-11-13T07:20:00Z"),
  base: "aaaaaaa1111",
  head: "bbbbbbb2222",
  version: "1.78.0",
  commits: [{ sha: "c0ffee1", subject: "feat(merge-comment): add the command" }],
  tests: "pnpm vitest run: 12 passed",
  decisions: "ClickUp key only\nOne comment per merge",
  next: "none",
  splitOff: "none",
  reportAttached: true,
};

describe("formatTime", () => {
  it("shows UTC+7 first and UTC in brackets", () => {
    expect(formatTime(new Date("2026-11-13T07:20:00Z"))).toBe("2026-11-13 14:20 UTC+7 [07:20Z]");
  });
  it("rolls the date over after 17:00 UTC", () => {
    expect(formatTime(new Date("2026-11-13T18:05:00Z"))).toBe("2026-11-14 01:05 UTC+7 [18:05Z]");
  });
});

describe("renderMergeComment", () => {
  it("renders the fixed shape", () => {
    expect(renderMergeComment(base)).toBe(
      [
        "DGS-178 merged, 2026-11-13 14:20 UTC+7 [07:20Z]: done.",
        "Merge aaaaaaa..bbbbbbb, plugin 1.78.0.",
        "- feat(merge-comment): add the command (c0ffee1)",
        "Tests: pnpm vitest run: 12 passed",
        "Decisions:",
        "- ClickUp key only",
        "- One comment per merge",
        "Next: none",
        "Split off: none",
        "Report: report.html is attached to this ticket.",
      ].join("\n"),
    );
  });
  it("puts a single decision on the label line", () => {
    expect(renderMergeComment({ ...base, decisions: "- only one" })).toContain("\nDecisions: only one\n");
  });
  it("keeps the lines when fields are missing", () => {
    const t = renderMergeComment({ ...base, tests: undefined, decisions: undefined, next: undefined, splitOff: undefined });
    expect(t).toContain("Tests: not reported");
    expect(t).toContain("Decisions: not reported");
    expect(t).toContain("Next: none");
    expect(t).toContain("Split off: none");
  });
  it("omits the plugin part and the report line when unknown", () => {
    const t = renderMergeComment({ ...base, version: undefined, reportAttached: false });
    expect(t).toContain("Merge aaaaaaa..bbbbbbb.\n");
    expect(t).not.toContain("plugin");
    expect(t).not.toContain("Report:");
  });
  it("caps commits at 8 and says how many more", () => {
    const commits = Array.from({ length: 11 }, (_, n) => ({ sha: `s${n}`, subject: `c${n}` }));
    const t = renderMergeComment({ ...base, commits });
    expect(t).toContain("- c7 (s7)");
    expect(t).not.toContain("- c8 (s8)");
    expect(t).toContain("+3 more");
  });
  it("caps decisions at 3 and truncates long fields at 300 characters", () => {
    const t = renderMergeComment({ ...base, decisions: "a\nb\nc\nd", tests: "x".repeat(400) });
    expect(t).toContain(["Decisions:", "- a", "- b", "- c", "+1 more decisions"].join("\n"));
    const line = t.split("\n").find((l) => l.startsWith("Tests: "))!;
    expect(line.length).toBe("Tests: ".length + 300);
    expect(line.endsWith("...")).toBe(true);
  });
  it("says how many decisions were cut after the third", () => {
    const t = renderMergeComment({ ...base, decisions: "a\nb\nc\nd\ne" });
    expect(t).toContain(["Decisions:", "- a", "- b", "- c", "+2 more decisions", "Next: none"].join("\n"));
  });
  it("keeps the single-decision label line when only one decision exists", () => {
    expect(renderMergeComment({ ...base, decisions: "only one" })).toContain("\nDecisions: only one\nNext: none\n");
  });
  it("truncates by code point so an emoji at the cut is not split", () => {
    const tests = "x".repeat(296) + "😀" + "y".repeat(50);
    const t = renderMergeComment({ ...base, tests });
    const line = t.split("\n").find((l) => l.startsWith("Tests: "))!;
    expect(line).toBe("Tests: " + "x".repeat(296) + "😀...");
    expect(Array.from(line.slice("Tests: ".length)).length).toBe(300);
    expect(t).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });
  it("uses the part label in the headline", () => {
    expect(renderMergeComment({ ...base, part: "Part 2 of 3" }).split("\n")[0]).toBe(
      "DGS-178 part merged, 2026-11-13 14:20 UTC+7 [07:20Z]: Part 2 of 3.",
    );
  });
  it("does not double the period when the part label already ends with one", () => {
    expect(renderMergeComment({ ...base, part: "Part 2 of 3." }).split("\n")[0]).toBe(
      "DGS-178 part merged, 2026-11-13 14:20 UTC+7 [07:20Z]: Part 2 of 3.",
    );
  });
  it("collapses newlines inside a field", () => {
    expect(renderMergeComment({ ...base, tests: "a\n  b" })).toContain("Tests: a b");
  });
});
