/** One plan task: its number and its checklist item name `Task N: <title>`. */
export interface PlanTask {
  n: number;
  name: string;
}

/** Item keys that are done; `noneNeeded` holds the fix keys that read "(none needed)" (always also in `keys`). */
export interface DoneState {
  keys: Set<string>;
  noneNeeded: Set<string>;
}

const TASK_HEADING = /^###\s+Task\s+(\d+):\s*(.*?)\s*$/;
const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;
const DONE_KEY = /^(?:([1-9]\d*)(?:\.(implement|review|fix(:none)?))?|final\.(review|fix(:none)?))$/;
const LEDGER_LINE = /^\s*(?:[-*]\s+)?Task (\d+|final): (implemented|review requested|reviewed|complete|fix round|dispatch fix)\b/;
const LEDGER_FIXED = /^\s*(?:[-*]\s+)?Review (?:task (\d+)|ticket (final)) r\d+: .*-> fixed\b/;

/** Reads `### Task N: <title>` headings outside fenced code blocks, in plan order. Throws on none or on a repeated number. */
export function parsePlanTasks(text: string): PlanTask[] {
  const tasks: PlanTask[] = [];
  let fence: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const f = FENCE.exec(line);
    if (fence === null) {
      if (f) {
        fence = f[1];
        continue;
      }
    } else {
      // A fence closes only on the same character, at least as long, with nothing after it.
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && f[2].trim() === "") fence = null;
      continue;
    }
    const m = TASK_HEADING.exec(line);
    if (!m) continue;
    const n = Number(m[1]);
    if (tasks.some((t) => t.n === n)) throw new Error(`the plan has Task ${n} twice`);
    tasks.push({ n, name: `Task ${n}: ${m[2]}` });
  }
  if (tasks.length === 0) throw new Error('the plan has no "### Task N: <title>" headings');
  return tasks;
}

/** `--done 1.implement,1.fix:none,final.review` as a DoneState. Throws on a key that is not an item key. */
export function parseDoneKeys(value: string): DoneState {
  const done: DoneState = { keys: new Set(), noneNeeded: new Set() };
  for (const part of value.split(",").map((p) => p.trim())) {
    if (part === "") continue;
    const m = DONE_KEY.exec(part);
    if (!m) throw new Error(`--done: "${part}" is not an item key (N, N.implement, N.review, N.fix, N.fix:none, final.review, final.fix, final.fix:none)`);
    const key = part.replace(/:none$/, "");
    done.keys.add(key);
    if (part.endsWith(":none")) done.noneNeeded.add(key);
  }
  return done;
}

/** The item keys an SDD or inline-execution ledger shows as done (rules in the spec's "Ledger to keys"). */
export function parseLedgerDone(text: string): DoneState {
  const seen = new Map<string, Set<string>>();
  const fixed = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = LEDGER_LINE.exec(line);
    if (m) {
      if (!seen.has(m[1])) seen.set(m[1], new Set());
      seen.get(m[1])!.add(m[2]);
    }
    const f = LEDGER_FIXED.exec(line);
    if (f) fixed.add(f[1] ?? f[2]);
  }
  const done: DoneState = { keys: new Set(), noneNeeded: new Set() };
  for (const [id, events] of seen) {
    const complete = events.has("complete");
    if (id === "final") {
      if (events.has("reviewed") || complete) done.keys.add("final.review");
      if (complete) {
        done.keys.add("final.fix");
        if (!events.has("dispatch fix") && !fixed.has("final")) done.noneNeeded.add("final.fix");
      }
      continue;
    }
    if (events.has("implemented") || events.has("review requested") || complete) done.keys.add(`${id}.implement`);
    if (events.has("reviewed") || complete) done.keys.add(`${id}.review`);
    if (complete) {
      done.keys.add(`${id}.fix`);
      if (!events.has("fix round") && !fixed.has(id)) done.noneNeeded.add(`${id}.fix`);
    }
  }
  return done;
}
