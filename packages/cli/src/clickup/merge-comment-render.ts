export interface CommitLine { sha: string; subject: string }

export interface MergeCommentInput {
  key: string;
  now: Date;
  base: string;
  head: string;
  version?: string;
  commits: CommitLine[];
  tests?: string;
  decisions?: string;
  next?: string;
  splitOff?: string;
  part?: string;
  reportAttached: boolean;
}

const MAX_COMMITS = 8;
const MAX_DECISIONS = 3;
const MAX_FIELD = 300;

const pad = (n: number) => String(n).padStart(2, "0");

/** `2026-11-13 14:20 UTC+7 [07:20Z]` */
export function formatTime(d: Date): string {
  const local = new Date(d.getTime() + 7 * 3600_000);
  const date = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  return `${date} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())} UTC+7 [${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z]`;
}

function oneLine(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  const cps = Array.from(t);
  return cps.length > MAX_FIELD ? `${cps.slice(0, MAX_FIELD - 3).join("")}...` : t;
}

function field(s: string | undefined, fallback: string): string {
  const t = s === undefined ? "" : oneLine(s);
  return t === "" ? fallback : t;
}

export function renderMergeComment(i: MergeCommentInput): string {
  const when = formatTime(i.now);
  const lines: string[] = [];
  lines.push(
    i.part ? `${i.key} part merged, ${when}: ${oneLine(i.part).replace(/\.$/, "")}.` : `${i.key} merged, ${when}: done.`,
  );
  lines.push(`Merge ${i.base.slice(0, 7)}..${i.head.slice(0, 7)}${i.version ? `, plugin ${i.version}` : ""}.`);
  for (const c of i.commits.slice(0, MAX_COMMITS)) lines.push(`- ${oneLine(c.subject)} (${c.sha.slice(0, 7)})`);
  if (i.commits.length > MAX_COMMITS) lines.push(`+${i.commits.length - MAX_COMMITS} more`);
  lines.push(`Tests: ${field(i.tests, "not reported")}`);
  const all = (i.decisions ?? "")
    .split("\n")
    .map((l) => oneLine(l.replace(/^\s*[-*]\s+/, "")))
    .filter((l) => l !== "");
  const items = all.slice(0, MAX_DECISIONS);
  const cut = all.length - items.length;
  if (items.length === 0) lines.push("Decisions: not reported");
  else if (items.length === 1) lines.push(`Decisions: ${items[0]}`);
  else lines.push("Decisions:", ...items.map((d) => `- ${d}`));
  if (items.length > 1 && cut > 0) lines.push(`+${cut} more decisions`);
  lines.push(`Next: ${field(i.next, "none")}`);
  lines.push(`Split off: ${field(i.splitOff, "none")}`);
  if (i.reportAttached) lines.push("Report: report.html is attached to this ticket.");
  return lines.join("\n");
}
