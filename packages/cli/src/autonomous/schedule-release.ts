import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fmtUtc7 } from "./clock.ts";
import { appendEvent, atomicWrite } from "./state.ts";
import type { EventKind, LoTask, Tracker } from "./types.ts";

const TO_DO = "to do";

export interface ScheduleDeps {
  tracker: Tracker; dir: string; now: () => Date; dryRun: boolean;
  /** The event writer; defaults to appendEvent. A failure to write an event never stops the run. */
  appendEvent?: typeof appendEvent;
}
export type ScheduleVerdict = "moved" | "would-move" | "not-due" | "no-date" | "bad-date" | "no-mode" | "failed";
export interface ScheduleLine { key: string; scheduledAtUtc7: string | null; mode: LoTask["mode"]; verdict: ScheduleVerdict; to?: typeof TO_DO; error?: string }
export interface ScheduleResult { scheduled: number; moved: number; lines: ScheduleLine[] }

export const SCHEDULE_NOTES = "schedule-notes.json";
export const SCHEDULE_TEXT = {
  noDate: "Scheduled at is empty. Set it (UTC+7) and the ticket moves at that time.",
  badDate: "Scheduled at is not a date. Set it again (UTC+7) and the ticket moves at that time.",
  noMode: "Mode is empty. Set Autonomous or Manual; the ticket then moves to to do.",
  failed: (to: string, error: string) => `Could not move this ticket to ${to}: ${error}. It stays in scheduled and is tried again every 5 minutes.`,
};

const hash = (s: string): string => createHash("sha1").update(s).digest("hex");
const keyOf = (t: LoTask): string => t.key ?? t.id;
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 200);
const at = (t: LoTask): number => (typeof t.scheduledAt === "number" ? t.scheduledAt : Number.POSITIVE_INFINITY);

function readScheduleNotes(dir: string): Record<string, string> {
  try {
    const p = join(dir, SCHEDULE_NOTES);
    if (!existsSync(p)) return {};
    const v: unknown = JSON.parse(readFileSync(p, "utf8"));
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch { return {}; }
}

/** Moves each scheduled ticket whose Scheduled at is past by its Mode. Throws only when the tracker cannot list. */
export async function runScheduleRelease(d: ScheduleDeps): Promise<ScheduleResult> {
  const now = d.now();
  const all = await d.tracker.listByStatus("scheduled");
  const tickets = [...all].sort((a, b) => at(a) - at(b));
  const notes = readScheduleNotes(d.dir);
  let notesChanged = false;
  // A ticket that left scheduled loses its note.
  const listed = new Set(tickets.map(keyOf));
  for (const k of Object.keys(notes)) if (!listed.has(k)) { delete notes[k]; notesChanged = true; }

  const tell = async (t: LoTask, text: string): Promise<void> => {
    if (d.dryRun) return;
    const h = hash(text);
    if (notes[keyOf(t)] === h) return;
    try {
      await d.tracker.comment(t.id, `Schedule release (${fmtUtc7(now)} UTC+7): ${text}`);
      notes[keyOf(t)] = h;
      notesChanged = true;
    } catch { /* tried again on the next run */ }
  };

  const writeEvent = (kind: EventKind, fields: Record<string, unknown>): void => {
    if (d.dryRun) return;
    try { (d.appendEvent ?? appendEvent)(d.dir, now, kind, fields); } catch { /* an event is a trace, not the work */ }
  };

  const lines: ScheduleLine[] = [];
  let moved = 0;
  try {
    for (const t of tickets) {
      const key = keyOf(t);
      const when = typeof t.scheduledAt === "number" ? fmtUtc7(new Date(t.scheduledAt)) : null;
      const line = (verdict: ScheduleVerdict, extra: Partial<ScheduleLine> = {}): void => { lines.push({ key, scheduledAtUtc7: when, mode: t.mode, verdict, ...extra }); };
      if (t.scheduledAt === null) { await tell(t, SCHEDULE_TEXT.noDate); line("no-date"); continue; }
      if (t.scheduledAt === "invalid") { await tell(t, SCHEDULE_TEXT.badDate); line("bad-date"); continue; }
      if (t.mode === null) { await tell(t, SCHEDULE_TEXT.noMode); line("no-mode"); continue; }
      if (t.scheduledAt > now.getTime()) {
        if (notes[key] !== undefined) { delete notes[key]; notesChanged = true; }
        line("not-due");
        continue;
      }
      if (d.dryRun) { line("would-move", { to: TO_DO }); continue; }
      let failure: string | null = null;
      try {
        await d.tracker.setStatus(t.id, TO_DO);
        const back = await d.tracker.getStatus(t.id);
        if (back.toLowerCase() !== TO_DO) throw new Error(`status read back "${back}", expected "${TO_DO}"`);
      } catch (e) {
        failure = errText(e);
      }
      if (failure === null) {
        writeEvent("schedule-move", { ticket: key, to: TO_DO, mode: t.mode, scheduledAtUtc7: when });
        if (notes[key] !== undefined) { delete notes[key]; notesChanged = true; }
        moved++;
        line("moved", { to: TO_DO });
      } else {
        const text = SCHEDULE_TEXT.failed(TO_DO, failure);
        // The event and the comment are written once per distinct failure text.
        if (notes[key] !== hash(text)) writeEvent("schedule-move-failed", { ticket: key, to: TO_DO, error: failure });
        await tell(t, text);
        line("failed", { to: TO_DO, error: failure });
      }
    }
  } finally {
    if (!d.dryRun && notesChanged) {
      try { atomicWrite(d.dir, SCHEDULE_NOTES, `${JSON.stringify(notes, null, 2)}\n`); } catch { /* the next run tries again */ }
    }
  }
  return { scheduled: tickets.length, moved, lines };
}
