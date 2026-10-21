// packages/cli/src/nightwatch/types.ts
export type Health = "healthy" | "blocked" | "stalled" | "lost" | "ended";
export type Trigger = "manual" | "night-scan" | "away" | "unknown";
export type EventGroup = "agent" | "system" | "errors";
export type RunPhase = "building" | "review" | "merge";
export type TicketPhase = "claimed" | "building" | "review" | "merge-ready" | "merged" | "released" | "lost";
export type Scalar = string | number | boolean | null;

export interface RunRowView {
  run: string; ticket: string; role: "builder" | "reviewer" | "scout" | "other";
  seat: string | null; model: string | null; trigger: Trigger; state: Health; phase: RunPhase | null;
  startedAt: string; endedAt: string | null; elapsedSec: number; events: number; merged: boolean; pushed: boolean;
}
export interface EventRowView { n: number; seq: number; ts: string; type: string; groups: EventGroup[]; data: Record<string, Scalar> }
export interface PipelineStep { step: "claimed" | "worktree-ready" | "building" | "review" | "merged" | "pushed"; at: string | null; state: "done" | "current" | "waiting" | "lost" }
export interface PhaseRow { phase: TicketPhase; count: number; oldestSince: string | null }
export interface PlanTask { n: number; title: string; state: "done" | "fix-round" | "waiting"; round: number | null }
