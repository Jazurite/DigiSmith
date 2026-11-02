import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { classifyInputBox } from "../input-box.ts";
import { parseAgentList, type ExecOut } from "../observers-real.ts";
import { appendEvent, atomicWrite } from "../state.ts";
import type { Plan } from "./plan.ts";

export interface WakeTarget { agent: string; session: string; workspace?: string; scope?: string }
export interface WakeDeps {
  dir: string;
  now: () => Date;
  exec: ExecOut;
  /** null when no Director is configured: nothing is sent. In Part 1 the real target is a stub returning null. */
  target: () => WakeTarget | null;
  herdrBin?: string;
}

export const WAKE_TEXT = "Director tick: dg director plan";
export const SAME_HASH_MINUTES = 10;
const LAST = "last-tick.json";

function lastTick(dir: string): { hash: string; at: number } | null {
  try {
    const v = JSON.parse(readFileSync(join(dir, "director", LAST), "utf8")) as { hash?: unknown; at?: unknown };
    const at = typeof v.at === "string" ? Date.parse(v.at) : NaN;
    return typeof v.hash === "string" && Number.isFinite(at) ? { hash: v.hash, at } : null;
  } catch { return null; }
}

/**
 * One prompt to the Director, only when the plan wakes it, its pane exists, is not working and its input box is empty
 * (the observer logic of the conductor wake). The same move list is not sent again within 10 minutes. Never throws.
 */
export async function wakeDirector(d: WakeDeps, p: Plan): Promise<"sent" | "none" | "skipped"> {
  if (!p.wake) return "none";
  const t = d.target();
  if (t === null) return "none";
  try {
    const now = d.now();
    const last = lastTick(d.dir);
    if (last !== null && last.hash === p.hash && now.getTime() - last.at < SAME_HASH_MINUTES * 60_000) return "skipped";
    const herdr = d.herdrBin ?? join(homedir(), ".digismith-depot", "bin", "herdr-ws");
    const sess = t.session === "default" ? [] : ["--session", t.session];
    const env: NodeJS.ProcessEnv = { ...process.env, ...(t.workspace === undefined ? {} : { HERDR_WS: t.workspace }), ...(t.scope === undefined ? {} : { HERDR_SCOPE: t.scope }) };
    const agents = parseAgentList((await d.exec(herdr, [...sess, "agent", "list"], { env, timeoutMs: 15000 })).stdout);
    const a = agents.find((x) => x.name === t.agent);
    if (a === undefined || a.pane === "" || a.status === "working") return "skipped";
    const ansi = (await d.exec(herdr, [...sess, "pane", "read", a.pane, "--format", "ansi"], { env, timeoutMs: 15000 })).stdout;
    if (classifyInputBox(ansi) !== "empty") return "skipped";
    await d.exec(herdr, [...sess, "agent", "prompt", t.agent, WAKE_TEXT], { env, timeoutMs: 30000 });
    mkdirSync(join(d.dir, "director"), { recursive: true });
    atomicWrite(join(d.dir, "director"), LAST, `${JSON.stringify({ hash: p.hash, at: now.toISOString() })}\n`);
    appendEvent(d.dir, now, "director-tick", { hash: p.hash, moves: p.moves.length });
    return "sent";
  } catch {
    return "skipped";
  }
}
