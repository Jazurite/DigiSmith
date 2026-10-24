import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { appendAttention } from "./attention-write.ts";
import { appendResolved, readOpen } from "./attention.ts";
import { awayExpired, isAway, readAway } from "./away.ts";
import { readBreaker } from "./breaker.ts";
import { fmtUtc7, inNightWindow, stampOf } from "./clock.ts";
import { promptConductor, type Exec } from "./conductor.ts";
import type { NexusDeps } from "./nexus.ts";
import { orderPath, renderOrder } from "./order.ts";
import { rankTasks } from "./rank.ts";
import type { ScanGuard } from "./scan-guard.ts";
import { checkReady, TYPE_BUG, TYPE_TASK } from "./ready.ts";
import { planIfFree, settle } from "./journal.ts";
import { acquireLock, appendEvent, clearLock, readLock, readNotes, writeNotes } from "./state.ts";
import { runBack } from "./switch.ts";
import type { TickResult } from "./tick.ts";
import type { LoTask, Tracker } from "./types.ts";

export interface ScanDeps {
  tracker: Tracker; dir: string; ordersDir: string; conductorsJson: string; repo: string;
  now: () => Date; scanId: string; exec: Exec; fileExists: (p: string) => boolean; dryRun: boolean;
  nexus: NexusDeps;
  /** the already-done check and the guardrail stop; optional only for older tests, production always passes it */
  guard?: ScanGuard;
  /** advances the locked ticket one step; absent: a held lock is only reported busy */
  tick?: () => Promise<TickResult>;
}
export interface ScanResult {
  outcome: "off" | "busy" | "no-starter-status" | "none" | "claimed" | "claim-failed" | "breaker" | "guardrail-config";
  claimed?: string;            // ticket key
  candidates: number;
  skipped: { key: string; reason: string }[];
  verdicts?: { key: string; reasons: string[] }[];   // dry run only
}

const NO_STARTER = "__no-starter-status";
const hash = (s: string): string => createHash("sha1").update(s).digest("hex");
const keyOf = (t: LoTask): string => t.key ?? t.id;
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function specPlanText(t: LoTask): string {
  const lines = t.attachments.filter((a) => /^(design|spec|plan)\./i.test(a)).map((a) => `- attachment: ${a}`);
  for (const m of t.text.matchAll(/\.digismith\/board\/([A-Z]+-\d+—[^\s/)]+)/g)) lines.push(`- board folder: .digismith/board/${m[1]}/`);
  return lines.length > 0 ? lines.join("\n") : "- see the ticket";
}

type ClaimOutcome = "claimed" | "busy" | "claim-failed";

async function claim(d: ScanDeps, t: LoTask, now: Date): Promise<ClaimOutcome> {
  const key = keyOf(t);
  const order = orderPath(d.ordersDir, stampOf(now), key);
  const claimedAtUtc7 = fmtUtc7(now);
  // A key used by an earlier failed claim of the same ticket is not planned again.
  const jkey = planIfFree(d.dir, now, { ticket: key, phase: "claimed", attempt: 1, action: "claim" });
  const close = (r: "succeeded" | "retryable" | "permanent", note = ""): void => { if (jkey !== null) settle(d.dir, now, jkey, r, note); };
  const got = acquireLock(d.dir, {
    ticket: key, taskId: t.id, claimedAt: now.toISOString(), claimedAtUtc7, order, scanId: d.scanId,
    phase: "claimed", phaseStartedAt: now.toISOString(), attempt: 1, runs: { builder: null },
  });
  if (got === "busy") {
    close("retryable", "busy");
    appendEvent(d.dir, now, "busy", { ticket: readLock(d.dir)?.ticket ?? "?" });
    return "busy";
  }
  let wroteOrder = false;
  try {
    await d.tracker.setStatus(t.id, "in progress");
    const back = await d.tracker.getStatus(t.id);
    if (back !== "in progress") throw new Error(`status read back "${back}", expected "in progress"`);
    mkdirSync(d.ordersDir, { recursive: true });
    writeFileSync(order, renderOrder({
      key, name: t.name, taskId: t.id, signOff: t.signOff ?? "Jack", claimedAtUtc7, stamp: stampOf(now), specPlan: specPlanText(t),
    }), { flag: "wx" });
    wroteOrder = true;
    await promptConductor(d.exec, d.conductorsJson, `Autonomous order: build ${key}, read ${order}`);
  } catch (e) {
    // Remove only the order file this scan created, so a later scan in the same minute can write it again.
    if (wroteOrder) rmSync(order, { force: true });
    // Each cleanup step is independent: one failing never skips the others.
    try { clearLock(d.dir); } catch { /* best effort */ }
    try { await d.tracker.setStatus(t.id, "ready"); } catch { /* best effort */ }
    try { close("permanent", errText(e)); } catch { /* best effort */ }
    appendEvent(d.dir, now, "claim-failed", { ticket: key, error: errText(e) });
    return "claim-failed";
  }
  close("succeeded");
  appendEvent(d.dir, now, "claim", { ticket: key, order, taskId: t.id });
  return "claimed";
}

export async function runScan(d: ScanDeps): Promise<ScanResult> {
  const now = d.now();
  const skipped: ScanResult["skipped"] = [];

  // 0. An expired away switch is turned off; its failure never stops the scan.
  if (!d.dryRun && awayExpired(readAway(d.dir), now)) {
    try { await runBack({ dir: d.dir, now: d.now, nexus: d.nexus }, "away-expired"); } catch { /* go on */ }
  }
  // 0b. A held lock with a tick: the tick advances the ticket, the scan reports busy. A failing tick never stops the scan.
  if (!d.dryRun && d.tick !== undefined && readLock(d.dir) !== null) {
    let action: string;
    let error: string | undefined;
    try {
      const t = await d.tick();
      action = t.action?.kind ?? t.outcome;
    } catch (e) {
      action = "tick-failed";
      error = errText(e).replace(/\s+/g, " ").slice(0, 200);
    }
    appendEvent(d.dir, now, "busy", { ticket: readLock(d.dir)?.ticket ?? "?", action, ...(error === undefined ? {} : { error }) });
    return { outcome: "busy", candidates: 0, skipped };
  }
  // 1. The work rule: nothing else runs outside it.
  if (!d.dryRun && !(inNightWindow(now) || isAway(readAway(d.dir), now))) {
    appendEvent(d.dir, now, "off");
    return { outcome: "off", candidates: 0, skipped };
  }
  // 1b. An open breaker (two failed releases in a row, or a damaged breaker.json) stops the scan before any claim.
  if (!d.dryRun) {
    const b = readBreaker(d.dir);
    if (b.open) {
      if (b.problem !== null) {
        try {
          appendAttention(d.dir, now, { ticket: null, run: "breaker", kind: "unknown", cause: `breaker-file-unreadable: ${b.problem}` });
        } catch { /* the scan still stops */ }
      }
      appendEvent(d.dir, now, "breaker", { streak: b.streak });
      return { outcome: "breaker", candidates: 0, skipped };
    }
  }
  // 2. A held lock.
  if (!d.dryRun) {
    const lock = readLock(d.dir);
    if (lock !== null) {
      appendEvent(d.dir, now, "busy", { ticket: lock.ticket });
      return { outcome: "busy", candidates: 0, skipped };
    }
  }
  // 2b. Bad guardrails on main stop the scan before any claim; a clean read closes the item.
  if (d.guard && !d.dryRun) {
    const problems = d.guard.guardrailProblems();
    if (problems.length > 0) {
      const cause = "bad-guardrail-config";
      try { appendAttention(d.dir, now, { ticket: null, run: "guardrails", kind: "failed", cause }); } catch { /* the scan still stops */ }
      appendEvent(d.dir, now, "guardrail-config", { problems: problems.join("; ").slice(0, 300) });
      return { outcome: "guardrail-config", candidates: 0, skipped };
    }
    try {
      for (const it of readOpen(d.dir)) if (it.run === "guardrails" && it.cause === "bad-guardrail-config") appendResolved(d.dir, it.id, "watchdog", now.toISOString(), "guardrails read clean");
    } catch { /* the item stays open until a later scan */ }
  }
  const notes = readNotes(d.dir);
  let notesChanged = false;
  const finish = (r: ScanResult): ScanResult => {
    if (d.dryRun) return { ...r, verdicts };
    if (notesChanged) writeNotes(d.dir, notes);
    appendEvent(d.dir, now, "scan", { candidates: r.candidates, skipped: r.skipped.length, claimed: r.claimed ?? null });
    return r;
  };
  const verdicts: { key: string; reasons: string[] }[] = [];

  // 3. The starter status.
  if (!(await d.tracker.hasStatus("ready"))) {
    if (!d.dryRun) {
      appendEvent(d.dir, now, "no-starter-status");
      if (notes[NO_STARTER] === undefined) {
        try {
          await d.tracker.comment("DGS-548", `Autonomous scan (${fmtUtc7(now)} UTC+7): the status "ready" is missing, so no ticket can be picked up. Add it back to the space's status set.`);
          notes[NO_STARTER] = now.toISOString();
          notesChanged = true;
        } catch { /* retried on the next scan */ }
      }
    }
    return finish({ outcome: "no-starter-status", candidates: 0, skipped });
  }

  // 4. Only Task and Bug are candidates.
  const all = await d.tracker.listByStatus("ready");
  const candidates: LoTask[] = [];
  for (const t of all) {
    if (t.typeId === TYPE_TASK || t.typeId === TYPE_BUG) candidates.push(t);
    else skipped.push({ key: keyOf(t), reason: "type" });
  }

  if (d.guard && d.dryRun) {
    const problems = d.guard.guardrailProblems();
    if (problems.length > 0) verdicts.push({ key: "-", reasons: [`guardrail-config: ${problems.join("; ")}`] });
  }

  // 5. Walk in rank order.
  const ctx = { repo: d.repo, fileExists: d.fileExists };
  for (const t of rankTasks(candidates)) {
    const key = keyOf(t);
    const reasons = checkReady(t, ctx);
    if (reasons.length === 0 && d.guard) {
      const done = d.guard.alreadyDone(t);
      if (done !== null) {
        reasons.push(done.reason);
        if (done.attention !== undefined && !d.dryRun) {
          try { appendAttention(d.dir, now, { ticket: key, run: `${key}/already-merged`, kind: "unknown", cause: done.attention }); } catch { /* the skip still stands */ }
        }
      }
    }
    if (d.dryRun) {
      verdicts.push({ key, reasons });
      continue;
    }
    if (reasons.length > 0) {
      const reason = reasons.join("; ");
      const h = hash(reasons.join("|"));
      if (notes[key] !== h) {
        try {
          await d.tracker.comment(t.id, `Autonomous scan skipped this ticket (${fmtUtc7(now)} UTC+7): ${reason}. It stays in ready. Fix and it is picked up on a later scan.`);
          notes[key] = h;
          notesChanged = true;
        } catch { /* retried on the next scan */ }
      }
      appendEvent(d.dir, now, "skip", { key, reason });
      skipped.push({ key, reason });
      continue;
    }
    // 6. Claim the first ready ticket and stop.
    const out = await claim(d, t, now);
    if (out === "busy") {
      if (notesChanged) writeNotes(d.dir, notes);
      return { outcome: "busy", candidates: candidates.length, skipped };
    }
    return finish({ outcome: out, claimed: out === "claimed" ? key : undefined, candidates: candidates.length, skipped });
  }
  // 7.
  return finish({ outcome: "none", candidates: candidates.length, skipped });
}
