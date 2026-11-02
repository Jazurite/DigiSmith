import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { appendAttention } from "../attention-write.ts";
import { appendResolved, readOpen } from "../attention.ts";
import { fmtUtc7, stampOf } from "../clock.ts";
import { rankTasks } from "../rank.ts";
import { TYPE_BUG, TYPE_TASK } from "../ready.ts";
import type { ScanDeps } from "../scan.ts";
import { appendEvent, readNotes, writeNotes } from "../state.ts";
import type { LoTask } from "../types.ts";
import { DONE_WHEN_QUESTION, acquireRefineLock, countRefineFailures, checkRefineReady, clearRefineLock, readRefineLock, REFINE_REASON, REFINE_STATUS, refineOrderPath, renderRefineOrder } from "./refine.ts";
import { escalate, hasReturned, markReturned } from "./escalate.ts";
import { recordDecision } from "./record.ts";

const keyOf = (t: LoTask): string => t.key ?? t.id;
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const hash = (s: string): string => createHash("sha1").update(s).digest("hex");
const STATUS_RUN = "refine-status";
const STATUS_CAUSE = "refine-status-missing";

/** The refine lane of one scan. Returns dry-run rows. A real run writes the lock, the order, events and the decision; never a ClickUp status (except an escalation). */
export async function runRefineLane(d: ScanDeps): Promise<{ key: string; reasons: string[] }[]> {
  const refine = d.refine!;
  const now = d.now();
  const rd = { dir: d.dir, now: d.now, tracker: d.tracker };

  if (d.dryRun) {
    const rows: { key: string; reasons: string[] }[] = [];
    if (!(await d.tracker.hasStatus(REFINE_STATUS))) return [{ key: "-", reasons: [`status "${REFINE_STATUS}" missing`] }];
    for (const t of await d.tracker.listByStatus(REFINE_STATUS)) {
      rows.push({ key: keyOf(t), reasons: t.typeId !== TYPE_TASK && t.typeId !== TYPE_BUG ? ["type"] : checkRefineReady(t) });
    }
    return rows;
  }

  if (!(await d.tracker.hasStatus(REFINE_STATUS))) {
    try { appendAttention(d.dir, now, { ticket: null, run: STATUS_RUN, kind: "failed", cause: STATUS_CAUSE }); } catch { /* the lane still stops */ }
    return [];
  }
  try {
    for (const it of readOpen(d.dir)) if (it.run === STATUS_RUN && it.cause === STATUS_CAUSE) appendResolved(d.dir, it.id, "watchdog", now.toISOString(), "refinement status found");
  } catch { /* stays open until a later scan */ }

  const all = await d.tracker.listByStatus(REFINE_STATUS);

  // A ticket that came back from concept: its open escalation is answered.
  const returned = new Set<string>();
  for (const t of all) if (markReturned(d.dir, keyOf(t), now) > 0) { returned.add(keyOf(t)); appendEvent(d.dir, now, "refine-release", { ticket: keyOf(t), reason: "returned-from-concept" }); }
  // A lock is stale when its ticket left refinement, or came back from concept (a refused gate keeps the lock while the ticket waits for Jack).
  let lock = readRefineLock(d.dir);
  if (lock !== null && !("corrupt" in lock) && (!all.some((t) => keyOf(t) === lock!.ticket) || returned.has(lock.ticket))) {
    clearRefineLock(d.dir);
    appendEvent(d.dir, now, "refine-release", { ticket: lock.ticket, reason: "stale" });
    lock = null;
  }

  if (lock !== null) return [];
  if (refine.roleFull() !== null) return [];

  const notes = readNotes(d.dir);
  let notesChanged = false;
  const candidates = all.filter((t) => (t.typeId === TYPE_TASK || t.typeId === TYPE_BUG) && t.mode !== "Manual");
  try {
    for (const t of rankTasks(candidates)) {
      const key = keyOf(t);
      const reasons = checkRefineReady(t);
      if (reasons.length > 0) {
        if (reasons.length === 1 && reasons[0] === REFINE_REASON.doneWhen) {
          await escalate(rd, { ticket: key, taskId: t.id, id: "product-taste-names-scope", question: DONE_WHEN_QUESTION, viaRelease: false });
          continue;
        }
        const nk = `refine:${key}`;
        const h = hash(reasons.join("|"));
        if (notes[nk] !== h) {
          try {
            await d.tracker.comment(t.id, `Refine scan skipped this ticket (${fmtUtc7(now)} UTC+7): ${reasons.join("; ")}. It stays in ${REFINE_STATUS}. Fix and it is picked up on a later scan.`);
            notes[nk] = h;
            notesChanged = true;
          } catch { /* retried on the next scan */ }
        }
        appendEvent(d.dir, now, "skip", { key, reason: reasons.join("; "), lane: "refine" });
        continue;
      }
      await claimRefine(d, t, now);
      return [];
    }
  } finally {
    if (notesChanged) writeNotes(d.dir, notes);
  }
  return [];
}

async function claimRefine(d: ScanDeps, t: LoTask, now: Date): Promise<void> {
  const refine = d.refine!;
  const key = keyOf(t);
  const ordersDir = refine.ordersDir ?? d.ordersDir;
  const stamp = stampOf(now);
  const order = refineOrderPath(ordersDir, stamp, key);
  const got = acquireRefineLock(d.dir, { ticket: key, taskId: t.id, claimedAt: now.toISOString(), claimedAtUtc7: fmtUtc7(now), order, scanId: d.scanId, attempt: countRefineFailures(d.dir, key) + 1, round: 1 });
  if (got === "busy") return;
  let wroteOrder = false;
  try {
    const answer = hasReturned(d.dir, key) ? (t.text.trim() !== "" ? t.text.trim().slice(0, 2000) : "see the ticket comments") : null;
    mkdirSync(ordersDir, { recursive: true });
    writeFileSync(order, renderRefineOrder({ key, name: t.name, taskId: t.id, claimedAtUtc7: fmtUtc7(now), stamp, answer }), { flag: "wx" });
    wroteOrder = true;
    await refine.prompt(`Director: refine ${key}, read ${order}`);
  } catch (e) {
    if (wroteOrder) rmSync(order, { force: true });
    try { clearRefineLock(d.dir); } catch { /* best effort */ }
    appendEvent(d.dir, now, "claim-failed", { ticket: key, lane: "refine", error: errText(e) });
    return;
  }
  appendEvent(d.dir, now, "refine-claim", { ticket: key, order, taskId: t.id });
  try {
    await recordDecision({ dir: d.dir, now: d.now, tracker: d.tracker }, { ticket: key, id: "claim-refine", side: "within", what: `claimed ${key} for refinement`, why: "ready refinement ticket, first in priority, due and age order" });
  } catch (e) {
    appendEvent(d.dir, now, "refine-failed", { ticket: key, error: `decision not recorded: ${errText(e)}` });
  }
}
