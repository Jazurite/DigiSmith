import * as fs from "node:fs";
import * as path from "node:path";
import { REVIEWER_TYPES, SEVERITIES, type ReviewerType, type Severity } from "./types.ts";

export type Finding = {
  id: string;
  path: string;
  line: number | null;
  severity: Severity;
  what: string;
  scenario: string;
};

export type Review = { kind: ReviewerType; id: string; round: number; file: string; findings: Finding[] };

const FENCE_RE = /^```json findings[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm;
const PACK_DIR_RE = new RegExp(`^(${REVIEWER_TYPES.join("|")})-(\\d+|final)-r(\\d+)$`);

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

export function parseFindings(json: string, source: string): Finding[] {
  let data: unknown;
  try { data = JSON.parse(json); } catch (e) { throw new Error(`${source}: findings block is not valid JSON (${(e as Error).message})`); }
  if (!Array.isArray(data)) throw new Error(`${source}: findings block must be a JSON array`);
  const seen = new Set<string>();
  return data.map((raw, i) => {
    const f = raw as Record<string, unknown>;
    const at = `${source}: finding ${i + 1}`;
    if (typeof f !== "object" || f === null) throw new Error(`${at}: must be an object`);
    if (typeof f.id !== "string" || !/^F\d+$/.test(f.id)) throw new Error(`${at}: id must look like F1`);
    if (seen.has(f.id)) throw new Error(`${at}: duplicate id ${f.id}`);
    seen.add(f.id);
    if (!nonEmpty(f.path)) throw new Error(`${at}: path must not be empty`);
    if (f.line !== null && !(Number.isInteger(f.line) && (f.line as number) >= 1)) throw new Error(`${at}: line must be an integer of 1 or more, or null`);
    if (!(SEVERITIES as readonly unknown[]).includes(f.severity)) throw new Error(`${at}: severity must be one of ${SEVERITIES.join(", ")}`);
    if (!nonEmpty(f.what)) throw new Error(`${at}: what must not be empty`);
    if (typeof f.scenario !== "string") throw new Error(`${at}: scenario must be a string`);
    return { id: f.id, path: f.path, line: f.line as number | null, severity: f.severity as Severity, what: f.what, scenario: f.scenario };
  });
}

// The last "json findings" block wins: a report may quote an earlier block.
export function extractFindings(report: string, source: string): Finding[] {
  const blocks = [...report.matchAll(FENCE_RE)];
  if (blocks.length === 0) throw new Error(`${source}: no "json findings" block`);
  return parseFindings(blocks[blocks.length - 1][1], source);
}

export function readReviews(workspace: string): Review[] {
  const root = path.join(workspace, "reviews");
  if (!fs.existsSync(root)) return [];
  const reviews: Review[] = [];
  for (const name of fs.readdirSync(root).sort()) {
    const m = PACK_DIR_RE.exec(name);
    if (!m || !fs.statSync(path.join(root, name)).isDirectory()) continue;
    const file = path.join(root, name, "report.md");
    if (!fs.existsSync(file)) throw new Error(`${name}: no report.md`);
    reviews.push({
      kind: m[1] as ReviewerType, id: m[2], round: Number(m[3]), file,
      findings: extractFindings(fs.readFileSync(file, "utf8"), file),
    });
  }
  return reviews;
}
