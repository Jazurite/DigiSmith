import type { Git } from "./gitx.ts";

const PHASES = ["building", "review", "merge"] as const;
type Phase = (typeof PHASES)[number];
/** The scan interval is a setting, not a guardrail: its problems go to scanProblems and never stop the scan or the merge gate. */
export const DEFAULT_SCAN_EVERY_MINUTES = 30;
const SCAN_MIN = 5;
const SCAN_MAX = 720; // the scheduler's own limits (validateJobs: everyMinutes)
export interface Guardrails { protectedPaths: string[] | null; budgets: Partial<Record<Phase, number>>; problems: string[]; scanEveryMinutes: number; scanProblems: string[] }
export type MainConfig = { ok: true; guardrails: Guardrails } | { ok: false; error: string };

const SIGNIFICANT = /^\s*[^#\s]/;
const indentOf = (l: string): number => l.length - l.trimStart().length;
const stripComment = (v: string): string => v.replace(/\s+#.*$/, "").trim();
const unquote = (v: string): string => (/^(["']).*\1$/.test(v) ? v.slice(1, -1) : v);

/** Reads only the nightwatch: block. Every problem inside it is a guardrail problem; nothing outside it is read. */
export function readGuardrails(text: string): Guardrails {
  const out: Guardrails = { protectedPaths: null, budgets: {}, problems: [], scanEveryMinutes: DEFAULT_SCAN_EVERY_MINUTES, scanProblems: [] };
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const start = lines.findIndex((l) => /^nightwatch:\s*(#.*)?$/.test(l));
  if (start < 0) {
    if (lines.some((l) => /^nightwatch:/.test(l))) out.problems.push("nightwatch: must be a block with indented lines under it, not an inline value");
    return out;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (SIGNIFICANT.test(lines[i]) && indentOf(lines[i]) === 0) { end = i; break; }
  const body = lines.slice(start + 1, end);
  const bad = (m: string): void => { out.problems.push(`nightwatch: ${m}`); };
  if (body.some((l) => /^[ \t]*\t/.test(l))) { bad("tab in indentation; use spaces"); return out; }

  const sig = body.map((l, n) => ({ l, n })).filter((x) => SIGNIFICANT.test(x.l));
  if (sig.length === 0) { bad("'nightwatch:' has no indented lines under it"); return out; }
  const childIndent = indentOf(sig[0].l);
  const seen = new Set<string>();
  let dupScan = false;
  for (let k = 0; k < sig.length; k++) {
    const { l } = sig[k];
    if (indentOf(l) < childIndent) { bad(`line "${l.trim()}" is indented less than the first key under nightwatch:`); continue; }
    if (indentOf(l) !== childIndent) continue;
    const m = /^\s+([a-z0-9_]+):(.*)$/.exec(l);
    if (!m) { bad(`line "${l.trim()}" is not "key: value"`); continue; }
    const key = m[1];
    const inline = stripComment(m[2]);
    const kids: string[] = [];
    for (let j = k + 1; j < sig.length && indentOf(sig[j].l) > childIndent; j++) kids.push(sig[j].l);
    if (key === "scan_every_minutes") {
      if (seen.has(key)) { out.scanProblems.push("nightwatch.scan_every_minutes is set more than once; 30 used"); out.scanEveryMinutes = DEFAULT_SCAN_EVERY_MINUTES; dupScan = true; continue; }
      seen.add(key);
      if (dupScan) continue;
      if (kids.length > 0) { out.scanProblems.push(`nightwatch.scan_every_minutes: has indented lines under it; ${DEFAULT_SCAN_EVERY_MINUTES} used`); continue; }
      if (!/^[1-9]\d*$/.test(inline) || Number(inline) < SCAN_MIN || Number(inline) > SCAN_MAX) {
        out.scanProblems.push(`nightwatch.scan_every_minutes: "${inline}" is not a whole number from ${SCAN_MIN} to ${SCAN_MAX}; ${DEFAULT_SCAN_EVERY_MINUTES} used`);
      } else out.scanEveryMinutes = Number(inline);
      continue;
    }
    if (seen.has(key)) bad(`${key} is set more than once`);
    seen.add(key);
    if (/^[[{]/.test(inline)) { bad(`${key}: flow syntax ([...] or {...}) is not supported`); continue; }
    if (key === "protected_paths") {
      if (inline !== "") { bad("protected_paths must be a list, one '- path' per line"); continue; }
      const items = kids.map((x) => /^\s+-\s+(.+)$/.exec(x)?.[1]);
      if (items.length === 0 || items.some((x) => x === undefined)) { bad("protected_paths must hold at least one '- path' line and nothing else (remove the key to use the defaults)"); continue; }
      out.protectedPaths = items.map((x) => unquote(stripComment(x as string)));
    } else if (key === "budgets") {
      if (inline !== "") { bad("budgets must be a block of 'phase: minutes' lines"); continue; }
      if (kids.length === 0) { bad("budgets must hold at least one 'phase: minutes' line (remove the key to use the defaults)"); continue; }
      const bseen = new Set<string>();
      for (const kid of kids) {
        const b = /^\s+([A-Za-z_]+):\s*(.*)$/.exec(kid);
        if (!b) { bad(`budgets line "${kid.trim()}" is not "phase: minutes"`); continue; }
        const [, name, rawV] = b;
        const raw = stripComment(rawV);
        if (!(PHASES as readonly string[]).includes(name)) { bad(`budgets.${name} is not a phase (building, review, merge)`); continue; }
        if (bseen.has(name)) bad(`budgets.${name} is set more than once`);
        bseen.add(name);
        if (!/^[1-9]\d*$/.test(raw)) { bad(`budgets.${name}: "${raw}" is not a positive whole number of minutes`); continue; }
        out.budgets[name as Phase] = Number(raw);
      }
    } else {
      bad(`unknown guardrail key "${key}" (protected_paths, budgets, scan_every_minutes)`);
    }
  }
  return out;
}

/** The scan interval in force and why it fell back, if it did. The same rule the scheduler's own reader applies. */
export function parseScanInterval(text: string): { minutes: number; problems: string[] } {
  const g = readGuardrails(text);
  return { minutes: g.scanEveryMinutes, problems: g.scanProblems };
}

/** The policy is read from main, never from the branch or the working tree. Unreadable = not ok (fail closed). */
export function readMainConfig(git: Git, repo: string): MainConfig {
  let text: string;
  try { text = git(repo, ["show", "main:.digismith/config.yml"]); } catch (e) {
    return { ok: false, error: `cannot read .digismith/config.yml from main: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}` };
  }
  return { ok: true, guardrails: readGuardrails(text) };
}
