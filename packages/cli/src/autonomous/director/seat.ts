export interface SeatReading {
  seat: string;
  fiveHourUsed: number | null;
  weeklyUsed: number | null;
  weeklyResetsAt: number | null;   // ms
  exhaustedUntil: number | null;   // ms
  workers: number;
  lastAssigned: number | null;     // ms
  carriesMaestro: boolean;
}

/** One constant, Jack changes it (runbook: "as long as its 5h window has room"). */
export const SOONEST_RESET_MAX_FIVE_HOUR_USED = 70;
const SOON_MS = 24 * 3600_000;
const MAESTRO_FIVE_HOUR_LIMIT = 40;

/** The runbook rule "The rule" and "Reading usage" as a pure function. Headroom is 100 - used. */
export function rankSeats(readings: SeatReading[], now: number, opts: { heavy: boolean }): { ranked: string[]; why: string[] } {
  const live = readings.filter((s) => s.exhaustedUntil === null || s.exhaustedUntil <= now);
  if (live.length === 0) return { ranked: [], why: ["all seats exhausted"] };

  const soon = (s: SeatReading): boolean =>
    s.weeklyResetsAt !== null && s.fiveHourUsed !== null && s.weeklyResetsAt > now && s.weeklyResetsAt - now <= SOON_MS && s.fiveHourUsed < SOONEST_RESET_MAX_FIVE_HOUR_USED;
  const behind = (s: SeatReading): boolean => opts.heavy && s.carriesMaestro && s.fiveHourUsed !== null && s.fiveHourUsed > MAESTRO_FIVE_HOUR_LIMIT;
  const headroom = (u: number | null): number | null => (u === null ? null : 100 - u);
  // Total order: more headroom first; an unknown reading sorts after every known one; two unknowns tie, so the next key (workers) decides.
  const more = (a: number | null, b: number | null): number => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : b - a);

  const sorted = [...live].sort((a, b) => {
    if (behind(a) !== behind(b)) return behind(a) ? 1 : -1;
    if (soon(a) !== soon(b)) return soon(a) ? -1 : 1;
    if (soon(a) && soon(b) && a.weeklyResetsAt !== b.weeklyResetsAt) return (a.weeklyResetsAt as number) - (b.weeklyResetsAt as number);
    return more(headroom(a.weeklyUsed), headroom(b.weeklyUsed))
      || more(headroom(a.fiveHourUsed), headroom(b.fiveHourUsed))
      || a.workers - b.workers
      || (a.lastAssigned ?? Number.NEGATIVE_INFINITY) - (b.lastAssigned ?? Number.NEGATIVE_INFINITY)
      || 0;
  });

  const why = sorted.map((s) => {
    const tags: string[] = [];
    if (soon(s)) tags.push(`weekly window resets in ${Math.round(((s.weeklyResetsAt as number) - now) / 3600_000)} h`);
    if (behind(s)) tags.push("carries the Maestro, 5h used above 40 percent: last for a heavy worker");
    tags.push(s.fiveHourUsed === null ? "5h unknown" : `5h used ${s.fiveHourUsed}%`, s.weeklyUsed === null ? "weekly unknown" : `weekly used ${s.weeklyUsed}%`, `${s.workers} worker(s)`);
    return `${s.seat}: ${tags.join(", ")}`;
  });
  return { ranked: sorted.map((s) => s.seat), why };
}
