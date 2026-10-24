// packages/cli/src/run/hook.ts
// The Nightwatch hook handler. Imports only node:fs, node:os and node:path (through ./paths.ts and ./events.ts), with no yargs
// and no child_process, so a hook process starts fast. Never throws; never writes message text, prompts, tool inputs or outputs.
import * as fs from "node:fs";
import * as path from "node:path";
import { findRunDir, isSafe, runsDir } from "./paths.ts";
import { appendEvent, HOOK_TYPES } from "./events.ts";
import { plainName } from "./schema.ts";

export type HookKind = (typeof HOOK_TYPES)[number];

const LOG_CAP = 256 * 1024;

export function waitFor(kind: HookKind): number {
  return kind === "tool" ? 150 : 2000;
}

function toolOk(response: unknown): boolean {
  if (typeof response !== "object" || response === null) return true;
  const r = response as Record<string, unknown>;
  return !(r.is_error === true || r.success === false || (r.error !== undefined && r.error !== null && r.error !== false));
}

export function buildData(kind: HookKind, payload: unknown): Record<string, unknown> {
  const p = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const session_id = plainName(p.session_id);
  switch (kind) {
    case "started":
      return { source: plainName(p.source), session_id };
    case "blocked":
      return { kind: plainName(p.notification_type), session_id };
    case "tool":
      return { tool: plainName(p.tool_name), ok: toolOk(p.tool_response), session_id };
    case "ended":
      return { reason: plainName(p.reason), session_id };
    case "turn_end":
      return { session_id };
  }
}

function logError(kind: string, message: string, env: NodeJS.ProcessEnv): void {
  try {
    const root = runsDir(env);
    if (!fs.existsSync(root)) return;
    const file = path.join(root, "hook-errors.log");
    if (fs.existsSync(file) && fs.statSync(file).size >= LOG_CAP) return;
    fs.appendFileSync(file, `${new Date().toISOString()} ${kind} ${message.replace(/\s+/g, " ").slice(0, 200)}\n`);
  } catch {
    /* the log must never hurt a session either */
  }
}

export function runHook(kind: string, stdin: string, env: NodeJS.ProcessEnv = process.env): void {
  try {
    const id = env.DIGISMITH_RUN_ID;
    if (!id || !isSafe(id)) return;
    if (!(HOOK_TYPES as readonly string[]).includes(kind)) return;
    const k = kind as HookKind;
    const dir = findRunDir(id, env);
    if (!dir) return;
    let payload: unknown = {};
    try {
      payload = JSON.parse(stdin || "{}");
    } catch {
      /* not JSON: the event is still written, with empty data */
    }
    try {
      appendEvent(dir, id, k, buildData(k, payload), waitFor(k));
    } catch (e) {
      logError(k, (e as Error).message, env);
    }
  } catch (e) {
    logError(kind, (e as Error).message, env);
  }
}
