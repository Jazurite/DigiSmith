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

function checkNotUnsupported(line: string): void {
  if (/^```/.test(line)) unsupported("code block", line);
  if (/^>/.test(line)) unsupported("blockquote", line);
  if (/^\d+\.\s+/.test(line)) unsupported("numbered list", line);
  if (/^\s+[-*]\s+/.test(line)) unsupported("nested list", line);
  if (/^\|/.test(line)) unsupported("table", line);
  if (/!\[[^\]]*\]\([^)]*\)/.test(line)) unsupported("image", line);
  if (/`[^`]*`/.test(line)) unsupported("inline code span", line);
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
    /^\|/.test(line) ||
    /!\[[^\]]*\]\([^)]*\)/.test(line) ||
    /`[^`]*`/.test(line)
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

    checkNotUnsupported(line);

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
        checkNotUnsupported(lines[i]);
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
