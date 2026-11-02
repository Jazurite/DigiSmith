import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import type { Exec } from "../autonomous/conductor.ts";
import { findByKind, putEntry, removeEntry, resolveConductor, scopeFor } from "../conductor-registry/registry.ts";
import { DriverTaken, claimDriver, releaseDriver } from "./drivers.ts";

// `dg conductor start-ticket` (spec 6.2). Read "Suite" in the spec as "Castle" (rename 2026-11-02).

/** Exec that also returns stdout (the pane id comes from `tab create`). An `Exec` from autonomous/conductor.ts fits this type. */
export type ExecOut = (file: string, args: string[], env?: Record<string, string>) => Promise<{ code: number; stderr: string; stdout?: string }>;
export type { Exec };

export interface StartDeps { exec: ExecOut; now?: () => Date; env?: NodeJS.ProcessEnv; writeFile?: typeof fs.writeFileSync; repo?: string }
export interface StartArgs { ticket: string; under: string; project: string }

export const CASTLE = "Castle";
export const MAX_TICKET_CONDUCTORS = 2;
/** The flags `agent start` gives claude: the same list as ensure_agent in scripts/herdr/herdr-bootstrap.sh (a test pins it). */
export function conductorFlags(name: string, wsBin: string): string[] {
  return ["--name", name, "--disallowedTools", "Bash(herdr *)", "--allowedTools", "Bash(herdr-ws *)", `Bash(${wsBin} *)`];
}

function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export const realExecOut: ExecOut = (file, args, env) =>
  new Promise((resolve) => {
    const opts = env ? { env: { ...process.env, ...env } } : {};
    execFile(file, args, opts, (err, stdout, stderr) => {
      if (!err) return resolve({ code: 0, stderr: String(stderr), stdout: String(stdout) });
      const code = typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1;
      resolve({ code, stderr: String(stderr) || err.message, stdout: String(stdout ?? "") });
    });
  });

export function herdrWsPath(): string {
  return path.join(os.homedir(), ".digismith-depot", "bin", "herdr-ws");
}

function findKey(v: unknown, key: string): string | undefined {
  if (v === null || typeof v !== "object") return undefined;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (k === key && typeof x === "string") return x;
    const inner = findKey(x, key);
    if (inner !== undefined) return inner;
  }
  return undefined;
}

export function briefText(ticket: string, name: string): string {
  return `# Brief: ticket conductor ${name} for ${ticket}

You are ${name}, the ticket conductor of ${ticket}. You drive this one ticket and nothing else.

1. Drive Builder -> Reviewer -> merge for ${ticket}.
2. Close your own workers first, then close yourself with \`dg conductor close --self\`.
3. The log is automatic (herdr-ws writes it); do not keep a second one.
4. Stop and tell the conductor that started you when a step needs a decision that is not yours.
`;
}

export async function startTicketConductor(a: StartArgs, d: StartDeps): Promise<{ key: string; pane: string; name: string }> {
  const env = d.env ?? process.env;
  const repo = d.repo ?? process.cwd();
  const write = d.writeFile ?? fs.writeFileSync;
  const name = `tc-${a.ticket.toLowerCase()}`;
  const key = `${a.project}/${name}`;

  const starter = resolveConductor(`${a.project}/${a.under}`, env);
  if (!starter) throw new Error(`no conductor ${a.project}/${a.under} in the registry`);
  if (starter.session !== CASTLE) throw new Error(`${starter.key} is not in ${CASTLE} (session ${starter.session})`);
  if (starter.workspace === undefined) throw new Error(`${starter.key} has no workspace`);
  if (findByKind("ticket", env).length >= MAX_TICKET_CONDUCTORS) {
    throw new Error(`limit: ${MAX_TICKET_CONDUCTORS} ticket conductors are already open`);
  }

  try {
    claimDriver({ ticket: a.ticket, driver: name, mode: starter.kinds.includes("factory") ? "factory" : "attended" }, env);
  } catch (e) {
    if (e instanceof DriverTaken) throw new Error(`${e.ticket} already has a driver: ${e.driver}`);
    throw e;
  }

  let tabId: string | undefined;
  try {
    putEntry(key, { session: CASTLE, workspace: starter.workspace, floor: starter.floor, kind: "ticket", ticket: a.ticket, under: a.under, status: "open" }, env);
    const briefDir = path.join(repo, ".digismith", "sessions", name);
    fs.mkdirSync(briefDir, { recursive: true });
    write(path.join(briefDir, "brief.md"), briefText(a.ticket, name));

    const herdr = herdrWsPath();
    const hEnv = { HERDR_WS: starter.workspace, HERDR_SCOPE: scopeFor(starter, env) };
    const run = async (verb: string, args: string[]) => {
      const r = await d.exec(herdr, ["--session", CASTLE, ...args], hEnv);
      if (r.code !== 0) throw new Error(`herdr-ws ${verb} failed (exit ${r.code}): ${r.stderr}`);
      return r;
    };
    const tab = await run("tab create", ["tab", "create", "--workspace", starter.workspace, "--label", name, "--cwd", repo]);
    let pane: string | undefined;
    try {
      const out: unknown = JSON.parse(tab.stdout ?? "");
      pane = findKey(out, "pane_id");
      tabId = findKey(out, "tab_id");
    } catch {
      pane = undefined;
    }
    if (pane === undefined) throw new Error("herdr-ws tab create printed no pane id");
    // same identity env as the bootstrap sets before agent start: scope, name, and the Floor workspace
    const envText = `HERDR_SCOPE=${scopeFor(starter, env)} DIGISMITH_NAME=${name}` + (starter.floor !== undefined ? ` HERDR_WS=${starter.floor}` : "");
    await run("pane run", ["pane", "run", pane, `cd ${shQuote(repo)} && export ${envText}`]);
    await run("agent start", ["agent", "start", name, "--kind", "claude", "--pane", pane, "--timeout", "90000", "--", ...conductorFlags(name, herdr)]);
    await run("agent prompt", ["agent", "prompt", name, `Read .digismith/sessions/${name}/brief.md and follow it.`]);
    return { key, pane, name };
  } catch (e) {
    // every rollback step runs; a failing step never hides the original error
    if (tabId !== undefined) {
      try { await d.exec(herdrWsPath(), ["--session", CASTLE, "tab", "close", tabId], { HERDR_WS: starter.workspace, HERDR_SCOPE: scopeFor(starter, env) }); } catch { /* best effort */ }
    }
    try { releaseDriver(a.ticket, name, env); } catch { /* keep the original error */ }
    try { removeEntry(key, env); } catch { /* keep the original error */ }
    throw e;
  }
}
