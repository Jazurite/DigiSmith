import { parseVerdictEntries, type VerdictEntry } from "../reviewer/verdicts.ts";

export type ReviewData = {
  rounds: number | null;
  findings: number | null;
  fixed: number | null;
  parked: number | null;
  rejected: number | null;
  open: number | null;
  fixRounds: number | null;
  source: "ledger" | "findings.md" | "none";
};

const NONE: ReviewData = { rounds: null, findings: null, fixed: null, parked: null, rejected: null, open: null, fixRounds: null, source: "none" };

function fromLedger(task: string, text: string): ReviewData | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim().replace(/^- /, ""));
  const isFinal = task === "final";
  const prefix = `Task ${task}: `;
  const kind = isFinal ? "ticket" : "task";

  let rounds = 0;
  let handFindings = 0;
  let fixRoundLines = 0;
  let handParked = 0;
  let scoped = 0;
  let seen = false;
  for (const l of lines) {
    if (isFinal && l.startsWith("Scoped re-review")) { scoped++; continue; }
    if (!l.startsWith(prefix)) continue;
    const rest = l.slice(prefix.length);
    const m = /^reviewed \((clean|(\d+) findings?)\)/.exec(rest);
    if (m) { rounds++; handFindings += m[2] ? Number(m[2]) : 0; seen = true; }
    else if (/^fix round \d+\/\d+/.test(rest)) { fixRoundLines++; }
    else if (rest.startsWith("parked")) { handParked++; }
  }

  const entries: VerdictEntry[] = [];
  for (const l of lines) {
    if (!l.startsWith("Review task ") && !l.startsWith("Review ticket ")) continue;
    try { entries.push(...parseVerdictEntries(l)); } catch { /* skip a malformed line */ }
  }
  const mine = entries.filter((e) => e.kind === kind && e.id === task);
  if (mine.length > 0) seen = true;
  if (!seen) return null;

  if (mine.length === 0) {
    const fixed = fixRoundLines > 0 ? Math.max(0, handFindings - handParked) : 0;
    return {
      rounds: rounds || null,
      findings: handFindings,
      fixed,
      parked: handParked,
      rejected: 0,
      open: Math.max(0, handFindings - handParked - fixed),
      fixRounds: isFinal ? scoped : fixRoundLines,
      source: "ledger",
    };
  }

  const latest = new Map<string, VerdictEntry>();
  for (const e of mine) {
    const prev = latest.get(e.finding);
    if (!prev || e.round >= prev.round) latest.set(e.finding, e);
  }
  let fixed = 0, parked = 0, rejected = 0;
  for (const e of latest.values()) {
    if (e.verdict === "fixed") fixed++;
    else if (e.verdict === "parked") parked++;
    else if (e.verdict === "rejected") rejected++;
  }
  const findings = Math.max(handFindings, latest.size);
  const fixingRounds = new Set(mine.filter((e) => e.verdict === "fixing").map((e) => e.round)).size;
  const roleRounds = new Set(mine.map((e) => e.round)).size;
  return {
    rounds: rounds || roleRounds,
    findings,
    fixed, parked, rejected,
    open: Math.max(0, findings - fixed - parked - rejected),
    fixRounds: isFinal ? scoped : fixRoundLines || fixingRounds,
    source: "ledger",
  };
}

function fromFindings(task: string, text: string): ReviewData | null {
  const want = task === "final" ? "ticket" : `task ${task}`;
  let rounds = 0, findings = 0, fixed = 0, parked = 0, rejected = 0, seen = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.length < 7 || cells[0].toLowerCase() !== want) continue;
    const round = Number(cells[1]);
    if (!Number.isFinite(round)) continue;
    seen = true;
    rounds = Math.max(rounds, round);
    if (/approved, no findings/i.test(cells[4])) continue;
    findings++;
    const v = cells[cells.length - 1].toLowerCase();
    if (v.startsWith("fixed")) fixed++;
    else if (v.startsWith("parked")) parked++;
    else if (v.startsWith("rejected")) rejected++;
  }
  return seen ? { rounds, findings, fixed, parked, rejected, open: Math.max(0, findings - fixed - parked - rejected), fixRounds: null, source: "findings.md" } : null;
}

export function reviewData(task: string, sources: { ledgerText?: string; findingsText?: string }): ReviewData {
  return (
    (sources.ledgerText ? fromLedger(task, sources.ledgerText) : null) ??
    (sources.findingsText ? fromFindings(task, sources.findingsText) : null) ??
    { ...NONE }
  );
}
