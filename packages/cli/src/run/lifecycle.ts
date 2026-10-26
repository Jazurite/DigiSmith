// packages/cli/src/run/lifecycle.ts
// Lifecycle events (DGS-622): review_ready, merged and pushed, read from the Bash command of a PostToolUse payload.
// Regexes only, no shell parsing and no child process. The event keeps the type and a few scalars, never the command.
import * as fs from "node:fs";
import * as path from "node:path";
import { appendEvent, readEvents } from "./events.ts";
import { waitFor } from "./hook.ts";
import { isSafe, runsDir } from "./paths.ts";
import { ticketOfBranch } from "./repo-info.ts";
import type { RunRecord } from "./schema.ts";
import { TICKET_KEY } from "../ticket-key.ts";

export type Lifecycle = { type: "review_ready" | "merged" | "pushed"; ticket: string | null; data: Record<string, unknown> };

const PUSHED_DAYS = 7;
const DAY_MS = 86_400_000;

export function lifecycleOf(payload: unknown): Lifecycle | null {
  const p = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  if (p.tool_name !== "Bash") return null;
  const input = p.tool_input as { command?: unknown } | null | undefined;
  const cmd = typeof input?.command === "string" ? input.command : "";
  if (/\bdg reviewer pack\b/.test(cmd)) {
    if (!/--type[ =]ticket\b/.test(cmd)) return null;
    const ticket = /--ticket[ =]([A-Za-z0-9-]+)/.exec(cmd)?.[1] ?? "";
    if (!TICKET_KEY.test(ticket)) return null;
    const round = Number.parseInt(/--round[ =](\d+)/.exec(cmd)?.[1] ?? "1", 10);
    return { type: "review_ready", ticket, data: { scope: "ticket", round } };
  }
  const pin = /\bgit update-ref refs\/digismith\/post-finish\/(\S+?)\/head\b/.exec(cmd);
  if (pin) {
    const ticket = ticketOfBranch(pin[1]);
    return ticket === null ? null : { type: "merged", ticket, data: {} };
  }
  if (/(?:^|[\s;&|])git push origin (?:main|master)(?=\s|$|[;&|])/.test(cmd)) return { type: "pushed", ticket: null, data: {} };
  return null;
}

type Found = { dir: string; run: RunRecord };

function builderRuns(ticket: string | null, env: NodeJS.ProcessEnv): Found[] {
  const root = runsDir(env);
  const out: Found[] = [];
  let keys: string[];
  try {
    keys = ticket === null ? fs.readdirSync(root) : [ticket];
  } catch {
    return out;
  }
  for (const key of keys) {
    if (!isSafe(key)) continue;
    let ids: string[];
    try {
      ids = fs.readdirSync(path.join(root, key));
    } catch {
      continue;
    }
    for (const id of ids) {
      const dir = path.join(root, key, id);
      try {
        const run = JSON.parse(fs.readFileSync(path.join(dir, "run.json"), "utf8")) as RunRecord;
        if (run.role === "builder") out.push({ dir, run });
      } catch {
        /* no run.json: not a run folder */
      }
    }
  }
  return out;
}

export function newestBuilderRun(ticket: string, env: NodeJS.ProcessEnv): Found | null {
  const runs = builderRuns(ticket, env);
  if (runs.length === 0) return null;
  return runs.reduce((a, b) => (b.run.created_at > a.run.created_at ? b : a));
}

const has = (dir: string, type: string): boolean => readEvents(dir).some((e) => e.type === type);

export function writeLifecycle(payload: unknown, env: NodeJS.ProcessEnv, now: Date = new Date()): void {
  const l = lifecycleOf(payload);
  if (l === null) return;
  const wait = waitFor("tool");
  if (l.type === "pushed") {
    const since = now.getTime() - PUSHED_DAYS * DAY_MS;
    for (const { dir, run } of builderRuns(null, env)) {
      if (Date.parse(run.created_at) < since || !has(dir, "merged") || has(dir, "pushed")) continue;
      appendEvent(dir, run.run, "pushed", {}, wait);
    }
    return;
  }
  const found = l.ticket === null ? null : newestBuilderRun(l.ticket, env);
  if (found === null) return;
  if (l.type === "merged" && has(found.dir, "merged")) return;
  appendEvent(found.dir, found.run.run, l.type, l.data, wait);
}
