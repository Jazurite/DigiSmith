import * as fs from "node:fs";
import { endHook, startHook, touchHook } from "./card-hook.ts";
import type { HookDeps, HookEvent } from "./card-hook.ts";

// Pre-prompt extension point (S7). Handlers run in order, in this one process, BEFORE the heartbeat
// refreshes last_seen. A handler may return text, which goes to stdout as prompt context.
// DGS-428 registers its idle catch-up check here.
export type PrePromptHandler = (event: HookEvent, env: NodeJS.ProcessEnv) => string | void;
export const PRE_PROMPT_HANDLERS: PrePromptHandler[] = [];

export function runPrompt(
  event: HookEvent,
  env: NodeJS.ProcessEnv,
  deps: HookDeps & { touch?: () => void } = {},
  handlers: PrePromptHandler[] = PRE_PROMPT_HANDLERS,
): string {
  const out: string[] = [];
  for (const handler of handlers) {
    try {
      const text = handler(event, env);
      if (text) out.push(text);
    } catch (err) {
      console.error(`session-cards: pre-prompt handler failed (${(err as Error).message})`);
    }
  }
  try {
    if (deps.touch) deps.touch();
    else touchHook(event, env, deps);
  } catch (err) {
    console.error(`session-cards: heartbeat failed (${(err as Error).message})`);
  }
  return out.join("\n");
}

export function main(command: string | undefined, stdin: string, env: NodeJS.ProcessEnv): string {
  let event: HookEvent;
  try {
    event = JSON.parse(stdin || "{}") as HookEvent;
  } catch {
    console.error("session-cards: event is not JSON, nothing done");
    return "";
  }
  try {
    if (command === "start") {
      const r = startHook(event, env);
      if (!r.wrote && r.reason && !r.reason.startsWith("card exists")) console.error(`session-cards: ${r.reason}`);
    } else if (command === "prompt") {
      return runPrompt(event, env);
    } else if (command === "end") {
      endHook(event, env);
    } else {
      console.error(`session-cards: unknown command ${command ?? ""}`);
    }
  } catch (err) {
    console.error(`session-cards: ${command} failed (${(err as Error).message})`);
  }
  return "";
}

if (import.meta.filename === process.argv[1]) {
  let stdin = "";
  try {
    stdin = fs.readFileSync(0, "utf8");
  } catch {
    /* no stdin */
  }
  const out = main(process.argv[2], stdin, process.env);
  if (out) console.log(out);
  process.exitCode = 0;
}
