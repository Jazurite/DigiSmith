import { describe, it, expect } from "vitest";
import { markdownToAdf } from "./markdown-to-adf.ts";

describe("markdownToAdf", () => {
  it("converts a level-3 heading", () => {
    const doc = markdownToAdf("### Title");
    expect(doc).toEqual({
      type: "doc",
      version: 1,
      content: [{ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Title" }] }],
    });
  });

  it("converts a level-3 heading followed by a paragraph when the input has CRLF line endings", () => {
    const doc = markdownToAdf("### Title\r\n\r\nbody");
    expect(doc.content).toEqual([
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Title" }] },
      { type: "paragraph", content: [{ type: "text", text: "body" }] },
    ]);
  });

  it("converts a level-4 heading", () => {
    const doc = markdownToAdf("#### Sub");
    expect(doc.content[0]).toEqual({
      type: "heading",
      attrs: { level: 4 },
      content: [{ type: "text", text: "Sub" }],
    });
  });

  it("converts a rule", () => {
    const doc = markdownToAdf("---");
    expect(doc.content).toEqual([{ type: "rule" }]);
  });

  it("converts bold text", () => {
    const doc = markdownToAdf("plain **bold** plain");
    expect(doc.content[0]).toEqual({
      type: "paragraph",
      content: [
        { type: "text", text: "plain " },
        { type: "text", text: "bold", marks: [{ type: "strong" }] },
        { type: "text", text: " plain" },
      ],
    });
  });

  it("converts a link", () => {
    const doc = markdownToAdf("[click here](https://example.com)");
    expect(doc.content[0]).toEqual({
      type: "paragraph",
      content: [
        { type: "text", text: "click here", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
      ],
    });
  });

  it("converts a bullet list", () => {
    const doc = markdownToAdf("- first\n- second");
    expect(doc.content).toEqual([
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "first" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "second" }] }] },
        ],
      },
    ]);
  });

  it("passes literal Unicode emoji through as plain text", () => {
    const doc = markdownToAdf("✅ done");
    expect(doc.content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "✅ done" }],
    });
  });

  it("converts a mention token to an ADF mention node", () => {
    const doc = markdownToAdf("(@[Jane Doe](5f8a2bc1))");
    expect(doc.content[0]).toEqual({
      type: "paragraph",
      content: [
        { type: "text", text: "(" },
        { type: "mention", attrs: { id: "5f8a2bc1", text: "@Jane Doe" } },
        { type: "text", text: ")" },
      ],
    });
  });

  it("throws on a code block", () => {
    expect(() => markdownToAdf("```\ncode\n```")).toThrow(/code block/);
  });

  it("throws on a blockquote", () => {
    expect(() => markdownToAdf("> quoted")).toThrow(/blockquote/);
  });

  it("throws on a numbered list", () => {
    expect(() => markdownToAdf("1. first")).toThrow(/numbered list/);
  });

  it("throws on a nested list", () => {
    expect(() => markdownToAdf("- top\n  - nested")).toThrow(/nested list/);
  });

  it("throws on a table", () => {
    expect(() => markdownToAdf("| a | b |")).toThrow(/table/);
  });

  it("throws on an unsupported heading level (1)", () => {
    expect(() => markdownToAdf("# Too big")).toThrow(/heading level 1/);
  });

  it("throws on an unsupported heading level (5)", () => {
    expect(() => markdownToAdf("##### Too small")).toThrow(/heading level 5/);
  });

  it("throws on an unsupported heading level (2)", () => {
    expect(() => markdownToAdf("## Too big")).toThrow(/heading level 2/);
  });

  it("throws on image syntax", () => {
    expect(() => markdownToAdf("![alt](https://x.com/img.png)")).toThrow(/image/);
  });

  it("throws on an inline code span", () => {
    expect(() => markdownToAdf("run `npm test` now")).toThrow(/inline code/);
  });

  it("throws on an image inside a non-first bullet-list item", () => {
    expect(() => markdownToAdf("- first\n- second with ![alt](url)")).toThrow(/image/);
  });

  it("throws on an inline code span inside a non-first bullet-list item", () => {
    expect(() => markdownToAdf("- first\n- second with `code`")).toThrow(/inline code/);
  });

  it("round-trips the filled progress-update.md content into the expected ADF document", () => {
    const filled = [
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
    ].join("\n");

    const doc = markdownToAdf(filled);

    expect(doc).toEqual({
      type: "doc",
      version: 1,
      content: [
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "📣 Progress Update – 26/8" }] },
        { type: "rule" },
        { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "✅ What's done" }] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Trial/Returns banner implemented and verified live on JP, PH, and KR — icon + editable text, shown only on product pages, correct desktop/mobile ordering next to breadcrumbs.",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "👆 All links (Preview Theme, Customize, Pull Request) are in the ticket description above.",
            },
          ],
        },
        { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "🎯 Next Steps:" }] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "🔍 Code Review Needed >", marks: [{ type: "strong" }] },
                    { type: "text", text: " (" },
                    { type: "mention", attrs: { id: "5f8a2bc1", text: "@Jane Doe" } },
                    { type: "text", text: ") — please review the banner styling changes" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("round-trips the filled investigation-update.md content into the expected ADF document", () => {
    const filled = [
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
      "- Webhook payload schema changed upstream without notice, dropping the market field Make.com's scenario depends on",
      "",
      "#### ❓ Needs",
      "",
      "- **🔧 Backend Fix Needed >** (@[Linh Van Vu](7ac31de2)) — please confirm whether the schema change was intentional",
    ].join("\n");

    const doc = markdownToAdf(filled);

    expect(doc).toEqual({
      type: "doc",
      version: 1,
      content: [
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "🔍 Investigation Update – 9/9" }] },
        { type: "rule" },
        { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "🕵️ What's been checked" }] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Reviewed Make.com scenario history for the last 48 hours" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Checked Shopify webhook delivery logs for failed IN fulfillment events" },
                  ],
                },
              ],
            },
          ],
        },
        { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "🔎 What's been found" }] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Webhook payload schema changed upstream without notice, dropping the market field Make.com's scenario depends on",
                    },
                  ],
                },
              ],
            },
          ],
        },
        { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "❓ Needs" }] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "🔧 Backend Fix Needed >", marks: [{ type: "strong" }] },
                    { type: "text", text: " (" },
                    { type: "mention", attrs: { id: "7ac31de2", text: "@Linh Van Vu" } },
                    { type: "text", text: ") — please confirm whether the schema change was intentional" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });
});
