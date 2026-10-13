// The catch-up window and the idle check (design section 7, S8). Pure: no fs, no clock.

export interface WindowCard {
  id: string;
  session: string;
  last_seen: string;
  status: string;
}

/** The card fields the catch-up reads (a SessionCard from scripts/session-card.ts fits). */
export interface CardRow extends WindowCard {
  domain: string;
  role?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const UTC7_MS = 7 * 60 * 60 * 1000;

/** An instant as `2026-10-13T15:00+07:00` (the card timestamp shape). */
export function toUtc7(date: Date): string {
  const shifted = new Date(date.getTime() + UTC7_MS).toISOString();
  return `${shifted.slice(0, 16)}+07:00`;
}

function instant(card: WindowCard): number {
  const ms = Date.parse(card.last_seen);
  if (Number.isNaN(ms)) throw new Error(`card ${card.id}--${card.session}: invalid last_seen "${card.last_seen}"`);
  return ms;
}

function newestOtherSeen(cards: WindowCard[], identity: string, askingSession: string): number | undefined {
  const times = cards.filter((c) => c.id === identity && c.session !== askingSession).map(instant);
  return times.length ? Math.max(...times) : undefined;
}

export interface WindowInput {
  cards: WindowCard[];
  identity: string;
  askingSession: string;
  now: Date;
}

export interface CatchUpWindow {
  from: string;
  to: string;
  brandNew: boolean;
}

/** From the newest last_seen of the identity (any status), not counting the asking session; none = 24 hours. */
export function computeWindow({ cards, identity, askingSession, now }: WindowInput): CatchUpWindow {
  const newest = newestOtherSeen(cards, identity, askingSession);
  const from = newest ?? now.getTime() - DAY_MS;
  return { from: toUtc7(new Date(from)), to: toUtc7(now), brandNew: newest === undefined };
}

/** Idle: the asking session's own last_seen is older than the newest last_seen of the identity's other cards. */
export function isIdle({ cards, identity, askingSession }: Omit<WindowInput, "now">): boolean {
  const own = cards.find((c) => c.id === identity && c.session === askingSession);
  if (!own) return false;
  const other = newestOtherSeen(cards, identity, askingSession);
  return other !== undefined && instant(own) < other;
}
