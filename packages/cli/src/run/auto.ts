// packages/cli/src/run/auto.ts
// Automatic runs (DGS-598): a session without DIGISMITH_RUN_ID is a run. node:fs and node:path only.
import * as fs from "node:fs";
import * as path from "node:path";
import { seatOf } from "./seat.ts";
import { readEvents } from "./events.ts";
import { maestroIdentityAt } from "./identity-folder.ts";
import { depotDir, isSafe, runsDir } from "./paths.ts";
import { repoInfo, ticketOfBranch } from "./repo-info.ts";
import { roleOf } from "./role.ts";
import { readPidIndex, readSessionIndex, writePidIndex, writeSessionIndex } from "./run-index.ts";
import { plainName, pluginVersion, RUN_SCHEMA, type RunRecord } from "./schema.ts";

export type AutoRun = { dir: string; run: string; created: boolean; needsLabel: boolean };

const sessionOf = (p: Record<string, unknown>): string | null => {
  const s = plainName(p.session_id);
  return s !== null && isSafe(s) ? s : null;
};
const relOf = (dir: string): string => `${path.basename(path.dirname(dir))}/${path.basename(dir)}`;
const env1 = (v: string | undefined): string | null => plainName(v);

// A /clear may continue the run of this claude process when that run is still open or ended for the clear.
function continuable(dir: string): boolean {
  // readEvents does not check the shape of a line: skip anything that is not an object with a string type.
  const ev = readEvents(dir).filter((e) => typeof e === "object" && e !== null && typeof (e as { type?: unknown }).type === "string");
  const types = ev.map((e) => e.type);
  const lastEnded = types.lastIndexOf("ended");
  if (lastEnded <= types.lastIndexOf("started")) return true;
  return ev[lastEnded].data?.reason === "clear"; // an ended without data is not a clear end
}

export function startAuto(payload: Record<string, unknown>, env: NodeJS.ProcessEnv, now: Date = new Date()): AutoRun | null {
  const sid = sessionOf(payload);
  if (sid === null || !fs.existsSync(depotDir(env))) return null;
  const pid = env.CLAUDE_PID && /^\d+$/.test(env.CLAUDE_PID) ? env.CLAUDE_PID : null;
  const known = readSessionIndex(env, sid);
  if (known) {
    if (pid) writePidIndex(env, pid, relOf(known), sid); // a resume in a new process: a later /clear there continues
    return { dir: known, run: path.basename(known), created: false, needsLabel: false };
  }
  if (payload.source === "clear" && pid) {
    const prev = readPidIndex(env, pid);
    if (prev && continuable(prev.dir)) {
      writeSessionIndex(env, sid, relOf(prev.dir));
      writePidIndex(env, pid, relOf(prev.dir), sid);
      return { dir: prev.dir, run: path.basename(prev.dir), created: false, needsLabel: false };
    }
  }
  const info = repoInfo(payload.cwd);
  const ticket = ticketOfBranch(info.branch);
  const inHerdr = Boolean(env.HERDR_PANE_ID);
  const headless = env.CLAUDE_CODE_ENTRYPOINT === "sdk-cli";
  const r = roleOf({ headless, inHerdr, looked: false, agentName: null, maestroIdentity: !inHerdr && maestroIdentityAt(info.root, env) });
  const run = `s-${sid}`;
  const folder = ticket ?? info.project;
  const dir = path.join(runsDir(env), folder, run);
  const record: RunRecord = {
    schema: RUN_SCHEMA, run, ticket, role: r.role, order: null,
    seat: seatOf(env), model: plainName(payload.model), plugin_version: pluginVersion(),
    base_sha: null, branch: info.branch, worktree: info.worktree,
    herdr: { workspace: env1(env.HERDR_WORKSPACE_ID), tab: env1(env.HERDR_TAB_ID), pane: env1(env.HERDR_PANE_ID) },
    budget: null, created_at: now.toISOString(),
    source: "auto", project: info.project, session_id: sid, role_from: r.role_from,
  };
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  let created = true;
  let madeDir = true;
  try {
    fs.mkdirSync(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    madeDir = false; // an earlier or racing start made it: still try to write run.json
  }
  try {
    fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") {
      created = false; // a second SessionStart of the same session raced us: continue its run
    } else {
      if (madeDir) { try { fs.rmdirSync(dir); } catch { /* only an empty dir goes */ } }
      throw e;
    }
  }
  writeSessionIndex(env, sid, relOf(dir));
  if (pid) writePidIndex(env, pid, relOf(dir), sid);
  return { dir, run, created, needsLabel: created && r.role_from === "pending" };
}

export function findAuto(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): { dir: string; run: string } | null {
  const sid = sessionOf(payload);
  const dir = sid === null ? null : readSessionIndex(env, sid);
  return dir ? { dir, run: path.basename(dir) } : null;
}
