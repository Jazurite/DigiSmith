# Templating (Q) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple comment/message templating into a shared skill (`generate-comment`, map item **Q.1**) with three Markdown templates, then refactor the two already-shipped consumers — `jira-progress-write-back` (**I.1**) and `teams-pr-review-notification` (**I.4**) — to both call it instead of each rendering its own inline template (**Q.2**).

**Architecture:** `generate-comment` owns template selection, content-gathering questions, and filling a Markdown template (`skills/generate-comment/templates/*.md`), returning `{markdown, headingPrefix}`. A new `scripts/fill-template.ts` does the mechanical load-and-substitute work. A new `packages/jira-client/src/markdown-to-adf.ts` converts the Jira-bound templates' filled Markdown to ADF right before I.1 posts; Teams needs no conversion at all.

**Tech Stack:** TypeScript (Node ≥24, `node --experimental-strip-types`), Vitest, no new runtime dependencies (hand-rolled parsing/substitution, matching `scripts/preferences.ts`'s existing pattern).

## Global Constraints

- No markdown-parser or YAML library dependency — hand-rolled only, per this repo's established zero-dependency pattern for exactly this kind of parsing (`scripts/preferences.ts`).
- `markdown-to-adf.ts` supports only the deliberately narrow subset the two Jira templates actually use: heading levels 3 and 4 (matching I.1's original ADF — level 3 for the date heading, level 4 for its subheadings; **not** level 2, which the design doc originally said in error and was corrected during this planning pass), `---` rule, `**bold**`, `[text](url)` links, `- ` bullet lists, plain text with literal Unicode emoji, and the `@[Name](accountId)` mention token. Anything else (code fences, blockquotes, numbered lists, nested lists, tables, unsupported heading levels) throws a descriptive `Error` — never silently dropped or mangled.
- `generate-comment` never posts, sends, or connects to anything — it only ever returns drafted text. Posting/sending stays each caller's own responsibility (I.1 posts to Jira, I.4 only presents text for Jack to paste).
- Template selection is explicit-ask only — no auto-detection from Jira issue metadata, no profile-level default.
- Follow DigiSmith's unified docs convention (already enforced — this plan lives at `.digismith/docs/generate-comment/plan.md`).
- Design reference: `.digismith/docs/generate-comment/design.html`.

---

## Task 1: Templates + fill-template.ts

**Files:**
- Create: `skills/generate-comment/templates/progress-update.md`
- Create: `skills/generate-comment/templates/investigation-update.md`
- Create: `skills/generate-comment/templates/teams-review-request.md`
- Create: `scripts/fill-template.ts`
- Test: `scripts/fill-template.test.ts`

**Interfaces:**
- Produces: `fillTemplate(templateContent: string, placeholders: Record<string, string>): { markdown: string; headingPrefix: string }` and `fillTemplateFile(templatePath: string, placeholders: Record<string, string>): { markdown: string; headingPrefix: string }`, both exported from `scripts/fill-template.ts`. A CLI entry point: `node --experimental-strip-types scripts/fill-template.ts --template <path> --data <path-to-json>`, printing `{"markdown": "...", "headingPrefix": "..."}` to stdout. Consumed by Task 3's `generate-comment` skill.

- [ ] **Step 1: Write the three template files**

`skills/generate-comment/templates/progress-update.md`:

```markdown
### 📣 Progress Update – <date>

---

#### ✅ What's done

<whats-done>

👆 All links (Preview Theme, Customize, Pull Request) are in the ticket description above.

#### 🎯 Next Steps:

<next-steps>
```

`skills/generate-comment/templates/investigation-update.md`:

```markdown
### 🔍 Investigation Update – <date>

---

#### 🕵️ What's been checked

<whats-checked>

#### 🔎 What's been found

<whats-found>

#### ❓ Needs

<needs>
```

`skills/generate-comment/templates/teams-review-request.md`:

```markdown
Hello 500 ae (<reviewers>) -- <ask-line>

<ticket-line>

<pr-links>
```

- [ ] **Step 2: Write the failing test**

```typescript
// scripts/fill-template.test.ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run scripts/fill-template.test.ts`
Expected: FAIL — `scripts/fill-template.ts` doesn't exist yet (module not found).

- [ ] **Step 4: Write the implementation**

```typescript
// scripts/fill-template.ts
import * as fs from "node:fs";
import { parseArgs, requireArgs } from "./cli-args.ts";

export interface FillResult {
  markdown: string;
  headingPrefix: string;
}

function extractHeadingPrefix(templateContent: string): string {
  const firstLine = templateContent.split("\n").find((line) => line.trim() !== "") ?? "";
  const headingMatch = /^#{1,6}\s+(.*)$/.exec(firstLine.trim());
  if (!headingMatch) return "";
  const headingText = headingMatch[1];
  const angleIndex = headingText.indexOf("<");
  const beforeAngle = angleIndex === -1 ? headingText : headingText.slice(0, angleIndex);
  return beforeAngle.trim().replace(/[\s\-–]+$/, "");
}

export function fillTemplate(
  templateContent: string,
  placeholders: Record<string, string>,
): FillResult {
  const headingPrefix = extractHeadingPrefix(templateContent);
  let markdown = templateContent;
  for (const [key, value] of Object.entries(placeholders)) {
    markdown = markdown.split(`<${key}>`).join(value);
  }
  markdown = markdown.replace(/\n{3,}/g, "\n\n").trim();
  return { markdown, headingPrefix };
}

export function fillTemplateFile(
  templatePath: string,
  placeholders: Record<string, string>,
): FillResult {
  const templateContent = fs.readFileSync(templatePath, "utf-8").replace(/^﻿/, "");
  return fillTemplate(templateContent, placeholders);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  try {
    requireArgs(args, ["template", "data"]);
  } catch (err) {
    console.error(`fill-template: failed (${(err as Error).message})`);
    process.exitCode = 1;
    return;
  }

  try {
    const placeholders = JSON.parse(fs.readFileSync(args.data, "utf-8")) as Record<string, string>;
    const result = fillTemplateFile(args.template, placeholders);
    console.log(JSON.stringify(result));
  } catch (err) {
    console.error(`fill-template: failed (${err instanceof Error ? err.message : String(err)})`);
    process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run scripts/fill-template.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 6: Commit**

```bash
git add skills/generate-comment/templates/progress-update.md skills/generate-comment/templates/investigation-update.md skills/generate-comment/templates/teams-review-request.md scripts/fill-template.ts scripts/fill-template.test.ts
git commit -m "feat(generate-comment): add three Markdown templates and fill-template.ts (Q.1)"
```

---

## Task 2: markdown-to-adf.ts + cli.ts subcommand

**Files:**
- Create: `packages/jira-client/src/markdown-to-adf.ts`
- Create: `packages/jira-client/src/markdown-to-adf.test.ts`
- Modify: `packages/jira-client/src/cli.ts`

**Interfaces:**
- Consumes: nothing from Task 1 at runtime (the round-trip tests below use hardcoded Markdown fixtures matching Task 1's real template output, not a live call into `fill-template.ts`, to keep this task's tests independent).
- Produces: `markdownToAdf(markdown: string): AdfDoc` from `packages/jira-client/src/markdown-to-adf.ts`, and a new `markdown-to-adf --file <path>` subcommand on `packages/jira-client/src/cli.ts` (prints the ADF JSON to stdout). Consumed by Task 4 (I.1's new conversion step).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/jira-client/src/markdown-to-adf.test.ts
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/jira-client/src/markdown-to-adf.test.ts`
Expected: FAIL — `markdown-to-adf.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// packages/jira-client/src/markdown-to-adf.ts

export interface AdfMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface AdfNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  text?: string;
  marks?: AdfMark[];
}

export interface AdfDoc {
  type: "doc";
  version: 1;
  content: AdfNode[];
}

const INLINE_TOKEN =
  /\*\*(?<bold>[^*]+)\*\*|@\[(?<mentionName>[^\]]+)\]\((?<mentionId>[^)]+)\)|\[(?<linkText>[^\]]+)\]\((?<linkUrl>[^)]+)\)/g;

function parseInline(text: string): AdfNode[] {
  const nodes: AdfNode[] = [];
  let lastIndex = 0;
  INLINE_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_TOKEN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    const groups = match.groups!;
    if (groups.bold !== undefined) {
      nodes.push({ type: "text", text: groups.bold, marks: [{ type: "strong" }] });
    } else if (groups.mentionName !== undefined) {
      nodes.push({
        type: "mention",
        attrs: { id: groups.mentionId, text: `@${groups.mentionName}` },
      });
    } else if (groups.linkText !== undefined) {
      nodes.push({
        type: "text",
        text: groups.linkText,
        marks: [{ type: "link", attrs: { href: groups.linkUrl } }],
      });
    }
    lastIndex = INLINE_TOKEN.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push({ type: "text", text: text.slice(lastIndex) });
  }
  return nodes.length > 0 ? nodes : [{ type: "text", text: "" }];
}

function unsupported(construct: string, line: string): never {
  throw new Error(`markdown-to-adf: unsupported construct (${construct}): ${JSON.stringify(line)}`);
}

function isSpecialLine(line: string): boolean {
  return (
    /^#{1,6}\s+/.test(line) ||
    line.trim() === "---" ||
    /^-\s+/.test(line) ||
    /^```/.test(line) ||
    /^>/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^\s+[-*]\s+/.test(line) ||
    /^\|/.test(line)
  );
}

export function markdownToAdf(markdown: string): AdfDoc {
  const lines = markdown.split("\n");
  const content: AdfNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (/^```/.test(line)) unsupported("code block", line);
    if (/^>/.test(line)) unsupported("blockquote", line);
    if (/^\d+\.\s+/.test(line)) unsupported("numbered list", line);
    if (/^\s+[-*]\s+/.test(line)) unsupported("nested list", line);
    if (/^\|/.test(line)) unsupported("table", line);

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      if (level < 3 || level > 4) {
        unsupported(`heading level ${level} (only levels 3 and 4 are supported)`, line);
      }
      content.push({ type: "heading", attrs: { level }, content: parseInline(headingMatch[2]) });
      i++;
      continue;
    }

    if (line.trim() === "---") {
      content.push({ type: "rule" });
      i++;
      continue;
    }

    if (/^-\s+/.test(line)) {
      const items: AdfNode[] = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^-\s+/, "");
        items.push({
          type: "listItem",
          content: [{ type: "paragraph", content: parseInline(itemText) }],
        });
        i++;
      }
      content.push({ type: "bulletList", content: items });
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isSpecialLine(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    content.push({ type: "paragraph", content: parseInline(paraLines.join(" ")) });
  }

  return { type: "doc", version: 1, content };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/jira-client/src/markdown-to-adf.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Add the CLI subcommand**

Modify `packages/jira-client/src/cli.ts` — add the import and a new `case`:

```typescript
// Add to the existing import block at the top:
import { markdownToAdf } from "./markdown-to-adf.ts";
```

```typescript
// Add as a new case inside the switch in main(), alongside "get-issue" etc.:
      case "markdown-to-adf": {
        requireArgs(args, ["file"]);
        const markdown = readFileSync(args.file, "utf-8").replace(/^﻿/, "");
        const doc = markdownToAdf(markdown);
        console.log(JSON.stringify(doc));
        break;
      }
```

This subcommand needs no credentials — it doesn't call `checkCredentials()`, unlike every other case.

- [ ] **Step 6: Verify the CLI subcommand manually**

```bash
printf '### 📣 Progress Update -- 1/1\n\nplain text' > /tmp/markdown-to-adf-smoke-test.md
node --experimental-strip-types packages/jira-client/src/cli.ts markdown-to-adf --file /tmp/markdown-to-adf-smoke-test.md
```

Expected: prints a JSON ADF `doc` with a level-3 heading and a paragraph, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add packages/jira-client/src/markdown-to-adf.ts packages/jira-client/src/markdown-to-adf.test.ts packages/jira-client/src/cli.ts
git commit -m "feat(jira-client): add markdown-to-adf converter and CLI subcommand (Q.1)"
```

---

## Task 3: skills/generate-comment/SKILL.md

**Files:**
- Create: `skills/generate-comment/SKILL.md`

**Interfaces:**
- Consumes: `scripts/fill-template.ts`'s CLI (Task 1); `digismith:preferences`' `get`/`set` operations (existing, shipped); `digismith:report-implementation`'s `report.html` output (existing, map item N); `gh pr view` (existing, used identically by I.4 today).
- Produces: a `{markdown, headingPrefix}` result, reported back to whichever skill invoked it — consumed by Task 4 (I.1) and Task 5 (I.4).

This is an agentic instruction file, not code — there is no automated test cycle for it (matching how I.1's and I.4's own SKILL.md files have none today; verification stays manual/live). The step below is "write the file," not TDD.

- [ ] **Step 1: Write skills/generate-comment/SKILL.md**

```markdown
---
name: generate-comment
description: Use when jira-progress-write-back or teams-pr-review-notification need a drafted comment/message — selects a template, gathers its content, and fills it in. Never posts or sends anything itself.
---

# Generate Comment

## Overview

DigiSmith's map item **Q.1**. Owns template selection, content-gathering
questions, and filling a Markdown template — the shared mechanism behind
every reporting comment/message DigiSmith drafts. Returns filled Markdown
text plus a heading-prefix string for the caller's own dedup-search (only
meaningful to `jira-progress-write-back`; `teams-pr-review-notification`
ignores it). Never posts, sends, or connects to anything itself — purely a
drafting step. See `.digismith/docs/generate-comment/design.html` for the
full design.

## Invoked By

Only ever invoked by another skill (`jira-progress-write-back` or
`teams-pr-review-notification`) as part of their own process — never
directly by Jack.

## Prerequisites

`skills/generate-comment/templates/` must contain the three shipped
templates: `progress-update.md`, `investigation-update.md`,
`teams-review-request.md`.

## Process

### Step 1: Determine Template Type

The caller passes the type directly (`progress-update`,
`investigation-update`, or `teams-review-request`) whenever it already
knows which one it needs. If invoked without a type specified, ask
directly via `AskUserQuestion` — never guess: "Progress Update,
Investigation Update, or Teams Review Request?"

### Step 2: Gather Content — Progress Update

Only for template type `progress-update`.

Check whether this session already has `.digismith/docs/<slug>/report.html`
from map item **N** (`digismith:report-implementation`), the same slug
this ticket's work used. **Present** → read it and draft 1-4 short bullets
summarizing the delivered work section, in the same tone as a real
example:

> Trial/Returns banner implemented and verified live on JP, PH, and KR —
> icon + editable text, shown only on product pages, correct
> desktop/mobile ordering next to breadcrumbs.

**Not present** (N hasn't run this session, e.g. this plan used
`digismith:executing-plans` instead of `subagent-driven-development`, or
this skill is invoked standalone) → draft the same style of bullets
directly from the session's actual work instead — never fabricate
specifics not actually done this session. Compose the bullets as one
Markdown bullet-list block (one `- ` line per bullet, joined with
newlines) — this is the `whats-done` placeholder value.

Then ask the user, via `AskUserQuestion`, which roles need a ping on this
update and who for each (e.g. code review, design approval, QA) — there
is no automatic source for this. Skip a role entirely if the user says no
one needs tagging for it; never invent a placeholder mention. For each
name given, resolve a JIRA `accountId` by searching for that name — the
same resolution `jira-progress-write-back` already does today (no new
mechanism introduced here). **Exactly one clear match** → use it. **No
match, or the user declines to clarify an ambiguous multi-match** → stop
and ask directly rather than guessing an ID.

Draft one bullet per role-with-a-person using the `@[Name](accountId)`
mention token (never Jira's own native mention syntax — converting this
token to a real ADF mention node is `markdown-to-adf.ts`'s job later, not
this skill's):

```
- **<emoji> <Role> Needed >** (@[<Name>](<accountId>)) — <ask, plain text, one sentence>
```

Compose all such bullets as one Markdown bullet-list block — the
`next-steps` placeholder value. Compute today's date in `D/M` form (day
and month, no leading zeros, no year):

```bash
date +%-d/%-m
```

That's the `date` placeholder value.

### Step 3: Gather Content — Investigation Update

Only for template type `investigation-update`.

Ask the user, via direct conversation, three things, each drafted as its
own Markdown bullet-list block (1-4 bullets each, never fabricated):

- What's been checked — the `whats-checked` placeholder
- What's been found — the `whats-found` placeholder
- What's needed, and from whom — the `needs` placeholder, using the same
  role/person ask-and-resolve pattern as Step 2's Next Steps (ask who,
  resolve to a JIRA `accountId`, use the `@[Name](accountId)` mention
  token, stop and ask directly on no-match or ambiguous match)

Compute the `date` placeholder the same way as Step 2.

### Step 4: Gather Content — Teams Review Request

Only for template type `teams-review-request`.

**Determine scope** — single PR or multi-repo epic. If the caller already
knows (e.g. auto-offered with a specific PR's info already in hand), skip
straight to gathering; otherwise ask, unless already obvious from how it
was asked ("draft a Teams message for these four PRs" is already
multi-repo; "for this PR" is already single): "Is this for one PR, or
several PRs across different repos for the same ticket?"

**Gather PR info.** Single PR, not already supplied by the caller:

```bash
git branch --show-current
gh pr view --json title,url
```

Parse `<Key>` from the branch name against `^([A-Z]+-\d+)__` the same way
`jira-progress-write-back` does. `gh pr view` fails or returns nothing →
ask directly for the PR title and URL rather than guessing. Multi-repo
epic → no automated gathering (multi-repo distribution, map item **I.2**,
doesn't exist yet) — ask directly for the ticket key, its title, and each
repo's PR link, one message.

**Resolve reviewer name(s).** Invoke `digismith:preferences`' `get`
operation for key `teams_reviewers` in the repo currently being worked
in. **Returns a value** → use it as-is (a single comma-separated string)
— reused verbatim, never re-parsed or re-split. **Returns `unset`** →
first use in this repo. Ask via `AskUserQuestion` for the reviewer
name(s) to tag this time (comma-separated if more than one). Then ask a
lightweight follow-up: "Remember this as the default reviewer list for
this repo?" **Yes** → write it via `digismith:preferences`' `set`
operation for key `teams_reviewers`, value quoted (`--value "<names>"`).
**No** → proceed with just this run's answer; ask again next time, never
treat a decline as "stop asking."

**Determine the ask line.** Ask directly what to say after the `--` —
never fabricate one. May be in Vietnamese or English, whatever Jack says;
never auto-translate or rephrase it. That's the `ask-line` placeholder.

**Compose the remaining placeholders:**

- `reviewers` = the reviewer name(s) string as-is — no mention-token
  wrapping (Teams reviewer names are plain text, not resolved Jira
  mentions; there is no `accountId` lookup in this path at all).
- `ticket-line` = `"<Key>: <Ticket title>"` when a real ticket key and
  title are both known (ask directly for the title if the key is known
  but the title isn't — never fabricate one); an **empty string** when
  there is no real ticket key at all. Never a placeholder string in its
  place.
- `pr-links` = one `🔗 <market> PR: <link>` line per PR known, joined
  with newlines, in the order gathered. `<market>` is derived the same
  way `jira-progress-write-back`'s repo-label step does: if the repo's
  directory name matches `shopify-template-<code>`, the label is
  `<code>` uppercased; otherwise the repo directory name as-is.

### Step 5: Fill the Template

Resolve DigiSmith's own repo path the same two-step way
`inject-standards`/`offload-implementer` already establish: is the
current working directory itself the DigiSmith repo
(`.claude-plugin/plugin.json` with `"name": "digismith"`)? Use it
directly. Otherwise ask for DigiSmith's repo path this session and
remember it. Call this `<digismith-repo>` below.

Write the gathered placeholders to a scratch JSON file (e.g.
`/tmp/generate-comment-data-<type>.json`), then:

```bash
node --experimental-strip-types <digismith-repo>/scripts/fill-template.ts --template <digismith-repo>/skills/generate-comment/templates/<type>.md --data /tmp/generate-comment-data-<type>.json
```

`<type>` is `progress-update`, `investigation-update`, or
`teams-review-request`, matching Step 1's determination. Parse the
printed JSON (`{"markdown": "...", "headingPrefix": "..."}`) from stdout.

### Step 6: Return

Report back to the caller: the filled `markdown` text and the
`headingPrefix` string, exactly as `fill-template.ts` produced them. This
skill's job ends here — it never posts, sends, or confirms anything
itself; that's each caller's own job.

## Error Handling

| Case | Disposition |
|---|---|
| Unrecognized template type requested | Stop, report the valid types (`progress-update`, `investigation-update`, `teams-review-request`), don't guess |
| `fill-template.ts` fails (template file missing/unreadable) | Stop, report the failure plainly, no fabricated draft |
| A mentioned name doesn't resolve to exactly one JIRA account (Progress/Investigation only) | Stop and ask for clarification. Never guess an `accountId` |
| No PR found for the current branch (Teams, direct-invoke case) | Ask directly for the PR title and URL rather than guessing |
| No `teams_reviewers` preference set, and Jack declines to save one at first use | Proceed with just this run's typed-in answer; ask again next time, never treat the decline as "stop asking" |
| No ticket key/context available (Teams) | Set `ticket-line` to an empty string rather than inventing a placeholder |

## Quick Reference

| Step | Action |
|---|---|
| 1 | Determine template type — from the caller, or ask |
| 2 | Progress Update content: N's `report.html` or session summary, Next Steps role/mention resolution, today's date |
| 3 | Investigation Update content: what's checked / found / needed, role/mention resolution, today's date |
| 4 | Teams Review Request content: scope, PR info, reviewer names via `digismith:preferences`, ask line |
| 5 | Fill the template via `fill-template.ts`, parse the returned JSON |
| 6 | Return `{markdown, headingPrefix}` to the caller — never post or send |
```

- [ ] **Step 2: Commit**

```bash
git add skills/generate-comment/SKILL.md
git commit -m "feat(generate-comment): add the Q.1 skill"
```

---

## Task 4: Refactor jira-progress-write-back (I.1) to consume generate-comment

**Files:**
- Modify: `skills/jira-progress-write-back/SKILL.md` (full Process/Error Handling/Quick Reference rewrite; Prerequisites/Overview get small additions)

**Interfaces:**
- Consumes: `generate-comment` (Task 3, invoked as a skill call — no CLI); `markdown-to-adf.ts`'s new CLI subcommand (Task 2).
- Produces: nothing new for other consumers — this is a leaf skill.

No automated test cycle (agentic instruction file). Verification is a manual/live smoke test in Step 3 below.

- [ ] **Step 1: Rewrite the frontmatter and Overview**

Replace the frontmatter block and Overview section:

```markdown
---
name: jira-progress-write-back
description: Use right after digismith:capture-ephemeral-url succeeds, or when explicitly asked to post or update the JIRA progress or investigation update for the current ticket — posts real JIRA ADF formatting (status lozenges, emoji, a dated comment) instead of a markdown approximation, for a single repo/ticket at a time.
---

# JIRA Progress Write-back

## Overview

DigiSmith's map item **I.1**. Posts/updates a JIRA ticket's description
(a "🔗 Materials & Links" entry, and — only if already present — the
"📦 Track" checklist's Technical Development line) and a dated comment —
either a Progress Update or an Investigation Update — using real ADF
nodes (status lozenges, emoji, mentions) instead of a markdown
approximation that would round-trip as broken literal text. Consumes map
item **M**'s captured URLs (Progress Update path only). Single
repo/ticket at a time — no cross-repo awareness; that's map item **I.2**,
not this skill. The comment itself is drafted by `generate-comment`
(**Q.1**) — this skill owns the Jira-specific mechanics: fetching,
dedup-matching, converting to ADF, and posting.
```

## When to Use

Unchanged.

## Prerequisites

Add one sentence after the existing paragraph: "Also requires
`generate-comment` (**Q.1**) and its three templates under
`skills/generate-comment/templates/`."

- [ ] **Step 2: Rewrite the Process section**

Replace the entire `## Process` section (Steps 0 through 15) with:

````markdown
## Process

### Step 0: Profile Pre-Check

Check for `.digismith/profile` in the repo currently being worked in.

**Missing** → proceed to Step 1.

**Present** → read its one-line content as the active profile name.
Locate DigiSmith's own repo — same rule `digismith:inject-standards` uses
for `standards/`: is the current working directory itself the DigiSmith
repo (`.claude-plugin/plugin.json` with `"name": "digismith"`)? Use it
directly. Otherwise ask the user for DigiSmith's repo path this session
and remember it. Never read `profiles/` under a plugin cache path — a
stale, version-locked snapshot. Read `profiles/<name>.yml` there. No
matching file → treat as stale, proceed as if `.digismith/profile` were
missing — continue to Step 1.

Otherwise, if that profile's `ticket` field is `false`, stop here: report
one line — "skipping JIRA write-back — no ticket tracking in `<name>`
profile" — and don't do anything else in this skill. If `ticket` is
`true`, continue to Step 1.

### Step 1: Resolve the Ticket Key

```bash
git branch --show-current
```

Parse `<Key>` from the current branch name against `^([A-Z]+-\d+)__`
(e.g. `EMKT-9001__fix-cart-drawer-padding-mobile` → `EMKT-9001`). If the
branch name doesn't match, ask directly for the ticket key instead of
guessing.

### Step 2: Ensure the Jira Client Is Available

Defensively invoke `digismith:depot`'s `ensure` operation — `bootstrap`/
`adopt` normally already did this at ticket start, but this skill can
also run standalone in a session that skipped them. Same disposition as
`digismith:depot`'s own Error Handling: if `ensure` fails, stop here,
report the error plainly, don't fabricate a write.

Then check credentials:

```bash
node ~/.digismith-depot/repo/packages/jira-client/src/cli.ts check-credentials
```

**Exit 0** → credentials are present and complete, continue to Step 3.

**Exit 1** → `~/.digismith-depot/.env` is missing or incomplete. Ask via
`AskUserQuestion` for the three values, mentioning where to generate a
token (`id.atlassian.com/manage-profile/security/api-tokens`):

- Jira account email
- Jira API token
- Jira site hostname (e.g. `your-org.atlassian.net`)

Write them to `~/.digismith-depot/.env` (create `~/.digismith-depot/` first if it
doesn't exist):

```
JIRA_EMAIL=<email>
JIRA_API_TOKEN=<token>
JIRA_SITE=<site>
```

Then re-run `check-credentials` to confirm before continuing to Step 3.
This only ever happens once per machine — every future session finds the
file already there.

### Step 3: Fetch the Current Ticket

```bash
node ~/.digismith-depot/repo/packages/jira-client/src/cli.ts get-issue --key <Key> --fields summary,description
```

This isn't a display fetch: whatever comes back gets spliced and written
straight back in Step 8/9, and the response is real, structured ADF for
every field by construction — no `responseContentFormat` parameter to
get wrong, no lossy rendered-markdown hybrid to guard against. Keep the
raw `description` ADF document in memory for the rest of this process.
Comments are fetched separately in Step 10, not here.

### Step 4: Determine Template Type

Invoked right after `digismith:capture-ephemeral-url` reports its two
URLs → always **Progress Update** (today's only real path there — an
Investigation Update has no ephemeral deploy to report). Invoked
standalone or explicitly → ask directly via `AskUserQuestion`: "Progress
Update, or Investigation Update?" Remember the answer as `<template>` for
every step below.

### Step 5: Determine This Repo's Row Label

**Only if `<template>` = Progress Update** — this label feeds Steps 6-7's
description edits, which don't apply to Investigation Update.

From the current repo's directory name: if it matches
`shopify-template-<code>`, the label is `<code>` uppercased (e.g.
`shopify-template-jp` → `JP`). Otherwise, the label is the repo directory
name as-is (e.g. `shopify-hub`).

### Step 6: Draft the Materials & Links Delta

**Only if `<template>` = Progress Update** — skip entirely for
Investigation Update; there's no ephemeral deploy to link.

Search the fetched `description` document's top-level `content` array
for a heading node whose text contains "Materials & Links".

**Not found (most common — first write on this ticket)** → the delta is
a fresh heading + bullet list, to be inserted (Step 8 decides where):

```json
{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"🔗 Materials & Links:"}]}
```
```json
{"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[
    {"type":"text","text":"Preview Theme","marks":[{"type":"strong"}]},
    {"type":"text","text":": "},
    {"type":"text","text":"Link","marks":[{"type":"link","attrs":{"href":"<preview-theme-url>"}}]}
  ]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[
    {"type":"text","text":"Customize","marks":[{"type":"strong"}]},
    {"type":"text","text":": "},
    {"type":"text","text":"Link","marks":[{"type":"link","attrs":{"href":"<customize-url>"}}]}
  ]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[
    {"type":"text","text":"Pull Request","marks":[{"type":"strong"}]},
    {"type":"text","text":": "},
    {"type":"text","text":"Link","marks":[{"type":"link","attrs":{"href":"<pr-url>"}}]}
  ]}]}
]}
```

No country/market label on the bullets — single-repo scope means there's
only ever one entry in view.

**Found, and it's followed by a `bulletList`** (this skill's own earlier
write) → the delta is: replace that bullet list's three `href` values
in place (same three listItems, same order, just new link targets).

**Found, and it's followed by a `table`** (pre-existing multi-market
history — human-authored, or a future I.2) → don't restructure it. The
delta is a table-row upsert instead: the table's header row tells you
column order (expect `Country | Preview Theme | Customize | Pull
Request`, but read the actual header cells rather than assuming). Search
the table's row nodes for one whose first cell's text matches this
repo's label (Step 5). Found → replace that row's link cells. Not found
→ append a new row with this repo's label and links, same cell shape as
the existing rows.

**Found, but followed by neither a `bulletList` nor a `table`**
(unrecognized shape) → this is **not** the same as "not found": a
heading already exists, so do not append a second one. Produce no delta
at all — the existing Materials & Links section (heading and whatever
follows it) is left exactly as fetched, completely untouched. Report why
in Step 16. Never guess at a risky edit against an unfamiliar structure.

### Step 7: Draft the Track Checklist Delta

**Only if `<template>` = Progress Update** — skip entirely for
Investigation Update.

Search the same `description` document for a heading node whose text
contains "Track" (expect "📦 Track:"). **Not found** → no delta; the
Track checklist is untouched, note this for the final report (see Step
16 / Error Handling — never scaffold one from nothing).

**Found** → scan the nodes immediately following that heading (up to the
next heading node or end of document) for a paragraph whose content
starts with bold text reading "Technical Development" (matching the real
example's `**Technical Development -**` shape, tolerant of the exact
trailing punctuation). That paragraph must contain one `status`-type
node — this is the node whose `attrs` this step changes: set
`attrs.text` to `"DONE"` and `attrs.color` to `"green"`, regardless of
its current value. (Single-repo scope, per the design spec: this skill
has no visibility into other repos, so completing this one *is* the
whole of what it's tracking.)

Then scan the paragraphs after that Technical Development paragraph,
stopping at whichever comes first — the next stage's own bold-labeled
paragraph, the next heading, or end of document — for one whose content
is exactly an `emoji` node (short name `:check_mark:`) followed by this
repo's label (Step 5) in bold text. **Already present**
→ no further change, idempotent. **Not present** → the delta also
includes a new paragraph node to insert immediately after the last
existing checkmark paragraph under Technical Development (or immediately
after the Technical Development status paragraph itself, if it has no
checkmarks yet):

```json
{"type":"paragraph","content":[
  {"type":"emoji","attrs":{"shortName":":check_mark:","text":"✅"}},
  {"type":"text","text":" "},
  {"type":"text","text":"<label>","marks":[{"type":"strong"}]}
]}
```

**If the structure under the Track heading doesn't clearly match this
shape** (e.g. no paragraph starts with bold "Technical Development" at
all) → treat it the same as "not found": no delta, report why in Step
16. Never guess at a risky edit against an unfamiliar structure.

### Step 8: Compose the Full New Description Document

**Only if `<template>` = Progress Update** — for Investigation Update,
this step is a no-op; the description stays exactly as fetched in Step 3.

Take the `description` document fetched in Step 3 and produce a complete
new document with Step 6's delta and (if any) Step 7's delta spliced in,
every other node untouched:

- Materials & Links: if Step 6 found nothing, append the new heading +
  bullet list to the end of the top-level `content` array. If Step 6
  found an existing section (bullets or table), replace only that
  section's content nodes in place, at the same position. If Step 6
  found a heading but produced no delta (unrecognized shape), the
  description's Materials & Links section is left exactly as fetched,
  untouched — do not append a second heading.
- Track checklist: if Step 7 produced a delta, splice the changed
  `status` node's attrs and (if applicable) the new checkmark paragraph
  into their exact positions within the existing node sequence. If Step
  7 found nothing, the document is unchanged from Step 3 in this regard.

This composed document is the exact value Step 14 sends back — hold it
in memory, don't write yet.

### Step 9: Generate the Comment

Invoke `generate-comment` (**Q.1**) with template type `<template>`
(Step 4). Receive back `{markdown, headingPrefix}`. Hold both in memory —
`headingPrefix` feeds Step 10's dedup-search, `markdown` feeds Step 11's
confirmation and Step 12's conversion.

### Step 10: Find Today's Existing Comment

Fetch every comment on the ticket, paginated to completion (not just the
first page):

```bash
node ~/.digismith-depot/repo/packages/jira-client/src/cli.ts get-comments --key <Key>
```

Compute today's date in `D/M` form (day and month, no leading zeros, no
year — e.g. `26/8`):

```bash
date +%-d/%-m
```

Search the comments array just fetched for one whose body document's
first node is a heading whose text starts with `<headingPrefix>` (Step
9) followed by that exact `D/M` string — but a plain string-prefix check
is not enough by itself: since `D/M` has no leading zeros or fixed width,
a shorter day/month string can prefix-collide with a longer one from an
unrelated date. For example, if today is `3/1` (3 January) and an old
comment is headed "`<headingPrefix>` – 3/12" (3 December), that heading
literally starts with the string for `3/1`, so a naive prefix check
would wrongly match it and silently overwrite the December comment.
Guard against this with a boundary check instead of a plain prefix
check: the heading matches only if it starts with `"<headingPrefix> –
<D/M>"` **and** the character immediately after that matched substring
is either absent (the heading ends there) or a non-digit. That boundary
correctly rejects the `3/12`-vs-`3/1` case (the next character after the
match is `2`, a digit) while still correctly matching a heading with
legitimate trailing content, e.g. "`<headingPrefix>` – 26/8 (week 2)"
against a search for `26/8` (the next character is a space, a non-digit)
— do not require full-string equality on the whole heading instead,
since that would break matching those legitimately-suffixed headings.
**Found** → remember its `id` as `commentId` for Step 13. **Not found**
→ Step 13 creates a new comment instead.

### Step 11: Confirm With the User

Render the description delta (in human-readable terms of what's
changing — "adding a Materials & Links entry with these three links" /
"marking Technical Development done with a JP checkmark" / "Track
section not found, skipping" as applicable — **only when `<template>` =
Progress Update**; for Investigation Update, state plainly that no
description changes are made at all) and the full comment text — the
`markdown` from Step 9, readable as Markdown, not raw ADF JSON.
Alongside the comment text, state plainly whether this write will
**create a new comment** or **replace the existing comment Step 10
found** (name its `commentId` when replacing), so the user can catch and
cancel a wrong match before it lands. Then ask via `AskUserQuestion`:
post as drafted, let the user revise first, or cancel. **Revise** →
incorporate the requested change and re-present before proceeding.
**Cancel** → stop here, nothing is written. Only **post as drafted**
continues to Step 12. This applies every time this skill runs, not just
the first — both writes are team-visible external side effects, and
JIRA's own edit history is visible to the whole team.

### Step 12: Convert the Comment to ADF

Write Step 9's `markdown` to a scratch file (e.g.
`/tmp/jira-comment-<Key>.md`), then:

```bash
node ~/.digismith-depot/repo/packages/jira-client/src/cli.ts markdown-to-adf --file /tmp/jira-comment-<Key>.md
```

Capture the printed ADF `doc` JSON — this is the exact value Step 14
sends back.

### Step 13: Write the Description

**Only if `<template>` = Progress Update.** Write Step 8's composed
document to a scratch file (e.g. `/tmp/jira-description-<Key>.json`),
then:

```bash
node ~/.digismith-depot/repo/packages/jira-client/src/cli.ts update-description --key <Key> --file /tmp/jira-description-<Key>.json
```

### Step 14: Write the Comment

Write Step 12's converted ADF document to a scratch file (e.g.
`/tmp/jira-comment-<Key>.json`), then:

```bash
node ~/.digismith-depot/repo/packages/jira-client/src/cli.ts add-comment --key <Key> --file /tmp/jira-comment-<Key>.json
```

Only if Step 10 found an existing comment, add `--comment-id <id>` to the
same command — this updates the existing comment in place instead of
creating a new one.

### Step 15: Report

Confirm what was written: the ticket key, which template was used,
whether the description's Materials & Links entry was created or updated
(and the Track line, if touched, or a note that it was skipped and why —
Progress Update only), and whether the comment was created or updated
(with a link to the ticket). This skill's job ends here.
````

- [ ] **Step 3: Rewrite Error Handling and Quick Reference**

Replace the `## Error Handling` and `## Quick Reference` sections:

```markdown
## Error Handling

- **No credentials, and the user declines to provide them at Step 2** →
  stop, say so plainly. Don't fabricate a write.
- **`digismith:depot`'s `ensure` operation fails at Step 2** → stop, say
  so plainly (see that skill's own Error Handling for the exact
  disposition). Don't fabricate a write.
- **Branch doesn't match `<Key>__<slug>`** → ask directly for the ticket
  key rather than guessing.
- **`generate-comment` fails or is cancelled at Step 9** (unrecognized
  template type, missing template file, unresolved mention) → stop here,
  surface whatever it reported plainly. Don't fabricate a comment.
- **Track section absent, or present but not in the expected shape**
  (Progress Update only) → skip the Track delta entirely (Step 7),
  report plainly in Step 15. Never scaffold or force an edit against an
  unfamiliar structure.
- **Materials & Links section already exists as neither bullets nor a
  table** (Progress Update only, unrecognized shape) → same disposition
  as the Track case: skip that part of the delta, report why, don't
  force an edit.
- **The Markdown from `generate-comment` uses a construct
  `markdown-to-adf.ts` doesn't support** (Step 12 throws) → stop here,
  report the unsupported construct plainly. Never post a mangled
  conversion.
- **Custom, site-uploaded emoji needed with no resolvable `id`** → not
  applicable anymore — templates use literal Unicode emoji characters,
  not Jira's ADF `emoji` shortName nodes, so this case no longer arises.
- **Mistaken or duplicate comment already posted** → no delete
  capability exists — edit it via `--comment-id` instead of creating a
  corrective second comment.
- **User cancels at Step 11** → stop, nothing written, no partial write
  of just the description or just the comment.
- **The `update-description` or `add-comment` CLI call fails** (HTTP
  error, network error) → report the failure plainly with whatever
  error detail it printed to stderr; don't retry silently or fall back
  to a markdown write.

## Quick Reference

| Step | Action |
|---|---|
| 0 | Profile pre-check — skip entirely if `ticket: false` |
| 1 | Resolve `<Key>` from branch name |
| 2 | Ensure the Jira client is available: defensive `digismith:depot` `ensure` check, then `check-credentials` — bootstrap via `AskUserQuestion` if incomplete |
| 3 | Fetch the description via `get-issue` |
| 4 | Determine template type — auto Progress after `capture-ephemeral-url`, else ask |
| 5 | Derive this repo's row label (Progress Update only) |
| 6 | Draft Materials & Links delta (Progress Update only) |
| 7 | Draft Track checklist delta (Progress Update only) |
| 8 | Compose the full new description document (Progress Update only; no-op otherwise) |
| 9 | Generate the comment via `generate-comment` — get `{markdown, headingPrefix}` |
| 10 | Find today's existing comment via `headingPrefix` + date-boundary match |
| 11 | Confirm full draft with the user — post / revise / cancel |
| 12 | Convert the comment Markdown to ADF via `markdown-to-adf` |
| 13 | Write the description (Progress Update only) |
| 14 | Write the comment (create, or update via `--comment-id`) |
| 15 | Report what was written |
```

- [ ] **Step 4: Manual smoke test**

Run through the skill live once for each template type against a real or
sandbox ticket (or dry-run through Step 11's confirmation, cancelling
before Step 12, if no safe ticket is available): confirm the Progress
Update path still edits the description and posts a comment identical in
shape to before this refactor, and the Investigation Update path posts a
comment with no description edits at all.

- [ ] **Step 5: Commit**

```bash
git add skills/jira-progress-write-back/SKILL.md
git commit -m "refactor(jira-progress-write-back): consume generate-comment, add Investigation Update path (Q.2)"
```

---

## Task 5: Refactor teams-pr-review-notification (I.4) to consume generate-comment

**Files:**
- Modify: `skills/teams-pr-review-notification/SKILL.md` (full rewrite — Steps 1-4 removed, Step 5 replaced, Step 6 kept)

**Interfaces:**
- Consumes: `generate-comment` (Task 3).
- Produces: nothing new for other consumers — this is a leaf skill.

No automated test cycle (agentic instruction file). Verification is a manual/live smoke test in Step 2 below.

- [ ] **Step 1: Rewrite the whole file**

Replace `skills/teams-pr-review-notification/SKILL.md` in full:

```markdown
---
name: teams-pr-review-notification
description: Use right after finishing-a-development-branch's Option 2 (Push and Create PR) reports a new PR's URL and Jack accepts the offer to draft one, or when explicitly asked to draft a Teams review-request message — generates ready-to-paste text only, matching Jack's own real message style; never connects to Teams itself.
---

# Teams PR-Review Notification

## Overview

DigiSmith's map item **I.4**. Generates a ready-to-paste Microsoft Teams
message asking reviewers to look at one or more open pull requests,
matching Jack's own established message style exactly. DigiSmith never
connects to Teams itself — no API call, no browser automation — this
skill only produces text for Jack to paste in himself. The message is
drafted by `generate-comment` (**Q.1**) — this skill just triggers it and
presents the result. See
`.digismith/docs/teams-pr-review-notification/design.html` for the
original design (why a live Graph API integration and browser automation
were both ruled out) and `.digismith/docs/generate-comment/design.html`
for the templating mechanism this now consumes.

## Invoked By

- **Automatically-offered**, by `finishing-a-development-branch`'s Option 2
  right after it reports a newly-created PR's URL — a lightweight yes/no
  ask, never invoked without confirmation.
- **Directly**, on explicit request ("draft a Teams review request for
  this PR", "notify Teams about these PRs") — covers both a single PR and
  a multi-repo epic (several PRs across market repos, sharing one ticket).

## Process

### Step 1: Generate the Message

Invoke `generate-comment` (**Q.1**) with template type
`teams-review-request`. When auto-offered by
`finishing-a-development-branch`, pass along the PR title, URL, and
current ticket key it already has (if the branch name matched
`<Key>__<slug>`) so `generate-comment` doesn't re-ask for what's already
known. When invoked directly, `generate-comment` gathers everything
itself (scope, PR info, reviewer names, ask line — see its own Process
for the exact steps). Receive back `{markdown, headingPrefix}` —
`headingPrefix` is not used by this skill at all; only `markdown`
matters here.

### Step 2: Present

Print `markdown` as a plain text block for Jack to copy. Nothing is
sent, posted, or connected to Teams — the skill's job ends here.

## Error Handling

Everything that can go wrong drafting the message (no PR found for the
current branch, no `teams_reviewers` preference set, no ticket
key/context available) is `generate-comment`'s own Error Handling now —
see its SKILL.md. This skill has nothing left to handle on its own except
presenting whatever `generate-comment` returns.

## Out of Scope

- Any live Teams connection (Graph API, browser automation) — see the
  original design doc's Mechanism section for why both were ruled out.
- Automating multi-repo PR discovery — belongs to map item **I.2** once it
  ships, not duplicated here.
- Editing or updating a previously-sent message — DigiSmith never sends
  anything, so there is nothing to find and edit later.

## Quick Reference

| Step | Action |
|---|---|
| 1 | Generate the message via `generate-comment` (template type `teams-review-request`) |
| 2 | Present as plain text — nothing sent |
```

- [ ] **Step 2: Manual smoke test**

Run through the skill live once for both the single-PR and multi-repo
epic paths (or at minimum the single-PR path if no multi-repo epic is
available to test against): confirm the presented message is
byte-for-byte identical in shape to what the skill produced before this
refactor (`Hello 500 ae (...) -- ...` / ticket line / one `🔗 <market> PR:
<link>` line per PR).

- [ ] **Step 3: Commit**

```bash
git add skills/teams-pr-review-notification/SKILL.md
git commit -m "refactor(teams-pr-review-notification): consume generate-comment (Q.2)"
```

---

## Execution Handoff

5 tasks, two of which (4 and 5) modify already-shipped, live skills that
other work depends on (`finishing-a-development-branch`'s auto-offer into
I.4; anything that already relies on I.1's exact posting behavior) —
real risk that benefits from an independent reviewer's fresh eyes, not
just task count. **Using Subagent-Driven Development**, per
`digismith:subagent-driven-development`: fresh subagent per task plus a
two-stage review, given both the task count (5) and that risk profile.
