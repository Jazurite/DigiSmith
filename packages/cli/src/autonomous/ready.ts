import type { LoTask } from "./types.ts";

export const TYPE_TASK = 0;
export const TYPE_BUG = 1022;

export interface ReadyCtx { repo: string; fileExists: (path: string) => boolean }

export const REASON = {
  specPlan: "no spec and plan on the ticket (an attachment named design.* or spec.* and one named plan.*, or a linked board folder with design.* and plan.md on main)",
  blocked: (keys: string[]) => `blocked by open ticket(s): ${keys.join(", ")}`,
  mode: "Mode is Manual",
} as const;

function hasSpecPlan(t: LoTask, ctx: ReadyCtx): boolean {
  const spec = t.attachments.some((a) => /^(design|spec)\./i.test(a));
  const plan = t.attachments.some((a) => /^plan\./i.test(a));
  if (spec && plan) return true;
  for (const m of t.text.matchAll(/\.digismith\/board\/([A-Z]+-\d+—[^\s/)]+)/g)) {
    const dir = `${ctx.repo}/.digismith/board/${m[1]}/`;
    if (ctx.fileExists(`${dir}plan.md`)
      && ["design.md", "design.html", "spec.md"].some((f) => ctx.fileExists(dir + f))) return true;
  }
  return false;
}

export function checkReady(t: LoTask, ctx: ReadyCtx): string[] {
  const out: string[] = [];
  if (!hasSpecPlan(t, ctx)) out.push(REASON.specPlan);
  const open = t.blockers.filter((b) => !b.done).map((b) => b.key);
  if (open.length > 0) out.push(REASON.blocked(open));
  if (t.mode === "Manual") out.push(REASON.mode);
  return out;
}
