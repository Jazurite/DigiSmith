import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appendAttentionId, appendResolved as writeResolved } from "./attention-write.ts";
import type { AttentionKind } from "./attention-write.ts";

export type { AttentionKind } from "./attention-write.ts";
export interface OpenItem {
  id: string;
  ts: string;
  ticket: string | null;
  run: string;
  kind: AttentionKind;
  cause: string;
  since: string;
  causeClass?: "transient" | "durable" | "unknown";
  retryEligible?: boolean;
}

export const attentionFile = (dir: string): string => join(dir, "attention.jsonl");

interface Line { id?: unknown; resolved?: unknown; [k: string]: unknown }

function lines(dir: string): Line[] {
  let text: string;
  try { text = readFileSync(attentionFile(dir), "utf-8"); } catch { return []; }
  const out: Line[] = [];
  for (const l of text.split("\n")) {
    if (!l.trim()) continue;
    try {
      const o = JSON.parse(l) as Line;
      if (o && typeof o === "object" && typeof o.id === "string") out.push(o);
    } catch { /* skip a line that does not parse */ }
  }
  return out;
}

/** Open = no later resolved line with the same id. Oldest first. */
export function readOpen(dir: string): OpenItem[] {
  const all = lines(dir);
  const closed = new Set(all.filter((l) => l.resolved === true).map((l) => l.id));
  const items: OpenItem[] = [];
  for (const l of all) {
    if (l.resolved === true || closed.has(l.id)) continue;
    if (typeof l.run !== "string" || typeof l.kind !== "string" || typeof l.since !== "string") continue;
    const ticket = typeof l.ticket === "string" ? l.ticket : null;
    const item: OpenItem = { id: l.id as string, ts: String(l.ts ?? l.since), ticket, run: l.run, kind: l.kind as AttentionKind, cause: String(l.cause ?? ""), since: l.since };
    if (l.causeClass === "transient" || l.causeClass === "durable" || l.causeClass === "unknown") item.causeClass = l.causeClass;
    if (typeof l.retryEligible === "boolean") item.retryEligible = l.retryEligible;
    items.push(item);
  }
  return items;
}

/** Thin wrapper over the single writer. Returns the new item, or null when (run, kind) is already open. */
export function appendOpen(dir: string, i: Omit<OpenItem, "id" | "ts"> & { ts: string }): OpenItem | null {
  const when = new Date(i.ts);
  const id = appendAttentionId(dir, when, { ticket: i.ticket, run: i.run, kind: i.kind, cause: i.cause, since: i.since, causeClass: i.causeClass, retryEligible: i.retryEligible });
  if (id === null) return null;
  const item: OpenItem = { id, ts: when.toISOString(), ticket: i.ticket, run: i.run, kind: i.kind, cause: i.cause, since: i.since };
  if (i.causeClass !== undefined) item.causeClass = i.causeClass;
  if (i.retryEligible !== undefined) item.retryEligible = i.retryEligible;
  return item;
}

export function appendResolved(dir: string, id: string, by: "watchdog" | "jack" | "controller", ts: string, note?: string): boolean {
  return writeResolved(dir, id, by, ts, note);
}

const utc7 = (ms: number): string => new Date(ms + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ");

export function formatOpen(items: OpenItem[], now: number): string {
  if (!items.length) return "none";
  return items
    .map((i) => {
      const age = Math.max(0, Math.round((now - Date.parse(i.since)) / 60_000));
      const ageText = age >= 60 ? `${Math.floor(age / 60)}h${String(age % 60).padStart(2, "0")}m` : `${age}m`;
      return `${i.id}  ${i.ticket ?? "-"}  ${i.kind}  ${i.cause}  since ${utc7(Date.parse(i.since))} (UTC+7)  ${ageText}`;
    })
    .join("\n");
}
