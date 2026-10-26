// packages/cli/src/run/hook.ts
// The Nightwatch hook handler. Imports node:fs, node:os and node:path (through the run modules); node:child_process only lazily,
// to start the labeller. No yargs, no git. Never throws; never writes message text, prompts, tool inputs or outputs.
import * as fs from "node:fs";
import * as path from "node:path";
import { findRunDir, isSafe, runsDir } from "./paths.ts";
import { appendEvent, HOOK_TYPES } from "./events.ts";
import { plainName } from "./schema.ts";
import { findAuto, startAuto } from "./auto.ts";
import { writeLifecycle } from "./lifecycle.ts";

const LABEL_CLI = path.join(import.meta.dirname, "label-cli.ts");

// Starts the labeller and returns at once; child_process is loaded only here.
function spawnLabeller(dir: string, env: NodeJS.ProcessEnv): void {
  const cp = process.getBuiltinModule("node:child_process") as typeof import("node:child_process");
  const child = cp.spawn(env.NIGHTWATCH_LABEL_NODE || process.execPath, ["--experimental-strip-types", LABEL_CLI, dir], { detached: true, stdio: "ignore", env });
  // An async spawn failure (EAGAIN, a bad node path) must not crash the hook.
  child.on("error", (e) => logError("label", e.message, env));
  child.unref();
}

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

export function logError(kind: string, message: string, env: NodeJS.ProcessEnv): void {
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
    if (!(HOOK_TYPES as readonly string[]).includes(kind)) return;
    const k = kind as HookKind;
    let payload: unknown = {};
    try {
      payload = JSON.parse(stdin || "{}");
    } catch {
      /* not JSON: the event is still written, with empty data */
    }
    const p = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
    let target: { dir: string; run: string } | null;
    let label = false;
    const id = env.DIGISMITH_RUN_ID;
    if (id) {
      // An explicit run id wins (DGS-581): no automatic run, no index.
      if (!isSafe(id)) return;
      const dir = findRunDir(id, env);
      target = dir ? { dir, run: id } : null;
    } else if (k === "started") {
      const a = startAuto(p, env);
      target = a;
      label = a?.needsLabel ?? false;
    } else {
      target = findAuto(p, env);
    }
    if (k === "tool") {
      // before the target check: a session with no run of its own, such as the conductor, still merges tickets
      try {
        writeLifecycle(p, env);
      } catch (e) {
        logError("lifecycle", (e as Error).message, env);
      }
    }
    if (!target) return;
    try {
      appendEvent(target.dir, target.run, k, buildData(k, payload), waitFor(k));
    } catch (e) {
      logError(k, (e as Error).message, env);
    }
    if (label) {
      try {
        spawnLabeller(target.dir, env);
      } catch (e) {
        logError("label", (e as Error).message, env);
      }
    }
  } catch (e) {
    logError(kind, (e as Error).message, env);
  }
}
