import { createHash } from "node:crypto";
import type { OpenItem } from "../attention.ts";
import type { RefineLock } from "./refine.ts";
import { movesFor, stuckLockMove, type History, type Move } from "./unblock.ts";

export interface PlanWorld {
  items: OpenItem[];
  history: History;
  lockTicket: string | null;
  refineLock: RefineLock | null;
  pendingComments: number;
  now: Date;
  /** the role of a run from its run record, null when unknown (fail closed in the unblock table) */
  roleOf: (run: string) => string | null;
}
/** moves = what the Director must do; shown = moves plus the list-only rows, for the human. */
export interface Plan { moves: Move[]; shown: Move[]; wake: boolean; hash: string }

/**
 * Pure: the same world gives the same plan, the same hash and the same move ids; it records nothing.
 * Hook point for DGS-700: a later express rule adds its moves here.
 * Pending comments are retried by `dg director plan` itself; they do not wake the Director.
 */
export function planLoop(w: PlanWorld): Plan {
  const ctx = { lockTicket: w.lockTicket, refineTicket: w.refineLock?.ticket ?? null, now: w.now, roleOf: w.roleOf };
  const all: Move[] = [];
  const stuck = stuckLockMove(w.refineLock, w.now);
  if (stuck !== null) all.push(stuck);
  const oldestFirst = [...w.items].sort((a, b) => Date.parse(a.since) - Date.parse(b.since) || a.id.localeCompare(b.id));
  for (const it of oldestFirst) all.push(movesFor(it, w.history, ctx));
  const seen = new Set<string>();
  const unique = all.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  const moves = unique.filter((m) => m.kind !== "none" && m.kind !== "list-only");
  const shown = unique.filter((m) => m.kind !== "none");
  const hash = moves.length === 0 ? "" : createHash("sha1").update(moves.map((m) => m.id).join(",")).digest("hex").slice(0, 16);
  return { moves, shown, wake: moves.length > 0, hash };
}
