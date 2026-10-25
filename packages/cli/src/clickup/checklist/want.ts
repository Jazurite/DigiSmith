import type { DoneState, PlanTask } from "./plan.ts";

/** One item the checklist should have. `parentKey` is set for the three children of a task item. */
export interface WantItem {
  key: string;
  name: string;
  resolved: boolean;
  parentKey?: string;
}

const CHILDREN = [
  ["implement", "Implement"],
  ["review", "Review"],
  ["fix", "Fix"],
] as const;

/** The whole wanted checklist, in order: each task with Implement, Review, Fix; then Whole-branch review and fixes. */
export function wantedItems(plan: PlanTask[], done: DoneState): WantItem[] {
  const out: WantItem[] = [];
  for (const t of plan) {
    const kids = CHILDREN.map(([part, name]): WantItem => {
      const key = `${t.n}.${part}`;
      return { key, name: done.noneNeeded.has(key) ? `${name} (none needed)` : name, resolved: done.keys.has(key), parentKey: String(t.n) };
    });
    out.push({ key: String(t.n), name: t.name, resolved: done.keys.has(String(t.n)) || kids.every((k) => k.resolved) }, ...kids);
  }
  out.push({ key: "final.review", name: "Whole-branch review", resolved: done.keys.has("final.review") });
  out.push({
    key: "final.fix",
    name: done.noneNeeded.has("final.fix") ? "Whole-branch fixes (none needed)" : "Whole-branch fixes",
    resolved: done.keys.has("final.fix"),
  });
  return out;
}

/** Done keys whose task number is not in the plan, sorted. */
export function keysOutsidePlan(plan: PlanTask[], done: DoneState): string[] {
  const inPlan = new Set(plan.map((t) => String(t.n)));
  return [...done.keys].filter((k) => !k.startsWith("final.") && !inPlan.has(k.split(".")[0])).sort();
}
