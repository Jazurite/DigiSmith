import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { depotDir, isSafe } from "../run/paths.ts";
import { writeJsonAtomic } from "./run-count.ts";

export const SEATS_SCHEMA = "oculus-seats/v1";
export interface SeatWindow { used_pct: number; resets_at: string }
export interface SeatReading { seat: string; read_at: string; five_hour: SeatWindow | null; weekly: SeatWindow | null }
export interface SeatsFile { schema: typeof SEATS_SCHEMA; generated_at: string; seats: SeatReading[] }

const OUT = /^out-(.+)\.json$/;

export function probeDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(depotDir(env), "usage-probe");
}

const secs = (v: unknown): string | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? new Date(v * 1000).toISOString() : null);

function windowOf(v: unknown): SeatWindow | null {
  if (typeof v !== "object" || v === null) return null;
  const w = v as Record<string, unknown>;
  const pct = w.used_percentage;
  const at = secs(w.resets_at);
  if (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0 || pct > 100 || at === null) return null;
  return { used_pct: pct, resets_at: at };
}

// Only the seat name, the reading time and the two windows are copied. Nothing else leaves the probe file.
export function readProbeSeats(dir: string): SeatReading[] {
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return []; }
  const out: SeatReading[] = [];
  for (const n of names) {
    const seat = OUT.exec(n)?.[1];
    if (!seat || !isSafe(seat) || seat.startsWith(".")) continue;
    let raw: Record<string, unknown>;
    try { raw = JSON.parse(readFileSync(join(dir, n), "utf8")) as Record<string, unknown>; } catch { continue; }
    const readAt = secs(raw?.at);
    if (readAt === null) continue;
    const rl = (typeof raw.rate_limits === "object" && raw.rate_limits !== null ? raw.rate_limits : {}) as Record<string, unknown>;
    out.push({ seat, read_at: readAt, five_hour: windowOf(rl.five_hour), weekly: windowOf(rl.seven_day) });
  }
  return out.sort((a, b) => a.seat.localeCompare(b.seat));
}

export function writeSeats(dir: string, now: Date): SeatsFile {
  const file: SeatsFile = { schema: SEATS_SCHEMA, generated_at: now.toISOString(), seats: readProbeSeats(dir) };
  writeJsonAtomic(join(dir, "seats.json"), file);
  return file;
}
