import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_BUDGETS, type Budgets } from "./watchdog.ts";

const KEYS = ["building", "review", "merge"] as const;

export function readBudgets(cwd: string): { budgets: Budgets; problems: string[] } {
  const budgets: Budgets = { ...DEFAULT_BUDGETS };
  const problems: string[] = [];
  let text: string;
  try { text = readFileSync(join(cwd, ".digismith", "config.yml"), "utf-8"); } catch { return { budgets, problems }; }
  const lines = text.split(/\r?\n/);
  const nw = lines.findIndex((l) => /^nightwatch:\s*(#.*)?$/.test(l));
  if (nw < 0) return { budgets, problems };
  let i = nw + 1;
  while (i < lines.length && !/^\s+budgets:\s*(#.*)?$/.test(lines[i])) {
    if (/^\S/.test(lines[i])) return { budgets, problems };
    i++;
  }
  for (i++; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(#.*)?$/.test(l)) continue;
    if (!/^\s{4,}\S/.test(l)) break;
    const m = /^\s+([A-Za-z_]+):[ \t]*([^#\r\n]*?)[ \t]*(#.*)?$/.exec(l);
    if (!m) { problems.push(`nightwatch.budgets: line "${l.trim()}" is not "key: minutes"; defaults kept`); continue; }
    const [, key, raw] = m;
    if (!(KEYS as readonly string[]).includes(key)) { problems.push(`nightwatch.budgets.${key}: not a phase (building, review, merge); ignored`); continue; }
    if (!/^[1-9]\d*$/.test(raw)) { problems.push(`nightwatch.budgets.${key}: "${raw}" is not a positive whole number of minutes; default ${DEFAULT_BUDGETS[key as keyof Budgets]} used`); continue; }
    budgets[key as keyof Budgets] = Number(raw);
  }
  return { budgets, problems };
}
