export const REVIEWER_TYPES = ["task", "ticket"] as const;
export type ReviewerType = (typeof REVIEWER_TYPES)[number];

export const SEVERITIES = ["Critical", "Important", "Minor"] as const;
export type Severity = (typeof SEVERITIES)[number];

// The model policy lives here and nowhere else. The role picks the model for a review.
export const SONNET = "claude-sonnet-5-5";
export const OPUS = "claude-opus-5-5";
export const TASK_ESCALATE_LINES = 800;

export function modelFor(type: ReviewerType, changedLines: number): string {
  if (type === "ticket") return OPUS;
  return changedLines > TASK_ESCALATE_LINES ? OPUS : SONNET;
}

const FILE_HEADER_RE = /^(?:\+\+\+|---) (?:a\/|b\/|\/dev\/null)/;

// Counts + and - lines of the diff part of a review package. The part before the first
// "diff --git" line is the commit list and the stat summary, so it is skipped.
export function countChangedLines(diff: string): number {
  let inDiff = false;
  let n = 0;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) { inDiff = true; continue; }
    if (!inDiff || FILE_HEADER_RE.test(line)) continue;
    if (line.startsWith("+") || line.startsWith("-")) n++;
  }
  return n;
}
