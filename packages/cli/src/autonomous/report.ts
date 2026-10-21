import { existsSync } from "node:fs";
import { join } from "node:path";
import { fmtUtc7, stampOf } from "./clock.ts";
import { atomicWrite, firstEvent, readEvents, readLastReport, readLock, writeLastReport } from "./state.ts";
import type { Event, Lock, Tracker } from "./types.ts";

export interface ReportDeps { tracker: Tracker; dir: string; now: () => Date }

// Cap on how far back runReport looks for an away that began before the period; an away older than 30 days is not shown.
const AWAY_LOOKBACK_MS = 30 * 24 * 3600_000;
const STALE_LOCK_MS = 8 * 3600_000;
const str = (v: unknown): string => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));
const list = (lines: string[]): string => (lines.length ? lines.map((l) => `- ${l}`).join("\n") : "none");

function awayLines(events: Event[], from: Date): string[] {
  const out: string[] = [];
  let open: Event | null = null;
  for (const e of events) {
    if (e.kind === "away-on") {
      if (!open) open = e;
    } else if (e.kind === "away-off" || e.kind === "away-expired") {
      if (!open) {
        if (Date.parse(e.ts) >= from.getTime()) out.push(`away ended ${e.tsUtc7}${e.kind === "away-expired" ? " (expired)" : ""}`);
      } else if (Date.parse(open.ts) < from.getTime()) {
        if (Date.parse(e.ts) >= from.getTime()) out.push(`away ended ${e.tsUtc7}${e.kind === "away-expired" ? " (expired)" : ""}, since ${open.tsUtc7}`);
        open = null;
      } else {
        out.push(`${open.tsUtc7} to ${e.tsUtc7}${e.kind === "away-expired" ? " (expired)" : ""}`);
        open = null;
      }
    }
  }
  if (open) out.push(Date.parse(open.ts) < from.getTime() ? `away since ${open.tsUtc7}, still away` : `${open.tsUtc7} to still away`);
  return out;
}

export function buildReport(from: Date, to: Date, allEvents: Event[], lock: Lock | null): string {
  // away events from before `from` are context only; every other section counts the period
  const events = allEvents.filter((e) => Date.parse(e.ts) >= from.getTime());
  const of = (kind: Event["kind"]) => events.filter((e) => e.kind === kind);
  const releases = of("release");
  const built = releases.filter((e) => e.result === "merged")
    .map((e) => `${str(e.ticket)}: commit ${str(e.commit) || "unknown"}, ${str(e.minutes) || "?"} min`);
  const failed = releases.filter((e) => e.result === "failed" || e.result === "stopped")
    .map((e) => `${str(e.ticket)}: ${str(e.result)}${e.reason ? `, ${str(e.reason)}` : ""}`);
  const waiting = releases.filter((e) => e.result === "awaiting-jack" || e.result === "stopped")
    .map((e) => `${str(e.ticket)}${e.reason ? `: ${str(e.reason)}` : ""}`);

  const seen = new Set<string>();
  const skipped: string[] = [];
  for (const e of of("skip")) {
    const line = `${str(e.key)}: ${str(e.reason)}`;
    if (!seen.has(line)) { seen.add(line); skipped.push(line); }
  }
  const scanSkips = of("scan").reduce((n, e) => n + (typeof e.skipped === "number" ? e.skipped : 0), 0);
  if (scanSkips > 0) skipped.push(`scans skipped ${scanSkips} ticket${scanSkips === 1 ? "" : "s"} in total`);

  const building: string[] = [];
  if (lock) {
    building.push(`${lock.ticket}, claimed ${lock.claimedAtUtc7 || lock.claimedAt || "at an unknown time"}`);
    const claimed = Date.parse(lock.claimedAt);
    if (Number.isFinite(claimed) && to.getTime() - claimed > STALE_LOCK_MS) {
      building.push(`lock older than 8 h: release it with dg autonomous release --ticket ${lock.ticket} --result stopped`);
    }
  }

  return [
    `# Autonomous Operation report, ${fmtUtc7(from)} to ${fmtUtc7(to)} UTC+7`,
    "",
    "Away:", list(awayLines(allEvents, from)), "",
    `Scans: ${of("scan").length}, ${of("off").length} off, ${of("busy").length} busy`, "",
    "Built", list(built), "",
    "Failed or stopped", list(failed), "",
    "Waiting for Jack", list(waiting), "",
    "Skipped", list(skipped), "",
    "Still building", list(building), "",
  ].join("\n");
}

function firstEventDate(dir: string): Date | null {
  const ev = firstEvent(dir);
  return ev ? new Date(Date.parse(ev.ts)) : null;
}

export async function runReport(d: ReportDeps): Promise<{ file: string; commented: boolean }> {
  const to = d.now();
  const from = readLastReport(d.dir) ?? firstEventDate(d.dir) ?? to;
  const events = readEvents(d.dir, from.getTime() - AWAY_LOOKBACK_MS, to.getTime());
  const text = buildReport(from, to, events, readLock(d.dir));
  const reports = join(d.dir, "reports");
  let name = `${stampOf(to)}.md`;
  for (let n = 2; existsSync(join(reports, name)); n++) name = `${stampOf(to)}-${n}.md`;
  atomicWrite(reports, name, text);
  const file = join(reports, name);
  let commented = true;
  try {
    await d.tracker.comment("DGS-548", text);
  } catch (e) {
    commented = false;
    process.stderr.write(`autonomous report: comment failed: ${e instanceof Error ? e.message : String(e)}\n`);
  }
  writeLastReport(d.dir, to);
  return { file, commented };
}
