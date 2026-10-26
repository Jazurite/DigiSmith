import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { appendAttention } from "./attention-write.ts";
import { appendResolved, readOpen } from "./attention.ts";
import { awayExpired, readAway } from "./away.ts";
import { readBreaker } from "./breaker.ts";
import { fmtUtc7, stampOf } from "./clock.ts";
import { conductorCheck, promptConductor, type Exec } from "./conductor.ts";
import type { NexusDeps } from "./nexus.ts";
import { orderPath, renderOrder } from "./order.ts";
import { rankTasks } from "./rank.ts";
import type { ScanGuard } from "./scan-guard.ts";
import { checkReady, REASON, TYPE_BUG, TYPE_TASK } from "./ready.ts";
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
  /** DGS-665: null = a builder slot is free; a string = the refusal text. Optional so older tests keep passing; production always passes it. */
  builderFull?: () => string | null;
}
export interface ScanResult {
  outcome: "busy" | "no-starter-status" | "none" | "claimed" | "claim-failed" | "breaker" | "guardrail-config" | "conductor-config";
  claimed?: string;            // ticket key
  candidates: number;
  skipped: { key: string; reason: string }[];
  verdicts?: { key: string; reasons: string[] }[];   // dry run only
}

/** The status a claim writes; the scan stops when the space does not have it. */
const STARTER = "claimed";
/** Candidates are read from this status (any Mode but Manual); a failed claim puts the ticket back here. */
const INTAKE = "to do";
const NO_STARTER = "__no-starter-status";
const STARTER_RUN = "starter-status";
const STARTER_CAUSE = "claimed-status-missing";
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
    await d.tracker.setStatus(t.id, STARTER);
    const back = await d.tracker.getStatus(t.id);
    if (back !== STARTER) throw new Error(`status read back "${back}", expected "${STARTER}"`);
    mkdirSync(d.ordersDir, { recursive: true });
    writeFileSync(order, renderOrder({
      key, name: t.name, taskId: t.id, signOff: t.signOff ?? "Auto", claimedAtUtc7, stamp: stampOf(now), specPlan: specPlanText(t),
    }), { flag: "wx" });
    wroteOrder = true;
    await promptConductor(d.exec, d.conductorsJson, `Autonomous order: build ${key}, read ${order}`);
  } catch (e) {
    // Remove only the order file this scan created, so a later scan in the same minute can write it again.
    if (wroteOrder) rmSync(order, { force: true });
    // Each cleanup step is independent: one failing never skips the others.
    try { clearLock(d.dir); } catch { /* best effort */ }
    try { await d.tracker.setStatus(t.id, INTAKE); } catch { /* best effort */ }
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
  // 1. The scan runs at any hour; away only marks the time as unattended.
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
  // 2a. Every builder slot is busy with hand-started runs: wait. A normal wait, so no comment and no attention item.
  if (!d.dryRun && d.builderFull) {
    let why: string | null = null;
    try { why = d.builderFull(); } catch { /* an unreadable count never stops the scan */ }
    if (why !== null) {
      appendEvent(d.dir, now, "busy", { ticket: null, reason: "builder-limit", detail: why.slice(0, 300) });
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
  // 2c. A conductors.json without a workspace stops the scan before any claim; a clean read closes the item.
  if (!d.dryRun) {
    const problem = conductorCheck(d.conductorsJson);
    if (problem !== null) {
      const { cause } = problem;
      try { appendAttention(d.dir, now, { ticket: null, run: "conductor", kind: "failed", cause }); } catch { /* the scan still stops */ }
      appendEvent(d.dir, now, "conductor-config", { problem: problem.text.slice(0, 300) });
      return { outcome: "conductor-config", candidates: 0, skipped };
    }
    try {
      for (const it of readOpen(d.dir)) if (it.run === "conductor" && (it.cause === "conductor-workspace-missing" || it.cause === "conductor-config-unreadable")) appendResolved(d.dir, it.id, "watchdog", now.toISOString(), "conductor workspace read clean");
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

  // 3. The starter status: a claim writes it. Missing: an attention item, no claim; found: the item closes.
  if (!(await d.tracker.hasStatus(STARTER))) {
    if (!d.dryRun) {
      appendEvent(d.dir, now, "no-starter-status");
      try { appendAttention(d.dir, now, { ticket: null, run: STARTER_RUN, kind: "failed", cause: STARTER_CAUSE }); } catch { /* the scan still stops */ }
      if (notes[NO_STARTER] === undefined) {
        try {
          await d.tracker.comment("DGS-548", `Autonomous scan (${fmtUtc7(now)} UTC+7): the status "${STARTER}" is missing, so no ticket can be claimed. Add it back to the space's status set.`);
          notes[NO_STARTER] = now.toISOString();
          notesChanged = true;
        } catch { /* retried on the next scan */ }
      }
    }
    return finish({ outcome: "no-starter-status", candidates: 0, skipped });
  }
  if (!d.dryRun) {
    try {
      for (const it of readOpen(d.dir)) if (it.run === STARTER_RUN && it.cause === STARTER_CAUSE) appendResolved(d.dir, it.id, "watchdog", now.toISOString(), "claimed status found");
    } catch { /* the item stays open until a later scan */ }
  }

  // 4. Only Task and Bug whose Mode is not Manual are candidates (an empty Mode is Autonomous). A Manual to do is normal: no comment, no event.
  const all = await d.tracker.listByStatus(INTAKE);
  const candidates: LoTask[] = [];
  const manual: string[] = [];
  for (const t of all) {
    if (t.typeId !== TYPE_TASK && t.typeId !== TYPE_BUG) skipped.push({ key: keyOf(t), reason: "type" });
    else if (t.mode === "Manual") { skipped.push({ key: keyOf(t), reason: "mode" }); manual.push(keyOf(t)); }
    else candidates.push(t);
  }

  if (d.guard && d.dryRun) {
    const problems = d.guard.guardrailProblems();
    if (problems.length > 0) verdicts.push({ key: "-", reasons: [`guardrail-config: ${problems.join("; ")}`] });
  }

  if (d.dryRun) {
    const problem = conductorCheck(d.conductorsJson);
    if (problem !== null) verdicts.push({ key: "-", reasons: [`conductor-config: ${problem.text}`] });
    for (const key of manual) verdicts.push({ key, reasons: [REASON.mode] });
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
          await d.tracker.comment(t.id, `Autonomous scan skipped this ticket (${fmtUtc7(now)} UTC+7): ${reason}. It stays in ${INTAKE}. Fix and it is picked up on a later scan.`);
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
