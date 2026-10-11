/** Jack's timezone (DGS-143). */
const UTC_OFFSET_HOURS = 7;
/** ClickUp stores its own all-day dates at 04:00 local time. */
const ALL_DAY_HOUR = 4;
const HOUR_MS = 3_600_000;

const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

export interface ParsedDate {
  ms: number;
  /** True when the value carried a time: ClickUp then shows the time, not only the day. */
  hasTime: boolean;
}

/** A plain YYYY-MM-DD is that day at 04:00 UTC+7; a value with a time and an offset is sent as it is. */
export function parseDateFlag(value: string, flag: string): ParsedDate {
  const invalid = (why: string) =>
    new Error(`invalid ${flag} "${value}" — ${why}`);
  const dayExists = (y: number, m: number, d: number) => {
    const check = new Date(Date.UTC(y, m - 1, d));
    return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
  };
  const plain = PLAIN_DATE.exec(value);
  if (plain) {
    const [y, m, d] = [Number(plain[1]), Number(plain[2]), Number(plain[3])];
    if (!dayExists(y, m, d)) throw invalid("that day does not exist");
    const utc = Date.UTC(y, m - 1, d);
    return { ms: utc + (ALL_DAY_HOUR - UTC_OFFSET_HOURS) * HOUR_MS, hasTime: false };
  }
  if (value.includes("T")) {
    if (!HAS_OFFSET.test(value)) throw invalid("a time needs an offset, e.g. 2026-10-11T04:00:00+07:00");
    const day = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
    if (day && !dayExists(Number(day[1]), Number(day[2]), Number(day[3]))) throw invalid("that day does not exist");
    const ms = new Date(value).getTime();
    if (!Number.isNaN(ms)) return { ms, hasTime: true };
  }
  throw invalid("expected YYYY-MM-DD or a time with an offset like 2026-10-11T04:00:00+07:00");
}

/** An epoch in UTC+7 as "YYYY-MM-DD HH:mm UTC+7". */
export function formatUtc7(ms: number): string {
  const shifted = new Date(ms + UTC_OFFSET_HOURS * HOUR_MS).toISOString();
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 16)} UTC+7`;
}

/** Throws when both dates are known and the due date is before the start date. */
export function assertDateOrder(start: number | undefined, due: number | undefined): void {
  if (start !== undefined && due !== undefined && due < start) {
    throw new Error(`due date ${formatUtc7(due)} is before the start date ${formatUtc7(start)}`);
  }
}
