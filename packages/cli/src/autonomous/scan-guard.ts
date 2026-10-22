import { blockerProblem, mergedOnMain } from "./already-done.ts";
import type { Git } from "./gitx.ts";
import { readMainConfig } from "./guardrails.ts";
import type { LoTask } from "./types.ts";

export interface ScanGuard {
  guardrailProblems(): string[];
  alreadyDone(t: LoTask): { reason: string; attention?: string } | null;
}

export function makeScanGuard(git: Git, repo: string): ScanGuard {
  let fetched: string | null | undefined; // undefined: not yet, null: ok, string: the failure
  const fetchOnce = (): string | null => {
    if (fetched === undefined) {
      try { git(repo, ["fetch", "origin", "main"]); fetched = null; } catch (e) { fetched = (e as Error).message.split("\n")[0]; }
    }
    return fetched;
  };
  return {
    guardrailProblems() {
      const c = readMainConfig(git, repo);
      return c.ok ? c.guardrails.problems : [c.error];
    },
    alreadyDone(t) {
      const key = t.key ?? t.id;
      const f = fetchOnce();
      if (f !== null) return { reason: `cannot check origin/main: ${f}` };
      try {
        const hit = mergedOnMain(git, repo, key);
        if (hit !== null) return { reason: `already-merged: ${hit}`, attention: "already-merged-but-open" };
        for (const b of t.blockers.filter((x) => x.done)) {
          const p = blockerProblem(git, repo, b.key);
          if (p !== null) return { reason: p };
        }
      } catch (e) {
        return { reason: `cannot check origin/main: ${(e as Error).message.split("\n")[0]}` };
      }
      return null;
    },
  };
}
