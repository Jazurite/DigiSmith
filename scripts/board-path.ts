// Builds and parses `.digismith/board/<KEY>—<slug>/` folder names (em dash, U+2014).
// Spec: .digismith/docs/E/E.3/worker-maestro-conventions/design.html, sections 2 and 9.

export const BOARD_DIR_PATH = ".digismith/board";
const EM_DASH = "—";
const KEY_PATTERN = /^[A-Z]+-\d+$/;
const FILLER_WORDS = new Set(["a", "an", "the", "on", "to", "of", "for", "in"]);

// jira-intake's own slug algorithm (SKILL.md Step 3.1), codified here for the first time — no
// prior code implemented it, only prose for an LLM to follow by hand. The prose lists "drop
// filler words" before "truncate to ~40 characters at a word boundary", but its own worked
// example ("Fix cart drawer padding on mobile checkout" -> "fix-cart-drawer-padding-mobile")
// only reproduces under the opposite order: the 40-character budget is spent on the original
// word sequence (fillers included), and filler words are dropped only from what survives that
// cut — "checkout" alone would still fit a filler-dropped budget, so budgeting on the
// filler-dropped words can't be what the example means. Order implemented here matches the
// example, not the prose's literal word order.
export function slugify(title: string): string {
  const words = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);

  const kept: string[] = [];
  let length = 0;
  for (const word of words) {
    const next = kept.length === 0 ? word.length : length + 1 + word.length;
    if (next > 40) break;
    kept.push(word);
    length = next;
  }

  // Dropping fillers after truncation, from wherever they sit in `kept`, means none can ever
  // end up trailing in the joined result — no separate "trailing filler" check needed.
  return kept.filter((word) => !FILLER_WORDS.has(word)).join("-");
}

export function buildFolderName(key: string, title: string): string {
  // NFC is a no-op today (slugify only ever emits ASCII) — defensive per section 9, in case a
  // future slugify revision keeps more of the title's own characters.
  return `${key.toUpperCase()}${EM_DASH}${slugify(title)}`.normalize("NFC");
}

export function boardRelPath(key: string, title: string): string {
  return `${BOARD_DIR_PATH}/${buildFolderName(key, title)}`;
}

export type ParsedFolderName = { key: string; slug: string };

export function parseFolderName(name: string): ParsedFolderName {
  const dashIndex = name.indexOf(EM_DASH);
  if (dashIndex === -1) {
    throw new Error(`no em dash (U+2014) found in board folder name: ${name}`);
  }
  const rawKey = name.slice(0, dashIndex).toUpperCase();
  if (!KEY_PATTERN.test(rawKey)) {
    throw new Error(`board folder name's key part is not <PREFIX>-<number>: ${name}`);
  }
  // The slug can never itself contain U+2014 (slugify only emits ASCII hyphens), so splitting
  // at the first occurrence is always unambiguous — no need to find the last one.
  const slug = name.slice(dashIndex + EM_DASH.length);
  return { key: rawKey, slug };
}
