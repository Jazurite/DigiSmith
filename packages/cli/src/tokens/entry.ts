import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { findTranscript } from "./attribution.ts";
import { countTicket, renderTable, resolveSnapshotPath } from "./count.ts";
import { parseTaskAgents } from "./ledger.ts";
import { createDepotRegistry } from "./registry.ts";
import { STEPS, type Role, type Snapshot, type Step } from "./types.ts";

const ROLES: readonly Role[] = ["worker", "maestro", "reviewer", "other"];
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

class UsageError extends Error {}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const name = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[name] = "true";
    else {
      out[name] = next;
      i++;
    }
  }
  return out;
}

function need(flags: Record<string, string>, name: string): string {
  const v = flags[name];
  if (!v || v === "true") throw new UsageError(`missing --${name}`);
  return v;
}

// The --session-id flag first, then CLAUDE_CODE_SESSION_ID. Nothing else is tried.
function resolveSessionId(flags: Record<string, string>): string | null {
  for (const candidate of [flags["session-id"], process.env.CLAUDE_CODE_SESSION_ID]) {
    if (candidate && ID_PATTERN.test(candidate)) return candidate;
  }
  return null;
}

function liveSession(cmd: string, flags: Record<string, string>): string | null {
  const id = resolveSessionId(flags);
  if (!id) {
    console.error(`tokens ${cmd}: no usable session id (--session-id or CLAUDE_CODE_SESSION_ID); nothing recorded`);
    return null;
  }
  if (!findTranscript(id)) console.error(`tokens ${cmd}: no transcript found yet for session ${id}; recorded anyway`);
  return id;
}

function stepFlag(flags: Record<string, string>): Step {
  const step = need(flags, "step");
  if (!(STEPS as readonly string[]).includes(step)) throw new UsageError(`invalid --step ${step} (one of ${STEPS.join(", ")})`);
  return step as Step;
}

function readLedger(flags: Record<string, string>): Record<string, string[]> | undefined {
  if (!flags.ledger) return undefined;
  try {
    return parseTaskAgents(readFileSync(flags.ledger, "utf-8"));
  } catch {
    console.error(`tokens: cannot read ledger ${flags.ledger}; continuing without it`);
    return undefined;
  }
}

// Tasks of an earlier snapshot for the same ticket, or null when there is none to trust.
function previousTasks(path: string, ticket: string): Snapshot["tasks"] | null {
  try {
    const old = JSON.parse(readFileSync(path, "utf-8"));
    if (old?.schema_version !== 1 || old.ticket !== ticket) return null;
    if (!old.tasks || typeof old.tasks !== "object" || Array.isArray(old.tasks)) return null;
    return old.tasks;
  } catch {
    return null;
  }
}

function main(argv: string[]): void {
  const [cmd, ...rest] = argv;
  const flags = parseArgs(rest);
  const registry = createDepotRegistry();
  switch (cmd) {
    case "session": {
      const ticket = need(flags, "ticket");
      const role = need(flags, "role");
      if (!(ROLES as readonly string[]).includes(role)) throw new UsageError(`invalid --role ${role} (one of ${ROLES.join(", ")})`);
      const id = liveSession(cmd, flags);
      if (!id) return;
      if (registry.read(ticket).some((e) => e.kind === "session" && e.session_id === id)) return;
      registry.append({ kind: "session", ticket, session_id: id, source: flags.source ?? "claude-code", role: role as Role, ts: new Date().toISOString() });
      return;
    }
    case "step-start":
    case "step-end": {
      const ticket = need(flags, "ticket");
      const step = stepFlag(flags);
      const id = liveSession(cmd, flags);
      if (!id) return;
      registry.append({ kind: cmd === "step-start" ? "step_start" : "step_end", ticket, step, session_id: id, ts: new Date().toISOString() });
      return;
    }
    case "snapshot": {
      const ticket = need(flags, "ticket");
      const taskAgents = readLedger(flags);
      const snapshot = countTicket({ ticket, registry, taskAgents });
      console.log(renderTable(snapshot));
      if (flags.write) {
        const out = resolveSnapshotPath(process.cwd(), ticket);
        if (!taskAgents) snapshot.tasks = previousTasks(out, ticket) ?? snapshot.tasks;
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);
        console.error(`tokens: wrote ${out}`);
      }
      return;
    }
    case "task-tokens": {
      const ticket = need(flags, "ticket");
      const task = need(flags, "task");
      need(flags, "ledger");
      const snapshot = countTicket({ ticket, registry, taskAgents: readLedger(flags) });
      const t = { input: 0, output: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0 };
      for (const c of Object.values(snapshot.tasks[task] ?? {})) {
        t.input += c.input;
        t.output += c.output;
        t.cache_read += c.cache_read;
        t.cache_write_5m += c.cache_write_5m;
        t.cache_write_1h += c.cache_write_1h;
      }
      console.log(`Task ${task}: tokens in=${t.input} out=${t.output} cr=${t.cache_read} cw5=${t.cache_write_5m} cw1=${t.cache_write_1h}`);
      return;
    }
    default:
      throw new UsageError(`unknown subcommand ${cmd ?? "(none)"} (session, step-start, step-end, snapshot, task-tokens)`);
  }
}

try {
  main(process.argv.slice(2));
} catch (err) {
  console.error(`tokens: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
