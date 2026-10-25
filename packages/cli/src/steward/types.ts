export const STATUSES = [
  "backlog", "concept", "discovery", "refinement", "scheduled", "to do", "claimed", "in progress", "review",
  "acceptance", "release", "done", "documented", "discarded", "Closed",
] as const;
export type Status = (typeof STATUSES)[number];

export const EVENTS = [
  "filed", "concept-started", "discovery-started", "refinement-started", "approved", "started",
  "review-started", "merged", "verified", "accepted", "release-started", "released", "documented",
  "discard", "close",
] as const;
export type EventName = (typeof EVENTS)[number];

/** Events that carry Jack's own answer: refused without --quote. */
export const GATE_EVENTS: readonly EventName[] = ["approved", "accepted", "discard", "close"];

/** Statuses a ticket has left for good: discard and close do not apply to them. */
export const FINISHED: readonly string[] = ["done", "documented", "discarded", "Closed"];

export type Signoff = "Auto" | "Jack" | null;

export interface Config {
  releaseStage: boolean;
}

export interface TicketView {
  status: string;
  signoff: Signoff;
  mergedRecorded: boolean;
  acceptedYes: boolean;
}

/** Where Jack's approval can send a refined ticket. */
export const APPROVE_TARGETS = ["to do", "scheduled"] as const;
export type ApproveTarget = (typeof APPROVE_TARGETS)[number];

export interface EventInput {
  event: EventName;
  answer?: "yes" | "no";
  quote?: string;
  by?: string;
  sha?: string;
  /** approved only: the starter status; default "to do". */
  into?: ApproveTarget;
}

export interface Move {
  kind: "move";
  to: Status;
  startDate?: boolean;
  dueDate?: boolean;
  recordMerge?: boolean;
  comment?: string;
}

export type RuleResult =
  | Move
  | { kind: "record"; recordMerge: true }
  | { kind: "noop" }
  | { kind: "refuse"; reason: string };
