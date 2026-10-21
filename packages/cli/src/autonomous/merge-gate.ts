import { appendOpen } from "./attention.ts";
import { classOfCause } from "./causes.ts";
import type { Git } from "./gitx.ts";
import { readMainConfig } from "./guardrails.ts";
import { DEFAULT_PROTECTED, touchedProtected } from "./protected-paths.ts";

export interface GateDeps { git: Git; repo: string; dir: string; now: () => Date }
type Code = "config" | "no-branch" | "no-commits" | "protected-path";
export type GateResult = { go: true } | { go: false; code: Code; reason: string };

const firstLine = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split("\n")[0];

/** Go, or one refusal. The policy is read from main; any check that cannot run is a refusal. */
export function runMergeGate(d: GateDeps, ticket: string): GateResult {
  const refuse = (code: Code, reason: string): GateResult => {
    const iso = d.now().toISOString();
    appendOpen(d.dir, { ticket, run: ticket, kind: "refused", cause: `merge-refused: ${reason}`, causeClass: classOfCause("merge-refused"), retryEligible: false, since: iso, ts: iso });
    return { go: false, code, reason };
  };
  const cfg = readMainConfig(d.git, d.repo);
  if (!cfg.ok) return refuse("config", cfg.error);
  if (cfg.guardrails.problems.length > 0) return refuse("config", cfg.guardrails.problems.join("; "));
  if (!/^[A-Za-z][A-Za-z0-9]*-\d+$/.test(ticket)) return refuse("no-branch", `"${ticket}" is not a ticket key`);
  let branches: string[];
  try {
    branches = d.git(d.repo, ["branch", "--list", `${ticket}__*`, "--format=%(refname:short)"]).split("\n").filter(Boolean);
  } catch (e) { return refuse("no-branch", `cannot list branches: ${firstLine(e)}`); }
  if (branches.length !== 1) return refuse("no-branch", `expected one branch ${ticket}__*, found ${branches.length}`);
  const branch = branches[0];
  try {
    const ahead = Number(d.git(d.repo, ["rev-list", "--count", `main..${branch}`]).trim());
    if (!Number.isInteger(ahead)) return refuse("config", "cannot count the commits ahead of main");
    if (ahead === 0) return refuse("no-commits", `${branch} has 0 commits ahead of main`);
    const files = d.git(d.repo, ["diff", "--name-only", `main...${branch}`]).split("\n").filter(Boolean);
    const hits = touchedProtected(files, cfg.guardrails.protectedPaths ?? DEFAULT_PROTECTED);
    if (hits.length > 0) return refuse("protected-path", `protected path: ${hits.join(", ")}`);
  } catch (e) { return refuse("config", `git failed: ${firstLine(e)}`); }
  return { go: true };
}
