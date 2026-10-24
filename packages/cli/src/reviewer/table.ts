import * as fs from "node:fs";
import * as path from "node:path";
import { readReviews, type Finding, type Review } from "./findings.ts";
import { parseVerdictEntries, type VerdictEntry } from "./verdicts.ts";
import { REVIEWER_TYPES } from "./types.ts";

export type Row = {
  type: string;
  round: number;
  where: string;
  severity: string;
  what: string;
  scenario: string;
  verdict: string;
};

const HEADER = ["Reviewer type", "Round", "Path:line", "Severity", "What is wrong", "Failing scenario", "Verdict"];

function orderKey(r: Review): [number, number, number] {
  const id = r.id === "final" ? Number.MAX_SAFE_INTEGER : Number(r.id);
  return [REVIEWER_TYPES.indexOf(r.kind), id, r.round];
}

function typeLabel(r: Review): string {
  return r.kind === "task" ? `task ${r.id}` : "ticket";
}

type Ruling = { round: number; verdict: string; reason: string };
type Logged = Ruling & { line: number; text: string }; // line and text stay out of the JSON
export type Resolved = { review: Review; finding: Finding; history: Logged[] };

const sortReviews = (reviews: Review[]): Review[] =>
  [...reviews].sort((a, b) => {
    const [ak, bk] = [orderKey(a), orderKey(b)];
    return ak[0] - bk[0] || ak[1] - bk[1] || ak[2] - bk[2];
  });

const packName = (r: Review): string => `${r.kind}-${r.id}-r${r.round}`;

// One entry rules on the finding of the pack with the same round, else on the latest earlier raise.
function link(reviews: Review[], entries: VerdictEntry[], strict: boolean): Map<Finding, Resolved> {
  const raised = new Map<string, Resolved[]>();
  const all = new Map<Finding, Resolved>();
  for (const r of sortReviews(reviews)) {
    for (const f of r.findings) {
      const res: Resolved = { review: r, finding: f, history: [] };
      all.set(f, res);
      const key = `${r.kind} ${r.id} ${f.id}`;
      raised.set(key, [...(raised.get(key) ?? []), res]);
    }
  }
  for (const e of entries) {
    const candidates = raised.get(`${e.kind} ${e.id} ${e.finding}`) ?? [];
    const target = candidates.find((c) => c.review.round === e.round)
      ?? [...candidates].reverse().find((c) => c.review.round < e.round);
    if (!target) {
      if (!strict) continue;
      const packs = sortReviews(reviews).map(packName).join(", ");
      throw new Error(`ledger line ${e.line}: ${e.text}: no pack raised ${e.kind} ${e.id} ${e.finding}; packs read: ${packs}`);
    }
    target.history.push({ round: e.round, verdict: e.verdict, reason: e.reason, line: e.line, text: e.text });
  }
  for (const r of all.values()) r.history.sort((a, b) => a.round - b.round); // stable: ledger order inside a round
  return all;
}

export const linkRulings = (reviews: Review[], entries: VerdictEntry[]): Map<Finding, Resolved> => link(reviews, entries, false);

export const isOpen = (history: { verdict: string }[]): boolean =>
  history.length === 0 || history[history.length - 1].verdict === "fixing";

function resolve(reviews: Review[], entries: VerdictEntry[]): Map<Finding, Resolved> {
  const all = link(reviews, entries, true);
  const unjudged = [...all.values()]
    .filter((r) => r.history.length === 0)
    .map((r) => judgementKeyOf(r));
  if (unjudged.length > 0) throw new Error(`findings with no verdict line: ${unjudged.join(", ")}`);
  const unfinished = [...all.values()]
    .map((r) => ({ r, last: r.history[r.history.length - 1] }))
    .filter((u) => u.last.verdict === "fixing")
    .sort((a, b) => a.last.line - b.last.line)
    .map((u) => `ledger line ${u.last.line}: ${u.last.text}: fix not finished for ${judgementKeyOf(u.r)}`);
  if (unfinished.length > 0) throw new Error(unfinished.join("; "));
  return all;
}

const judgementKeyOf = (r: Resolved): string => `${r.review.kind} ${r.review.id} r${r.review.round} ${r.finding.id}`;
const sortedFindings = (r: Review): Finding[] =>
  [...r.findings].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));

const latest = (r: Resolved): Ruling => [...r.history].reverse().find((h) => h.verdict !== "fixing") as Ruling;

export function buildRows(reviews: Review[], entries: VerdictEntry[]): Row[] {
  const resolved = resolve(reviews, entries);
  const rows: Row[] = [];
  for (const r of sortReviews(reviews)) {
    if (r.findings.length === 0) {
      rows.push({ type: typeLabel(r), round: r.round, where: "-", severity: "-", what: "approved, no findings", scenario: "-", verdict: "-" });
      continue;
    }
    for (const f of sortedFindings(r)) {
      const l = latest(resolved.get(f) as Resolved);
      const text = l.reason === "" ? l.verdict : `${l.verdict} (${l.reason})`;
      rows.push({
        type: typeLabel(r), round: r.round,
        where: f.line === null ? f.path : `${f.path}:${f.line}`,
        severity: f.severity, what: f.what, scenario: f.scenario,
        verdict: l.round === r.round ? text : `${text} [r${l.round}]`,
      });
    }
  }
  return rows;
}

export type JsonFinding = {
  id: string; review: { kind: string; id: string }; finding: string; severity: string;
  raisedRound: number; latestRound: number; latestRuling: { verdict: string; reason: string };
  history: Ruling[];
};
export type TableJson = { schema: 1; findings: JsonFinding[]; approvedReviews: { kind: string; id: string; round: number }[] };

export function buildJson(reviews: Review[], entries: VerdictEntry[]): TableJson {
  const resolved = resolve(reviews, entries);
  const findings: JsonFinding[] = [];
  const approvedReviews: TableJson["approvedReviews"] = [];
  for (const r of sortReviews(reviews)) {
    if (r.findings.length === 0) { approvedReviews.push({ kind: r.kind, id: r.id, round: r.round }); continue; }
    for (const f of sortedFindings(r)) {
      const res = resolved.get(f) as Resolved;
      const l = latest(res);
      findings.push({
        id: judgementKeyOf(res), review: { kind: r.kind, id: r.id }, finding: f.id, severity: f.severity,
        raisedRound: r.round, latestRound: l.round, latestRuling: { verdict: l.verdict, reason: l.reason },
        history: res.history.map((h) => ({ round: h.round, verdict: h.verdict, reason: h.reason })),
      });
    }
  }
  return { schema: 1, findings, approvedReviews };
}

const cell = (v: string | number): string => {
  const s = String(v).replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
  return s === "" ? "-" : s;
};

export function renderMarkdown(rows: Row[]): string {
  const lines = [
    "# Review findings",
    "",
    `| ${HEADER.join(" | ")} |`,
    `| ${HEADER.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${[r.type, r.round, r.where, r.severity, r.what, r.scenario, r.verdict].map(cell).join(" | ")} |`),
    "",
  ];
  return lines.join("\n");
}

export function runTable(opts: { workspace: string; ledger?: string; out?: string; json?: boolean }): { written: boolean; message: string; json?: string } {
  if (!opts.json && !opts.out) throw new Error("--out is required without --json");
  if (!fs.existsSync(opts.workspace) || !fs.statSync(opts.workspace).isDirectory()) {
    throw new Error(`workspace: no such folder: ${opts.workspace}`);
  }
  const reviews = readReviews(opts.workspace);
  if (reviews.length === 0) {
    if (!opts.json) return { written: false, message: "no reviews found" };
    const empty = `${JSON.stringify(buildJson([], []), null, 2)}\n`;
    if (!opts.out) return { written: false, message: "no reviews found", json: empty };
    fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
    fs.writeFileSync(opts.out, empty);
    return { written: true, message: `wrote ${opts.out} (0 finding(s))` };
  }
  const ledger = opts.ledger ?? path.join(opts.workspace, "progress.md");
  if (!fs.existsSync(ledger)) throw new Error(`ledger: no such file: ${ledger}`);
  const entries = parseVerdictEntries(fs.readFileSync(ledger, "utf8"));
  if (opts.json) {
    const json = `${JSON.stringify(buildJson(reviews, entries), null, 2)}\n`;
    if (!opts.out) return { written: false, message: "json", json };
    fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
    fs.writeFileSync(opts.out, json);
    return { written: true, message: `wrote ${opts.out}` };
  }
  const rows = buildRows(reviews, entries);
  fs.mkdirSync(path.dirname(path.resolve(opts.out as string)), { recursive: true });
  fs.writeFileSync(opts.out as string, renderMarkdown(rows));
  return { written: true, message: `wrote ${opts.out} (${rows.length} row(s))` };
}
