import type { EventLine } from "../run/events.ts";
import type { RunRecord } from "../run/record.ts";
import { summarize } from "../run/read.ts";

export type Pane = "present" | "gone" | "unknown";
export type State = "healthy" | "blocked" | "stalled" | "lost" | "ended";
export type CauseClass = "transient" | "durable" | "unknown";
export interface Budgets { building: number; review: number; merge: number } // minutes
export interface Verdict { state: State; cause: string; since: string } // since: ISO UTC; "" when healthy or ended

export const SILENCE_MS = 30 * 60_000;
export const DEFAULT_BUDGETS: Budgets = { building: 45, review: 60, merge: 20 };
/** DGS-589: herdr agent_status values that mean the permission prompt is no longer waiting (answered or denied). Anything else keeps the run blocked. */
export const ANSWERED_STATUSES: readonly string[] = ["idle", "done", "working"];
/** A prompt younger than this is never called answered: herdr may lag behind the Notification hook. */
export const PROMPT_GRACE_MS = 60_000;

type Phase = "building" | "review" | "merge";
const PHASES: readonly string[] = ["building", "review", "merge"];

const ms = (iso: string): number => Date.parse(iso);

/** The phase and when it started, from the events; null when the run has no phase (scout, other). */
export function phaseOf(run: RunRecord, events: EventLine[]): { phase: Phase; since: string } | null {
  let phase: Phase | null = null;
  let since = "";
  const started = events.find((e) => e.type === "started");
  if (run.role === "builder") { phase = "building"; since = started?.ts ?? run.created_at; }
  else if (run.role === "reviewer") { phase = "review"; since = started?.ts ?? run.created_at; }
  // A builder's review_ready pauses the building clock (it waits for the Reviewer); the next tool restarts it.
  let waitingForTool = false;
  for (const e of events) {
    if (e.type === "phase" && typeof e.data.phase === "string" && PHASES.includes(e.data.phase)) {
      phase = e.data.phase as Phase; since = e.ts; waitingForTool = false;
    } else if (e.type === "merged" && phase === "merge") {
      phase = null;
    } else if (e.type === "review_ready" && run.role === "builder") {
      phase = null; waitingForTool = true;
    } else if (e.type === "tool" && waitingForTool) {
      phase = "building"; since = e.ts; waitingForTool = false;
    }
  }
  return phase ? { phase, since } : null;
}

/** DGS-598: only these roles are classified blocked, stalled or lost. Maestro, conductor and other runs are listed, never flagged. */
export const WATCHED_ROLES: readonly string[] = ["builder", "reviewer", "scout"];
export const isWatched = (role: string): boolean => WATCHED_ROLES.includes(role);

export function classify(run: RunRecord, events: EventLine[], pane: Pane, now: number, budgets: Budgets, agentStatus: string | null = null): Verdict {
  // /clear writes ended then started: the run is over only when no started follows the last ended.
  if (summarize(events).ended) return { state: "ended", cause: "", since: "" };
  if (!isWatched(run.role)) return { state: "healthy", cause: "", since: "" };
  const last = events.length ? events[events.length - 1] : null;
  const lastTs = last ? ms(last.ts) : ms(run.created_at);
  if (pane === "gone") return { state: "lost", cause: "pane-gone", since: last?.ts ?? run.created_at };

  let lastBlocked = -1;
  let answered = false;
  // Only a permission prompt waits for an answer; idle_prompt and the other kinds fall to the silence and phase rules.
  for (let i = events.length - 1; i >= 0; i--) if (events[i].type === "blocked" && events[i].data.kind === "permission_prompt") { lastBlocked = i; break; }
  if (lastBlocked >= 0 && !events.slice(lastBlocked + 1).some((e) => e.type === "tool" || e.type === "turn_end")) {
    // A denial writes no event, so herdr's status for the pane is the only sign. Unsure means still blocked.
    answered = agentStatus !== null && ANSWERED_STATUSES.includes(agentStatus) && now - ms(events[lastBlocked].ts) >= PROMPT_GRACE_MS;
    if (!answered) return { state: "blocked", cause: "waiting-for-answer", since: events[lastBlocked].ts };
  }

  if (now - lastTs >= SILENCE_MS) return { state: "lost", cause: "silent-30-min", since: last?.ts ?? run.created_at };

  const p = phaseOf(run, events);
  if (p && now - ms(p.since) > budgets[p.phase] * 60_000) {
    return { state: "stalled", cause: `${p.phase}-over-${budgets[p.phase]}-min`, since: p.since };
  }
  // Healthy only because herdr answered the prompt: the caller keeps that episode closed (DGS-589).
  if (answered) return { state: "healthy", cause: "prompt-answered", since: events[lastBlocked].ts };
  return { state: "healthy", cause: "", since: "" };
}

/** Only a transient failure or a lost run is retry-eligible; decideRetry only records eligibility (the attention item gets retryEligible). Nothing retries in DGS-583; DGS-588 supplies the retriesUsed count. */
export function decideRetry(kind: string, causeClass: CauseClass, retriesUsed: number): "retry" | "attention" {
  if (retriesUsed > 0) return "attention";
  return (kind === "failed" && causeClass === "transient") || kind === "lost" ? "retry" : "attention";
}
