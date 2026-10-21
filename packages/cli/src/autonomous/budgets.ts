import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_BUDGETS, type Budgets } from "./watchdog.ts";

const KEYS = ["building", "review", "merge"] as const;
const SIGNIFICANT = /^\s*[^#\s]/; // not blank, not a comment line
const indentOf = (l: string): number => l.length - l.trimStart().length;

/** Reads nightwatch.budgets from .digismith/config.yml. A duplicate key: the last value wins, with one problem. */
export function readBudgets(cwd: string): { budgets: Budgets; problems: string[] } {
  const budgets: Budgets = { ...DEFAULT_BUDGETS };
  const problems: string[] = [];
  let text: string;
  try { text = readFileSync(join(cwd, ".digismith", "config.yml"), "utf-8"); } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") problems.push("nightwatch.budgets: .digismith/config.yml cannot be read; defaults used");
    return { budgets, problems };
  }
  const lines = text.split(/\r?\n/);
  const nw = lines.findIndex((l) => /^nightwatch:\s*(#.*)?$/.test(l));
  if (nw < 0) return { budgets, problems };

  // The direct children of nightwatch: share the indent of the first significant line under it.
  // A budgets line at that indent is the block; deeper lines belong to another key and are skipped.
  let childIndent = -1;
  let found = -1;
  for (let i = nw + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!SIGNIFICANT.test(l)) continue;
    const ind = indentOf(l);
    if (ind === 0) break;
    if (childIndent < 0) childIndent = ind;
    if (ind === childIndent && /^\s*budgets:\s*(#.*)?$/.test(l)) { found = i; break; }
  }
  if (found < 0) return { budgets, problems };

  const seen = new Set<string>();
  for (let i = found + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!SIGNIFICANT.test(l)) continue;
    if (indentOf(l) <= childIndent) break;
    const m = /^\s+([A-Za-z_]+):[ \t]*([^#\r\n]*?)[ \t]*(#.*)?$/.exec(l);
    if (!m) { problems.push(`nightwatch.budgets: line "${l.trim()}" is not "key: minutes"; defaults kept`); continue; }
    const [, key, raw] = m;
    if (!(KEYS as readonly string[]).includes(key)) { problems.push(`nightwatch.budgets.${key}: not a phase (building, review, merge); ignored`); continue; }
    if (seen.has(key)) problems.push(`nightwatch.budgets.${key}: set more than once; the last value is used`);
    seen.add(key);
    if (!/^[1-9]\d*$/.test(raw)) { problems.push(`nightwatch.budgets.${key}: "${raw}" is not a positive whole number of minutes; default ${DEFAULT_BUDGETS[key as keyof Budgets]} used`); continue; }
    budgets[key as keyof Budgets] = Number(raw);
  }
  return { budgets, problems };
}
