import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_LIMITS, DEFAULT_STALE_MINUTES, KINDS, type Limits } from "../run/limit.ts";
import type { Git } from "./gitx.ts";

const PHASES = ["building", "review", "merge"] as const;
type Phase = (typeof PHASES)[number];
/** The scan interval is a setting, not a guardrail: its problems go to scanProblems and never stop the scan or the merge gate. */
export const DEFAULT_SCAN_EVERY_MINUTES = 30;
const SCAN_MIN = 5;
const SCAN_MAX = 720; // the scheduler's own limits (validateJobs: everyMinutes)
export interface Guardrails { protectedPaths: string[] | null; budgets: Partial<Record<Phase, number>>; problems: string[]; scanEveryMinutes: number; scanProblems: string[]; limits: Limits; staleAfterMinutes: number; limitProblems: string[] }
export type MainConfig = { ok: true; guardrails: Guardrails } | { ok: false; error: string };

const SIGNIFICANT = /^\s*[^#\s]/;
const indentOf = (l: string): number => l.length - l.trimStart().length;
const stripComment = (v: string): string => v.replace(/\s+#.*$/, "").trim();
const unquote = (v: string): string => (/^(["']).*\1$/.test(v) ? v.slice(1, -1) : v);

/** Reads only the nightwatch: block. Every problem inside it is a guardrail problem; nothing outside it is read. */
export function readGuardrails(text: string): Guardrails {
  const out: Guardrails = { protectedPaths: null, budgets: {}, problems: [], scanEveryMinutes: DEFAULT_SCAN_EVERY_MINUTES, scanProblems: [], limits: { ...DEFAULT_LIMITS }, staleAfterMinutes: DEFAULT_STALE_MINUTES, limitProblems: [] };
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
      if (seen.has(key)) {
        // the duplicate is the one reason reported, whatever the first value was (the scheduler's reader does the same)
        if (!dupScan) out.scanProblems = [`nightwatch.scan_every_minutes: is set more than once; ${DEFAULT_SCAN_EVERY_MINUTES} used`];
        out.scanEveryMinutes = DEFAULT_SCAN_EVERY_MINUTES; dupScan = true; continue;
      }
      seen.add(key);
      if (dupScan) continue;
      if (kids.length > 0) { out.scanProblems.push(`nightwatch.scan_every_minutes: has indented lines under it; ${DEFAULT_SCAN_EVERY_MINUTES} used`); continue; }
      if (!/^[1-9]\d*$/.test(inline) || Number(inline) < SCAN_MIN || Number(inline) > SCAN_MAX) {
        out.scanProblems.push(`nightwatch.scan_every_minutes: "${inline}" is not a whole number from ${SCAN_MIN} to ${SCAN_MAX}; ${DEFAULT_SCAN_EVERY_MINUTES} used`);
      } else out.scanEveryMinutes = Number(inline);
      continue;
    }
    if (key === "stale_after_minutes") {
      if (seen.has(key)) { out.limitProblems.push(`nightwatch.stale_after_minutes: is set more than once; ${DEFAULT_STALE_MINUTES} used`); out.staleAfterMinutes = DEFAULT_STALE_MINUTES; continue; }
      seen.add(key);
      if (kids.length > 0 || !/^[1-9]\d*$/.test(inline) || Number(inline) > 1440) out.limitProblems.push(`nightwatch.stale_after_minutes: "${inline}" is not a whole number from 1 to 1440; ${DEFAULT_STALE_MINUTES} used`);
      else out.staleAfterMinutes = Number(inline);
      continue;
    }
    if (key === "limits") {
      if (seen.has(key)) { out.limitProblems.push("nightwatch.limits: is set more than once; the first block is used"); continue; }
      seen.add(key);
      if (inline !== "" || kids.length === 0) { out.limitProblems.push("nightwatch.limits: must be a block of 'kind: number' lines; defaults used"); continue; }
      const lseen = new Set<string>();
      for (const kid of kids) {
        const m2 = /^\s+([A-Za-z_]+):\s*(.*)$/.exec(kid);
        if (!m2) { out.limitProblems.push(`nightwatch.limits: line "${kid.trim()}" is not "kind: number"`); continue; }
        const [, kind, rawV] = m2;
        const raw = stripComment(rawV);
        if (!(KINDS as readonly string[]).includes(kind)) { out.limitProblems.push(`nightwatch.limits.${kind} is not a kind (builder, reviewer, role)`); continue; }
        if (lseen.has(kind)) { out.limitProblems.push(`nightwatch.limits.${kind} is set more than once; the first value is used`); continue; }
        lseen.add(kind);
        if (!/^[0-9]$/.test(raw)) { out.limitProblems.push(`nightwatch.limits.${kind}: "${raw}" is not a whole number from 0 to 9; ${DEFAULT_LIMITS[kind as keyof Limits]} used`); continue; }
        out.limits[kind as keyof Limits] = Number(raw);
      }
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
      bad(`unknown guardrail key "${key}" (protected_paths, budgets, scan_every_minutes, limits, stale_after_minutes)`);
    }
  }
  return out;
}

/** The scan interval in force and why it fell back, if it did. The same rule the scheduler's own reader applies. */
export function parseScanInterval(text: string): { minutes: number; problems: string[] } {
  const g = readGuardrails(text);
  return { minutes: g.scanEveryMinutes, problems: g.scanProblems };
}

/** The scan interval in force for the config in `cwd` (the working file, like the budgets). No file or no key: 30, no problem; an unreadable file is a problem. */
export function readScanIntervalFile(cwd: string): { minutes: number; problems: string[] } {
  let text: string;
  try { text = readFileSync(join(cwd, ".digismith", "config.yml"), "utf-8"); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { minutes: DEFAULT_SCAN_EVERY_MINUTES, problems: [] };
    return { minutes: DEFAULT_SCAN_EVERY_MINUTES, problems: [`nightwatch.scan_every_minutes: .digismith/config.yml cannot be read; ${DEFAULT_SCAN_EVERY_MINUTES} used`] };
  }
  return parseScanInterval(text);
}

/** The limits in force for the config in `cwd` (the working file). No file or no keys: defaults, no problem; an unreadable file is a problem. */
export function readLimitsFile(cwd: string): { limits: Limits; staleAfterMinutes: number; problems: string[] } {
  let text: string;
  try { text = readFileSync(join(cwd, ".digismith", "config.yml"), "utf-8"); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { limits: { ...DEFAULT_LIMITS }, staleAfterMinutes: DEFAULT_STALE_MINUTES, problems: [] };
    return { limits: { ...DEFAULT_LIMITS }, staleAfterMinutes: DEFAULT_STALE_MINUTES, problems: ["nightwatch.limits: .digismith/config.yml cannot be read; defaults used"] };
  }
  const g = readGuardrails(text);
  return { limits: g.limits, staleAfterMinutes: g.staleAfterMinutes, problems: g.limitProblems };
}

/** The policy is read from main, never from the branch or the working tree. Unreadable = not ok (fail closed). */
export function readMainConfig(git: Git, repo: string): MainConfig {
  let text: string;
  try { text = git(repo, ["show", "main:.digismith/config.yml"]); } catch (e) {
    return { ok: false, error: `cannot read .digismith/config.yml from main: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}` };
  }
  return { ok: true, guardrails: readGuardrails(text) };
}
