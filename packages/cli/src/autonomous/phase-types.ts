export type Phase = "claimed" | "building" | "review" | "merge-ready" | "merged" | "released";
export const PHASES: Phase[] = ["claimed", "building", "review", "merge-ready", "merged", "released"];
export const MAX_ATTEMPTS = 3;
export const MAX_TRIES = 3;
export const TICKET_RE = /^[A-Z][A-Z0-9]*-\d+$/;
export type Obs<T> = { ok: true; value: T } | { ok: false; error: string };
export type MarkerPhase = "building" | "review" | "merge";
export type InputBox = "empty" | "suggestion" | "typed" | "unknown";
export interface TicketState { ticket: string; claimedAt: string; phase: Phase; phaseStartedAt: string; attempt: number; runs: { builder: string | null }; mergeHead?: string }
export interface RunView { id: string; role: string; createdAt: string; started: boolean; ended: boolean; merged: boolean; pushed: boolean; phaseEvent: MarkerPhase | null }
export interface PackView { round: number; head: string; base: string }
export interface VerdictView { scope: "task" | "ticket"; result: "clean" | "findings"; head: string }
export interface GitView { head: string | null; base: string | null; onOriginMain: boolean }
export interface HerdrView { conductorPresent: boolean; conductorWorking: boolean; input: InputBox; builderPane: "present" | "gone" | "unknown" }
export interface Observations {
  runs: Obs<RunView[]>; packs: Obs<PackView[]>; verdicts: Obs<VerdictView[]>;
  git: Obs<GitView>; tracker: Obs<{ status: string }>; herdr: Obs<HerdrView>;
}
export type SettleResult = "succeeded" | "uncertain" | "retryable" | "permanent";
export type JournalState = "open" | SettleResult;
export type JournalResults = Record<string, JournalState>;
export type Action =
  | { kind: "wait"; reason: string }
  | { kind: "attention"; cause: string; attKind: "unknown" | "failed" }
  | { kind: "move"; to: Phase; proof: string; attempt?: number; builder?: string; head?: string }
  | { kind: "marker"; phase: MarkerPhase; run: string }
  | { kind: "order"; order: "fix" | "merge" | "restart"; head: string }
  | { kind: "status"; status: string };
