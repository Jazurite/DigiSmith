import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { awayExpired, isAway, readAway } from "./away.ts";
import { fmtUtc7, inNightWindow, stampOf } from "./clock.ts";
import { promptConductor, type Exec } from "./conductor.ts";
import type { NexusDeps } from "./nexus.ts";
import { orderPath, renderOrder } from "./order.ts";
import { rankTasks } from "./rank.ts";
import { checkReady, TYPE_BUG, TYPE_TASK } from "./ready.ts";
import { acquireLock, appendEvent, clearLock, readLock, readNotes, writeNotes } from "./state.ts";
import { runBack } from "./switch.ts";
import type { LoTask, Tracker } from "./types.ts";

export interface ScanDeps {
  tracker: Tracker; dir: string; ordersDir: string; conductorsJson: string; repo: string;
  now: () => Date; scanId: string; exec: Exec; fileExists: (p: string) => boolean; dryRun: boolean;
  nexus: NexusDeps;
}
export interface ScanResult {
  outcome: "off" | "busy" | "no-starter-status" | "none" | "claimed" | "claim-failed";
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
  const got = acquireLock(d.dir, { ticket: key, taskId: t.id, claimedAt: now.toISOString(), claimedAtUtc7, order, scanId: d.scanId });
  if (got === "busy") {
    appendEvent(d.dir, now, "busy", { ticket: readLock(d.dir)?.ticket ?? "?" });
    return "busy";
  }
  try {
    await d.tracker.setStatus(t.id, "in progress");
    const back = await d.tracker.getStatus(t.id);
    if (back !== "in progress") throw new Error(`status read back "${back}", expected "in progress"`);
    mkdirSync(d.ordersDir, { recursive: true });
    writeFileSync(order, renderOrder({
      key, name: t.name, taskId: t.id, signOff: t.signOff ?? "Jack", claimedAtUtc7, stamp: stampOf(now), specPlan: specPlanText(t),
    }), { flag: "wx" });
    await promptConductor(d.exec, d.conductorsJson, `Autonomous order: build ${key}, read ${order}`);
  } catch (e) {
    clearLock(d.dir);
    try { await d.tracker.setStatus(t.id, "to do"); } catch { /* best effort */ }
    appendEvent(d.dir, now, "claim-failed", { ticket: key, error: errText(e) });
    return "claim-failed";
  }
  appendEvent(d.dir, now, "claim", { ticket: key, order });
  return "claimed";
}

export async function runScan(d: ScanDeps): Promise<ScanResult> {
  const now = d.now();
  const skipped: ScanResult["skipped"] = [];

  // 0. An expired away switch is turned off; its failure never stops the scan.
  if (!d.dryRun && awayExpired(readAway(d.dir), now)) {
    try { await runBack({ dir: d.dir, now: d.now, nexus: d.nexus }, "away-expired"); } catch { /* go on */ }
  }
  // 1. The work rule: nothing else runs outside it.
  if (!d.dryRun && !(inNightWindow(now) || isAway(readAway(d.dir), now))) {
    appendEvent(d.dir, now, "off");
    return { outcome: "off", candidates: 0, skipped };
  }
  // 2. A held lock.
  if (!d.dryRun) {
    const lock = readLock(d.dir);
    if (lock !== null) {
      appendEvent(d.dir, now, "busy", { ticket: lock.ticket });
      return { outcome: "busy", candidates: 0, skipped };
    }
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
  if (!(await d.tracker.hasStatus("to do"))) {
    if (!d.dryRun) {
      appendEvent(d.dir, now, "no-starter-status");
      if (notes[NO_STARTER] === undefined) {
        try {
          await d.tracker.comment("DGS-548", `Autonomous scan (${fmtUtc7(now)} UTC+7): the status "to do" is missing, so no ticket can be picked up. Add it back to the space's status set.`);
          notes[NO_STARTER] = now.toISOString();
          notesChanged = true;
        } catch { /* retried on the next scan */ }
      }
    }
    return finish({ outcome: "no-starter-status", candidates: 0, skipped });
  }

  // 4. Only Task and Bug are candidates.
  const all = await d.tracker.listToDo();
  const candidates: LoTask[] = [];
  for (const t of all) {
    if (t.typeId === TYPE_TASK || t.typeId === TYPE_BUG) candidates.push(t);
    else skipped.push({ key: keyOf(t), reason: "type" });
  }

  // 5. Walk in rank order.
  const ctx = { repo: d.repo, fileExists: d.fileExists };
  for (const t of rankTasks(candidates)) {
    const key = keyOf(t);
    const reasons = checkReady(t, ctx);
    if (d.dryRun) {
      verdicts.push({ key, reasons });
      if (reasons.length > 0) skipped.push({ key, reason: reasons.join("; ") });
      continue;
    }
    if (reasons.length > 0) {
      const reason = reasons.join("; ");
      const h = hash(reasons.join("|"));
      if (notes[key] !== h) {
        try {
          await d.tracker.comment(t.id, `Autonomous scan skipped this ticket (${fmtUtc7(now)} UTC+7): ${reason}. It stays in to do. Fix and it is picked up on a later scan.`);
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
