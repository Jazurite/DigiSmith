export interface LoTask {
  id: string; key: string | null; name: string; typeId: number;
  priority: number | null;      // 1 urgent .. 4 low, null none
  due: number | null;           // ms
  created: number;              // ms
  attachments: string[];        // titles
  text: string;
  signOff: "Auto" | "Jack" | null;
  mode: "Autonomous" | "Manual" | null;
  scheduledAt: number | null | "invalid";   // "Scheduled at", ms
  milestone: string | null;
  blockers: { key: string; done: boolean }[];
}
export interface Tracker {
  hasStatus(name: string): Promise<boolean>;
  /**
   * Tickets whose status equals name (any case), whole space, any type.
   * Only a ticket with Mode Autonomous is read in full. Any other ticket is a light read from the
   * search alone: attachments as the search gives them (often none), milestone null, blockers empty.
   * Do not judge Definition of Ready on a light ticket; its mode, scheduledAt, sign-off and key are exact.
   */
  listByStatus(name: string): Promise<LoTask[]>;
  setStatus(taskId: string, status: string): Promise<void>;
  getStatus(taskId: string): Promise<string>;
  comment(ref: string, text: string): Promise<void>;   // ref = task id or key
}
export type EventKind = "scan" | "off" | "busy" | "skip" | "claim" | "claim-failed" | "no-starter-status" | "release" | "comment-failed" | "run-now" | "away-on" | "away-off" | "away-expired" | "breaker" | "guardrail-config" | "conductor-config" | "schedule-move" | "schedule-move-failed";
export interface Event { ts: string; tsUtc7: string; kind: EventKind; [k: string]: unknown }
export interface Lock { ticket: string; taskId: string; claimedAt: string; claimedAtUtc7: string; order: string; scanId: string; phase?: string; phaseStartedAt?: string; attempt?: number; runs?: { builder: string | null } }
export interface Away { away: boolean; since: string; until: string | null; endedAt: string | null }
