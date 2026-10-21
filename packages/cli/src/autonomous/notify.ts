import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OpenItem } from "./attention.ts";

export type RunDg = (args: string[]) => Promise<{ ok: boolean }>;
export interface NotifyDeps { dir: string; now: () => number; runDg: RunDg }

const HOUR_MS = 3600_000;
const MAX_PER_PASS = 10;

interface State { sent: string[]; last: Record<string, number> }

function load(dir: string): State {
  try {
    const s = JSON.parse(readFileSync(join(dir, "notify-state.json"), "utf-8")) as State;
    return { sent: Array.isArray(s.sent) ? s.sent : [], last: s.last && typeof s.last === "object" ? s.last : {} };
  } catch { return { sent: [], last: {} }; }
}

function save(dir: string, s: State): void {
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `notify-state.json.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(s));
  renameSync(tmp, join(dir, "notify-state.json"));
}

const utc7 = (ms: number): string => new Date(ms + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ");

export async function notifyNew(d: NotifyDeps, items: OpenItem[]): Promise<{ sent: number; pending: number }> {
  const st = load(d.dir);
  let sent = 0;
  let pending = 0;
  for (const it of items) {
    if (it.ticket === null || st.sent.includes(it.id)) continue;
    const key = `${it.ticket}:${it.kind}`;
    const limited = d.now() - (st.last[key] ?? -Infinity) < HOUR_MS;
    if (limited || sent >= MAX_PER_PASS) { pending++; continue; }
    const text = `Nightwatch ${it.kind}: run ${it.run}, ${it.cause}, since ${utc7(Date.parse(it.since))} (UTC+7). Needs Jack.`;
    let ok = false;
    try { ok = (await d.runDg(["clickup", "add-comment", "--task", it.ticket, "--text", text, "--yes"])).ok; } catch { ok = false; }
    if (!ok) { pending++; continue; }
    st.sent.push(it.id);
    st.last[key] = d.now();
    sent++;
  }
  save(d.dir, st);
  return { sent, pending };
}
