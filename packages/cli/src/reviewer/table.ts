import * as fs from "node:fs";
import * as path from "node:path";
import { readReviews, type Review } from "./findings.ts";
import { judgementKey, parseVerdictLines, type Judgement } from "./verdicts.ts";
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

export function buildRows(reviews: Review[], judgements: Map<string, Judgement>): Row[] {
  const sorted = [...reviews].sort((a, b) => {
    const [ak, bk] = [orderKey(a), orderKey(b)];
    return ak[0] - bk[0] || ak[1] - bk[1] || ak[2] - bk[2];
  });
  const used = new Set<string>();
  const unjudged: string[] = [];
  const rows: Row[] = [];
  for (const r of sorted) {
    if (r.findings.length === 0) {
      rows.push({ type: typeLabel(r), round: r.round, where: "-", severity: "-", what: "approved, no findings", scenario: "-", verdict: "-" });
      continue;
    }
    for (const f of [...r.findings].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))) {
      const key = judgementKey(r.kind, r.id, r.round, f.id);
      const j = judgements.get(key);
      if (!j) { unjudged.push(key); continue; }
      used.add(key);
      rows.push({
        type: typeLabel(r), round: r.round,
        where: f.line === null ? f.path : `${f.path}:${f.line}`,
        severity: f.severity, what: f.what, scenario: f.scenario,
        verdict: j.reason === "" ? j.verdict : `${j.verdict} (${j.reason})`,
      });
    }
  }
  if (unjudged.length > 0) throw new Error(`findings with no verdict line: ${unjudged.join(", ")}`);
  const orphans = [...judgements.keys()].filter((k) => !used.has(k));
  if (orphans.length > 0) throw new Error(`verdict line names no finding: ${orphans.join(", ")}`);
  return rows;
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

export function runTable(opts: { workspace: string; ledger?: string; out: string }): { written: boolean; message: string } {
  if (!fs.existsSync(opts.workspace) || !fs.statSync(opts.workspace).isDirectory()) {
    throw new Error(`workspace: no such folder: ${opts.workspace}`);
  }
  const reviews = readReviews(opts.workspace);
  if (reviews.length === 0) return { written: false, message: "no reviews found" };
  const ledger = opts.ledger ?? path.join(opts.workspace, "progress.md");
  if (!fs.existsSync(ledger)) throw new Error(`ledger: no such file: ${ledger}`);
  const rows = buildRows(reviews, parseVerdictLines(fs.readFileSync(ledger, "utf8")));
  fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
  fs.writeFileSync(opts.out, renderMarkdown(rows));
  return { written: true, message: `wrote ${opts.out} (${rows.length} row(s))` };
}
