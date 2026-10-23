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

const STATUS_COLORS = ["neutral", "purple", "blue", "red", "yellow", "green"];

const INLINE_TOKEN =
  /\*\*(?<bold>[^*]+)\*\*|\{status:(?<statusText>[^|}]+)\|(?<statusColor>[^}]+)\}|@\[(?<mentionName>[^\]]+)\]\((?<mentionId>[^)]+)\)|\[(?<linkText>[^\]]+)\]\((?<linkUrl>[^)]+)\)/g;

function plainText(text: string): AdfNode {
  if (text.includes("{status:")) {
    unsupported("status token (use {status:TEXT|color})", text);
  }
  return { type: "text", text };
}

function parseInline(text: string): AdfNode[] {
  const nodes: AdfNode[] = [];
  let lastIndex = 0;
  INLINE_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_TOKEN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(plainText(text.slice(lastIndex, match.index)));
    }
    const groups = match.groups!;
    if (groups.bold !== undefined) {
      nodes.push({ type: "text", text: groups.bold, marks: [{ type: "strong" }] });
    } else if (groups.statusText !== undefined) {
      const color = groups.statusColor.trim().toLowerCase();
      if (!STATUS_COLORS.includes(color)) {
        unsupported(`status color ${JSON.stringify(color)} (use one of ${STATUS_COLORS.join(", ")})`, text);
      }
      nodes.push({ type: "status", attrs: { text: groups.statusText.trim(), color } });
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
    nodes.push(plainText(text.slice(lastIndex)));
  }
  return nodes.length > 0 ? nodes : [{ type: "text", text: "" }];
}

function unsupported(construct: string, line: string): never {
  throw new Error(`markdown-to-adf: unsupported construct (${construct}): ${JSON.stringify(line)}`);
}

const MEDIA_LINE = /^!\[(?<alt>[^\]]*)\]\(media:(?<id>[^)?\s]+)(?:\?(?<params>[^)]*))?\)\s*$/;

function parseMediaLine(line: string): AdfNode | null {
  const match = MEDIA_LINE.exec(line);
  if (!match) return null;
  const { alt, id, params } = match.groups!;
  const singleAttrs: Record<string, unknown> = { layout: "center" };
  const mediaAttrs: Record<string, unknown> = { type: "file", id, collection: "" };
  const seen = new Set<string>();
  for (const param of params ? params.split("&") : []) {
    const eq = param.indexOf("=");
    const key = eq === -1 ? param : param.slice(0, eq);
    const value = eq === -1 ? "" : param.slice(eq + 1);
    if (seen.has(key)) unsupported(`duplicate image parameter ${JSON.stringify(key)}`, line);
    seen.add(key);
    if (key === "width" && /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 100) {
      singleAttrs.width = Number(value);
    } else if (key === "size" && /^\d+x\d+$/.test(value) && value.split("x").every((n) => Number(n) > 0)) {
      const [width, height] = value.split("x").map(Number);
      mediaAttrs.width = width;
      mediaAttrs.height = height;
    } else {
      unsupported(`image parameter ${JSON.stringify(param)} (use width=<1-100> or size=<W>x<H>)`, line);
    }
  }
  if (alt.trim() !== "") mediaAttrs.alt = alt.trim();
  return { type: "mediaSingle", attrs: singleAttrs, content: [{ type: "media", attrs: mediaAttrs }] };
}

function checkNotUnsupported(line: string): void {
  if (/^```/.test(line)) unsupported("code block", line);
  if (/^>/.test(line)) unsupported("blockquote", line);
  if (/^\d+\.\s+/.test(line)) unsupported("numbered list", line);
  if (/^\s+[-*]\s+/.test(line)) unsupported("nested list", line);
  if (/^\|/.test(line)) unsupported("table", line);
  if (/!\[[^\]]*\]\([^)]*\)/.test(line) || /^!\[/.test(line) || /\(media:/.test(line)) {
    unsupported("image (only a whole-line ![alt](media:<mediaId>) token is supported)", line);
  }
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
    /^!\[/.test(line) ||
    /\(media:/.test(line) ||
    /`[^`]*`/.test(line)
  );
}

export function markdownToAdf(markdown: string): AdfDoc {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const content: AdfNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    const media = parseMediaLine(line);
    if (media) {
      content.push(media);
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
