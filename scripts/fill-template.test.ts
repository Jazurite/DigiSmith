import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { fillTemplate, fillTemplateFile } from "./fill-template.ts";

const PROGRESS_TEMPLATE = fs.readFileSync(
  "skills/generate-comment/templates/progress-update.md",
  "utf-8",
);
const INVESTIGATION_TEMPLATE = fs.readFileSync(
  "skills/generate-comment/templates/investigation-update.md",
  "utf-8",
);
const TEAMS_TEMPLATE = fs.readFileSync(
  "skills/generate-comment/templates/teams-review-request.md",
  "utf-8",
);

describe("fillTemplate", () => {
  it("substitutes a single placeholder", () => {
    const result = fillTemplate("Hello <name>!", { name: "Jack" });
    expect(result.markdown).toBe("Hello Jack!");
  });

  it("substitutes multiple placeholders, each possibly used once", () => {
    const result = fillTemplate("<a> and <b> and <a> again", { a: "X", b: "Y" });
    expect(result.markdown).toBe("X and Y and X again");
  });

  it("collapses 3+ consecutive newlines (from an omitted optional block) to exactly 2", () => {
    const result = fillTemplate("line1\n\n<empty>\n\nline2", { empty: "" });
    expect(result.markdown).toBe("line1\n\nline2");
  });

  it("extracts the heading prefix from a level-3 heading, stopping before the placeholder", () => {
    const result = fillTemplate("### 📣 Progress Update – <date>\n\nbody", { date: "26/8" });
    expect(result.headingPrefix).toBe("📣 Progress Update");
  });

  it("returns an empty heading prefix when the template has no heading line", () => {
    const result = fillTemplate("Hello 500 ae (<reviewers>) -- <ask-line>", {
      reviewers: "Jane",
      "ask-line": "please review",
    });
    expect(result.headingPrefix).toBe("");
  });

  it("fills the real progress-update.md template end to end", () => {
    const result = fillTemplate(PROGRESS_TEMPLATE, {
      date: "26/8",
      "whats-done":
        "- Trial/Returns banner implemented and verified live on JP, PH, and KR — icon + editable text, shown only on product pages, correct desktop/mobile ordering next to breadcrumbs.",
      "next-steps":
        "- **🔍 Code Review Needed >** (@[Jane Doe](5f8a2bc1)) — please review the banner styling changes",
    });
    expect(result.markdown).toBe(
      [
        "### 📣 Progress Update – 26/8",
        "",
        "---",
        "",
        "#### ✅ What's done",
        "",
        "- Trial/Returns banner implemented and verified live on JP, PH, and KR — icon + editable text, shown only on product pages, correct desktop/mobile ordering next to breadcrumbs.",
        "",
        "👆 All links (Preview Theme, Customize, Pull Request) are in the ticket description above.",
        "",
        "#### 🎯 Next Steps:",
        "",
        "- **🔍 Code Review Needed >** (@[Jane Doe](5f8a2bc1)) — please review the banner styling changes",
      ].join("\n"),
    );
    expect(result.headingPrefix).toBe("📣 Progress Update");
  });

  it("fills the real investigation-update.md template end to end", () => {
    const result = fillTemplate(INVESTIGATION_TEMPLATE, {
      date: "9/9",
      "whats-checked":
        "- Reviewed Make.com scenario history for the last 48 hours\n- Checked Shopify webhook delivery logs for failed IN fulfillment events",
      "whats-found":
        "- Webhook payload schema changed upstream without notice, dropping the `market` field Make.com's scenario depends on",
      needs:
        "- **🔧 Backend Fix Needed >** (@[Linh Van Vu](7ac31de2)) — please confirm whether the schema change was intentional",
    });
    expect(result.markdown).toBe(
      [
        "### 🔍 Investigation Update – 9/9",
        "",
        "---",
        "",
        "#### 🕵️ What's been checked",
        "",
        "- Reviewed Make.com scenario history for the last 48 hours",
        "- Checked Shopify webhook delivery logs for failed IN fulfillment events",
        "",
        "#### 🔎 What's been found",
        "",
        "- Webhook payload schema changed upstream without notice, dropping the `market` field Make.com's scenario depends on",
        "",
        "#### ❓ Needs",
        "",
        "- **🔧 Backend Fix Needed >** (@[Linh Van Vu](7ac31de2)) — please confirm whether the schema change was intentional",
      ].join("\n"),
    );
    expect(result.headingPrefix).toBe("🔍 Investigation Update");
  });

  it("fills the real teams-review-request.md template end to end, with a ticket line", () => {
    const result = fillTemplate(TEAMS_TEMPLATE, {
      reviewers: "Hoang Ngo EXT, Linh Van Vu EXT",
      "ask-line": "please review before EOD",
      "ticket-line": "EMKT-9001: Fix cart drawer padding on mobile",
      "pr-links":
        "🔗 JP PR: https://github.com/emma-sleep/shopify-template-jp/pull/12\n🔗 KR PR: https://github.com/emma-sleep/shopify-template-kr/pull/8",
    });
    expect(result.markdown).toBe(
      [
        "Hello 500 ae (Hoang Ngo EXT, Linh Van Vu EXT) -- please review before EOD",
        "",
        "EMKT-9001: Fix cart drawer padding on mobile",
        "",
        "🔗 JP PR: https://github.com/emma-sleep/shopify-template-jp/pull/12",
        "🔗 KR PR: https://github.com/emma-sleep/shopify-template-kr/pull/8",
      ].join("\n"),
    );
    expect(result.headingPrefix).toBe("");
  });

  it("fills the real teams-review-request.md template with the ticket line omitted, collapsing the gap", () => {
    const result = fillTemplate(TEAMS_TEMPLATE, {
      reviewers: "Hoang Ngo EXT",
      "ask-line": "please review before EOD",
      "ticket-line": "",
      "pr-links": "🔗 shopify-hub PR: https://github.com/emma-sleep/shopify-hub/pull/63",
    });
    expect(result.markdown).toBe(
      [
        "Hello 500 ae (Hoang Ngo EXT) -- please review before EOD",
        "",
        "🔗 shopify-hub PR: https://github.com/emma-sleep/shopify-hub/pull/63",
      ].join("\n"),
    );
  });
});

describe("fillTemplateFile", () => {
  it("reads a template file from disk and fills it", () => {
    const result = fillTemplateFile("skills/generate-comment/templates/progress-update.md", {
      date: "1/1",
      "whats-done": "- done thing",
      "next-steps": "- next thing",
    });
    expect(result.markdown).toContain("### 📣 Progress Update – 1/1");
    expect(result.headingPrefix).toBe("📣 Progress Update");
  });
});
