import { mergedOnMain, readMainLog } from "./already-done.ts";
import type { Git } from "./gitx.ts";
import type { Tracker } from "./types.ts";

export interface Claimed { ticket: string; taskId: string }
/** `status` null = the status could not be read. */
/** `gitOk` false = the git facts could not be read; mergedSha and branchEmpty are then meaningless. */
export interface DriftFacts { status: string | null; mergedSha: string | null; branchEmpty: boolean; gitOk: boolean }
const DONE = new Set(["complete", "done", "closed"]);

export function driftLines(claimed: Claimed[], facts: Map<string, DriftFacts>): string[] {
  const out: string[] = [];
  for (const c of claimed) {
    const f = facts.get(c.ticket);
    if (!f) continue;
    if (f.status === null) out.push(`${c.ticket}: status unreadable`);
    if (!f.gitOk) { out.push(`${c.ticket}: git facts unreadable`); continue; }
    if (f.status === null) continue;
    if (DONE.has(f.status.toLowerCase()) && f.mergedSha === null) out.push(`${c.ticket}: done in ClickUp, nothing on main`);
    else if (!DONE.has(f.status.toLowerCase()) && f.mergedSha !== null) out.push(`${c.ticket}: ${f.status} in ClickUp, merged on main (${f.mergedSha})`);
    if (f.branchEmpty) out.push(`${c.ticket}: branch has no commits`);
  }
  return out;
}

export async function gatherDrift(d: { tracker: Tracker; git: Git; repo: string }, claimed: Claimed[]): Promise<Map<string, DriftFacts>> {
  const facts = new Map<string, DriftFacts>();
  let log: ReturnType<typeof readMainLog> | null = null;
  let logFailed = false;
  for (const c of claimed) {
    let status: string | null = null;
    try { status = await d.tracker.getStatus(c.taskId); } catch { /* shown as unreadable */ }
    let mergedSha: string | null = null;
    let branchEmpty = false;
    let gitOk = true;
    try {
      if (!log && !logFailed) {
        try { log = readMainLog(d.git, d.repo); } catch (e) { logFailed = true; throw e; }
      }
      if (!log) throw new Error("main log unreadable");
      mergedSha = mergedOnMain(d.git, d.repo, c.ticket, log);
      const branches = d.git(d.repo, ["branch", "--list", `${c.ticket}__*`, "--format=%(refname:short)"]).split("\n").map((s) => s.trim()).filter(Boolean);
      branchEmpty = branches.length === 1 && mergedSha === null
        && Number(d.git(d.repo, ["rev-list", "--count", `main..${branches[0]}`]).trim()) === 0;
    } catch {
      gitOk = false; // shown as a line, never hidden
      mergedSha = null;
      branchEmpty = false;
    }
    facts.set(c.ticket, { status, mergedSha, branchEmpty, gitOk });
  }
  return facts;
}
