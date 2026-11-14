import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assignSlugs, cleanPage, isAdopted, slugFor, unescapeMd, whenToUse } from "./parse.ts";

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const closeTicket = fixture("close-a-ticket.md");
const startEpic = fixture("start-an-epic.md");

describe("unescapeMd", () => {
  it("drops a backslash before ASCII punctuation only", () => {
    expect(unescapeMd("### 1\\. The idea")).toBe("### 1. The idea");
    expect(unescapeMd("a \\~ b")).toBe("a ~ b");
    expect(unescapeMd("a \\n b")).toBe("a \\n b");
  });
});

describe("isAdopted", () => {
  it("is true for both fixtures", () => {
    expect(isAdopted(closeTicket)).toBe(true);
    expect(isAdopted(startEpic)).toBe(true);
  });
  it("is false for a draft, an empty page and a late mention", () => {
    expect(isAdopted("**Draft by Jack.**\n\n## What it is\n")).toBe(false);
    expect(isAdopted("")).toBe(false);
    expect(isAdopted("Draft\n\n\n\nNot yet.\nAdopted by Jack soon\n")).toBe(false);
  });
  it("skips leading blank lines", () => {
    expect(isAdopted("\n\n**Adopted by Jack on 2026-11-14.**\n")).toBe(true);
  });
});

describe("slugFor", () => {
  it("slugs Guide and Manual names", () => {
    expect(slugFor("Guide: close a ticket")).toBe("close-a-ticket");
    expect(slugFor("Guide: arise, resume a Maestro session")).toBe("arise-resume-a-maestro-session");
    expect(slugFor("Guide: Emma ticket flow")).toBe("emma-ticket-flow");
    expect(slugFor("Guide: backups & restore")).toBe("backups-and-restore");
    expect(slugFor("Manual: Upkeep (group intro)")).toBe("manual-upkeep");
  });
  it("returns undefined without a prefix", () => {
    expect(slugFor("SOP: close a ticket")).toBeUndefined();
    expect(slugFor("close a ticket")).toBeUndefined();
  });
});

describe("assignSlugs", () => {
  it("suffixes collisions and reserved slugs, guides first then manuals, sorted", () => {
    const out = assignSlugs([
      { key: "DGS-20", name: "Manual: Zed (group intro)" },
      { key: "DGS-12", name: "Guide: same thing" },
      { key: "DGS-13", name: "Guide: Same thing" },
      { key: "DGS-14", name: "Guide: list" },
      { key: "DGS-15", name: "Guide: refresh" },
      { key: "DGS-16", name: "Guide: alpha" },
      { key: "DGS-17", name: "Manual: Alpha" },
      { key: "DGS-18", name: "Not a guide" },
    ]);
    expect(out.map((g) => [g.kind, g.slug, g.key])).toEqual([
      ["guide", "alpha", "DGS-16"],
      ["guide", "list-dgs-14", "DGS-14"],
      ["guide", "refresh-dgs-15", "DGS-15"],
      ["guide", "same-thing-dgs-12", "DGS-12"],
      ["guide", "same-thing-dgs-13", "DGS-13"],
      ["manual", "manual-alpha", "DGS-17"],
      ["manual", "manual-zed", "DGS-20"],
    ]);
  });
});

describe("whenToUse", () => {
  it("joins the bullets of the DGS-758 fixture", () => {
    expect(whenToUse(closeTicket)).toBe(
      "A build ticket is merged and pushed (the merge-and-finish guide ran). / " +
        "A ticket with no merge is finished: a decision, a shaping or inventory ticket, a guide page. / " +
        "A ticket is dropped (discard) or no longer applies (close).",
    );
  });
  it("keeps Guide text and parens of the DGS-759 fixture", () => {
    const w = whenToUse(startEpic);
    expect(w.split(" / ")).toHaveLength(2);
    expect(w).toContain("Jack has an idea for an epic, or wants to pick up an epic he parked earlier.");
    expect(w).toContain("(Guide: close an epic)");
  });
  it("falls back to the first sentence of What it is", () => {
    expect(whenToUse("**A**\n\n## What it is\n\nIt does X. And then Y.\n")).toBe("It does X.");
  });
  it("falls back when the heading body is empty", () => {
    expect(whenToUse("## When to use it\n\n## What it is\n\nOnly this. More.\n")).toBe("Only this.");
  });
  it("returns empty with neither section", () => {
    expect(whenToUse("**A**\n\n## Steps\n\n1. x\n")).toBe("");
  });
  it("cleans links and bold, and stops at the next heading", () => {
    const md = "## When to use it\n\n*   See [the doc](http://x.y/z) and **bold** text.\n\n## Who\n\n| a | b |\n| - | - |\n";
    expect(whenToUse(md)).toBe("See the doc and bold text.");
  });
});

describe("cleanPage", () => {
  it("unescapes outside code fences only", () => {
    const md = "### 1\\. A\n\n```\nkeep \\. this\n```\n\nafter \\~ it\n";
    expect(cleanPage(md)).toBe("### 1. A\n\n```\nkeep \\. this\n```\n\nafter ~ it\n");
  });
});

describe("parser edge cases", () => {
  it("F1: a wrapped line continues the previous item", () => {
    const md = "## When to use it\n\n*   First item that\n    wraps here.\n*   Second.\n\nSeparate paragraph.\n";
    expect(whenToUse(md)).toBe("First item that wraps here. / Second. / Separate paragraph.");
  });
  it("F2: a hash without a space is not a heading", () => {
    const md = "## When to use it\n\n*   Item one.\n#1 priority tickets\n#tag\n*   Item two.\n";
    expect(whenToUse(md)).toBe("Item one. #1 priority tickets #tag / Item two.");
  });
  it("F3: a fence closes only on its own marker", () => {
    const md = "```\n~~~\nkeep \\. one\n```\nafter \\~ it\n";
    expect(cleanPage(md)).toBe("```\n~~~\nkeep \\. one\n```\nafter ~ it\n");
  });
  it("F3: whenToUse does not unescape code fences", () => {
    const md = "## When to use it\n\n```\nrun a\\.b\n```\n";
    expect(whenToUse(md)).toContain("a\\.b");
  });
});

