// packages/cli/src/oculus/types.ts
import type { Role } from "../run/schema.ts";
import type { RowTokens } from "./tokens.ts";
export type Health = "healthy" | "blocked" | "stalled" | "lost" | "ended";
export type Trigger = "manual" | "night-scan" | "away" | "auto";
export type EventGroup = "agent" | "system" | "errors";
export type RunPhase = "building" | "review" | "merge";
export type TicketPhase = "claimed" | "building" | "review" | "merge-ready" | "merged" | "released" | "lost";
export type Scalar = string | number | boolean | null;

export interface RunRowView {
  run: string; ticket: string | null; role: Role;
  project: string | null; source: "auto" | "start";
  seat: string | null; model: string | null; trigger: Trigger; state: Health; phase: RunPhase | null; phaseSince: string | null;
  startedAt: string; endedAt: string | null; elapsedSec: number; events: number; merged: boolean; pushed: boolean;
  tokens: RowTokens | null; tokensAsOf: string | null;
}
export interface EventRowView { n: number; seq: number; ts: string; type: string; groups: EventGroup[]; data: Record<string, Scalar> }
export interface PipelineStep { step: "claimed" | "worktree-ready" | "building" | "review" | "merged" | "pushed"; at: string | null; state: "done" | "current" | "waiting" | "lost"; durationSec: number | null }
export interface PhaseRow { phase: TicketPhase; count: number; oldestSince: string | null }
export interface PlanTask { n: number; title: string; state: "done" | "fix-round" | "waiting"; round: number | null }
