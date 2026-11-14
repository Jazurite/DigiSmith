// Pure parsing of adopted guide pages (ClickUp list F.9). No I/O. See DGS-785 spec D1 and D2.

export type GuideKind = "guide" | "manual";

export interface GuideTask {
  key: string;
  name: string;
}

export interface SluggedGuide<T extends GuideTask = GuideTask> {
  key: string;
  name: string;
  slug: string;
  kind: GuideKind;
  task: T;
}

/** Slugs that a `dg guide` subcommand owns. */
const RESERVED_SLUGS = new Set(["list", "refresh"]);

/** `\` before ASCII punctuation becomes that character; a backslash before anything else stays. */
export function unescapeMd(text: string): string {
  return text.replace(/\\([!-/:-@[-`{-~])/g, "$1");
}

/** D1: the first non-blank line, without `*`, `_` and backslashes, starts with "Adopted by Jack". */
export function isAdopted(markdown: string): boolean {
  const first = markdown.split(/\r?\n/).find((line) => line.trim() !== "");
  if (first === undefined) return false;
  return /^(Version \d+\. )?Adopted by Jack\b/.test(first.replace(/[*_\\]/g, "").trim());
}

function kindFor(name: string): GuideKind | undefined {
  if (name.startsWith("Guide: ")) return "guide";
  if (name.startsWith("Manual: ")) return "manual";
  return undefined;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** D1: slug of a `Guide: X` or `Manual: X (group intro)` name; undefined without either prefix. */
export function slugFor(name: string): string | undefined {
  const kind = kindFor(name);
  if (kind === undefined) return undefined;
  if (kind === "guide") return slugify(name.slice("Guide: ".length));
  const rest = name.slice("Manual: ".length).replace(/\s*\(group intro\)\s*$/i, "");
  return slugify(`manual ${rest}`);
}

/** D1: slugs for every guide or manual task; collisions and reserved slugs get `-<key lowercase>`. Guides first, then manuals, each by slug. */
export function assignSlugs<T extends GuideTask>(tasks: T[]): SluggedGuide<T>[] {
  const base: { task: T; slug: string; kind: GuideKind }[] = [];
  for (const task of tasks) {
    const slug = slugFor(task.name);
    const kind = kindFor(task.name);
    if (slug === undefined || kind === undefined) continue;
    base.push({ task, slug, kind });
  }
  const counts = new Map<string, number>();
  for (const b of base) counts.set(b.slug, (counts.get(b.slug) ?? 0) + 1);
  const out = base.map((b) => ({
    key: b.task.key,
    name: b.task.name,
    kind: b.kind,
    task: b.task,
    slug: (counts.get(b.slug) ?? 0) > 1 || RESERVED_SLUGS.has(b.slug) ? `${b.slug}-${b.task.key.toLowerCase()}` : b.slug,
  }));
  const rank = (k: GuideKind): number => (k === "guide" ? 0 : 1);
  return out.sort((a, b) => rank(a.kind) - rank(b.kind) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** Unescape every line outside a fenced code block. */
export function cleanPage(markdown: string): string {
  let marker: string | undefined;
  return markdown
    .split("\n")
    .map((line) => {
      const m = /^\s*(```|~~~)/.exec(line);
      if (m !== null) {
        if (marker === undefined) marker = m[1];
        else if (marker === m[1]) marker = undefined;
        return line;
      }
      return marker !== undefined ? line : unescapeMd(line);
    })
    .join("\n");
}

const HEADING = /^#{1,6}(?:\s+(.*?))?\s*$/;

function headingText(line: string): string | undefined {
  const m = HEADING.exec(line);
  return m === undefined || m === null ? undefined : (m[1] ?? "").replace(/\*/g, "").trim().toLowerCase();
}

function cleanItem(text: string): string {
  return text
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** The cleaned items (bullets and plain lines) of the first section with this heading; tables and blanks skipped. */
function sectionItems(lines: string[], title: string): string[] {
  const start = lines.findIndex((l) => headingText(l) === title);
  if (start < 0) return [];
  const raw: string[] = [];
  let open = false; // the previous line was an item line, so a plain line continues it
  for (const line of lines.slice(start + 1)) {
    if (HEADING.test(line)) break;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("|")) {
      open = false;
      continue;
    }
    const bullet = /^(?:[*-]|\d+\.)\s+/.exec(trimmed);
    if (bullet === null && open) raw[raw.length - 1] += ` ${trimmed}`;
    else raw.push(bullet === null ? trimmed : trimmed.slice(bullet[0].length));
    open = true;
  }
  return raw.map(cleanItem).filter((item) => item !== "");
}

/** D2: the "When to use it" bullets joined with " / "; falls back to the first sentence of "What it is", then "". */
export function whenToUse(markdown: string): string {
  const lines = cleanPage(markdown).split(/\r?\n/);
  const when = sectionItems(lines, "when to use it");
  if (when.length > 0) return when.join(" / ");
  const what = sectionItems(lines, "what it is").join(" ");
  if (what === "") return "";
  const sentence = /^.*?[.!?](?=\s|$)/.exec(what);
  return sentence === null ? what : sentence[0];
}
