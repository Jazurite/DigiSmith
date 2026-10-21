export const OFFSET_MS = 7 * 3600_000;
export function inNightWindow(now: Date): boolean { const h = new Date(now.getTime() + OFFSET_MS).getUTCHours(); return h >= 23 || h < 6; }
export const dayOf = (now: Date): string => new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);          // UTC+7 date
export const stampOf = (now: Date): string => new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 16).replace("T", "-").replace(":", "");   // "2026-10-19-1432"
export function fmtUtc7(now: Date): string { return new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 19).replace("T", " "); }
export function nextClock(now: Date, hhmm: string): Date {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new Error(`"${hhmm}" is not HH:MM`);
  const local = new Date(now.getTime() + OFFSET_MS);
  const cand = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), Number(m[1]), Number(m[2])) - OFFSET_MS;
  return new Date(cand > now.getTime() ? cand : cand + 24 * 3600_000);
}
