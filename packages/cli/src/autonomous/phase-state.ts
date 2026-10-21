import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PHASES, TICKET_RE, type Phase, type TicketState } from "./phase-types.ts";

const lockPath = (dir: string) => join(dir, "lock.json");
export type StateRead = { kind: "none" } | { kind: "corrupt" } | { kind: "ok"; state: TicketState };

function parseRaw(dir: string): Record<string, unknown> | null {
  try {
    const raw = JSON.parse(readFileSync(lockPath(dir), "utf8"));
    return raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function readPhaseState(dir: string): StateRead {
  if (!existsSync(lockPath(dir))) return { kind: "none" };
  const raw = parseRaw(dir);
  if (raw === null || typeof raw.ticket !== "string" || !TICKET_RE.test(raw.ticket) || typeof raw.claimedAt !== "string") return { kind: "corrupt" };
  // An absent field takes its default; a present but invalid field makes the lock corrupt.
  if (raw.phase !== undefined && !PHASES.includes(raw.phase as Phase)) return { kind: "corrupt" };
  if (raw.phaseStartedAt !== undefined && typeof raw.phaseStartedAt !== "string") return { kind: "corrupt" };
  if (raw.attempt !== undefined && !(typeof raw.attempt === "number" && Number.isInteger(raw.attempt) && raw.attempt >= 1)) return { kind: "corrupt" };
  if (raw.runs !== undefined && (raw.runs === null || typeof raw.runs !== "object" || Array.isArray(raw.runs))) return { kind: "corrupt" };
  const runs = (raw.runs ?? {}) as { builder?: unknown };
  if (runs.builder !== undefined && runs.builder !== null && typeof runs.builder !== "string") return { kind: "corrupt" };
  return { kind: "ok", state: {
    ticket: raw.ticket,
    claimedAt: raw.claimedAt,
    phase: raw.phase === undefined ? "claimed" : (raw.phase as Phase),
    phaseStartedAt: raw.phaseStartedAt === undefined ? raw.claimedAt : (raw.phaseStartedAt as string),
    attempt: raw.attempt === undefined ? 1 : (raw.attempt as number),
    runs: { builder: typeof runs.builder === "string" ? runs.builder : null },
  } };
}

export function writePhaseState(dir: string, patch: Partial<Pick<TicketState, "phase" | "phaseStartedAt" | "attempt" | "runs">>): void {
  const raw = parseRaw(dir);
  if (raw === null) throw new Error("lock.json is missing or corrupt");
  const tmp = `${lockPath(dir)}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify({ ...raw, ...patch }));
    renameSync(tmp, lockPath(dir));
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}
