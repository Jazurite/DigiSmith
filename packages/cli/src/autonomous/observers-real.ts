import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { appendEvent, readEvents } from "../run/events.ts";
import { findRunDir } from "../run/paths.ts";
import { listRuns } from "../run/read.ts";
import { extractFindings, type Review } from "../reviewer/findings.ts";
import { isOpen, linkRulings } from "../reviewer/table.ts";
import type { ReviewerType } from "../reviewer/types.ts";
import { parseVerdictEntries } from "../reviewer/verdicts.ts";
import { PromptError, type ActDeps } from "./act.ts";
import { classifyInputBox } from "./input-box.ts";
import type { Observers } from "./observe.ts";
import { WORKTREE_GONE } from "./phase-types.ts";
import type { AttentionView, GitView, HerdrView, InputBox, MarkerPhase, PackView, RunView, VerdictView } from "./phase-types.ts";

/** Runs a file and returns its stdout. Rejects with an Error whose numeric `code` is the exit code on a non-zero exit. */
export type ExecOut = (file: string, args: string[], opts?: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv; maxBuffer?: number }) => Promise<{ stdout: string }>;
export interface RunRecord {
  id: string; role: string; created_at: string; worktree: string | null; base_sha: string | null;
  herdrPane?: string | null; branch?: string | null;
  events: { type: string; data?: Record<string, unknown> }[];
}
export interface RunStore { runsOf(ticket: string, sinceIso: string): Promise<RunRecord[]> }
export interface AgentEntry { name: string; status: string; pane: string }

export const realExecOut: ExecOut = (file, args, opts) =>
  new Promise((resolve, reject) => {
    let timedOut = false;
    const child = execFile(file, args, { cwd: opts?.cwd, env: opts?.env, maxBuffer: opts?.maxBuffer ?? 16 * 1024 * 1024 }, (err, stdout) => {
      if (timer !== undefined) clearTimeout(timer);
      if (!err) return resolve({ stdout: String(stdout) });
      const e = err as Error & { code?: unknown; signal?: string | null };
      // name the real cause: our timer, a buffer overflow (code kept), a signal from outside, else the exit code
      if (timedOut) e.code = "ETIMEDOUT";
      else if (e.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") { /* keep */ }
      else if (typeof e.code !== "number" && e.signal) e.code = `SIGNAL:${e.signal}`;
      reject(e);
    });
    const timer = opts?.timeoutMs === undefined ? undefined : setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, opts.timeoutMs);
  });

/** `herdr-ws agent list` prints {"result":{"agents":[{name,agent_status,pane_id,...}]}} (probe.md Step 4). */
export function parseAgentList(stdout: string): AgentEntry[] {
  const raw = JSON.parse(stdout) as { result?: { agents?: unknown } };
  const agents = raw?.result?.agents;
  if (!Array.isArray(agents)) throw new Error("agent list: no result.agents array");
  return (agents as { name?: unknown; agent_status?: unknown; pane_id?: unknown }[])
    .filter((a) => typeof a.name === "string")
    .map((a) => ({ name: a.name as string, status: String(a.agent_status ?? ""), pane: typeof a.pane_id === "string" ? a.pane_id : "" }));
}

async function gitView(exec: ExecOut, mainRepo: string, run: RunRecord | undefined, mergeHead: string | null): Promise<GitView> {
  if (run === undefined || run.worktree === null) throw new Error("no worktree");
  await exec("git", ["-C", mainRepo, "fetch", "origin", "main"], { timeoutMs: 15000 });
  let head: string;
  if (existsSync(run.worktree)) head = (await exec("git", ["-C", run.worktree, "rev-parse", "HEAD"])).stdout.trim();
  else if (mergeHead !== null) head = mergeHead; // worktree and branch removed after the merge: the head recorded at merge-ready
  else {
    if (!run.branch) throw new Error(`${WORKTREE_GONE} the run has no branch`);
    try {
      head = (await exec("git", ["-C", mainRepo, "rev-parse", run.branch])).stdout.trim(); // worktree removed after the merge: the branch sha, from the main checkout
    } catch (e) {
      throw new Error(`${WORKTREE_GONE} ${(e as Error).message}`);
    }
  }
  let onOriginMain = false;
  try {
    await exec("git", ["-C", mainRepo, "merge-base", "--is-ancestor", head, "origin/main"]);
    onOriginMain = true;
  } catch (e) {
    if ((e as { code?: unknown }).code !== 1) throw e;
  }
  return { head, base: run.base_sha, onOriginMain };
}

const MARKERS: MarkerPhase[] = ["building", "review", "merge"];
function runView(r: RunRecord): RunView {
  const has = (t: string) => r.events.some((e) => e.type === t);
  let phaseEvent: MarkerPhase | null = null;
  for (let i = r.events.length - 1; i >= 0; i--) {
    const e = r.events[i];
    if (e.type !== "phase") continue;
    const p = e.data?.phase;
    phaseEvent = MARKERS.includes(p as MarkerPhase) ? (p as MarkerPhase) : null;
    break;
  }
  return { id: r.id, role: r.role, createdAt: r.created_at, started: has("started"), ended: has("ended"), merged: has("merged"), pushed: has("pushed"), phaseEvent };
}

/** The main checkout. Same value as MAIN_CHECKOUT in scripts/nexus-api/src/scheduler/registry.ts. */
export const MAIN_CHECKOUT = join(homedir(), "Workspace", "Jazurite", "DigiSmith");

export interface ObserverDeps {
  exec: ExecOut; mainRepo: string; ticket: string; claimedAt: string;
  builderRunId: () => string | null; mergeHead?: () => string | null; conductorName: string; runs: RunStore;
  reviewerData: { packs(): Promise<PackView[]>; verdicts(): Promise<VerdictView[]> };
  tracker: { getStatus(): Promise<string> };
  herdrBin: string; herdrWs: string;
  attention: () => Promise<AttentionView[]>;
}

export function makeObservers(d: ObserverDeps): Observers {
  const env = () => ({ ...process.env, HERDR_WS: d.herdrWs });
  // read once per makeObservers call (the caller builds the observers once per tick), shared by runs, git and herdr
  let cached: Promise<RunRecord[]> | null = null;
  const records = () => (cached ??= d.runs.runsOf(d.ticket, d.claimedAt));
  return {
    runs: async () => (await records()).map(runView),
    packs: () => d.reviewerData.packs(),
    verdicts: () => d.reviewerData.verdicts(),
    git: async () => {
      const id = d.builderRunId();
      const run = id === null ? undefined : (await records()).find((r) => r.id === id);
      return gitView(d.exec, d.mainRepo, run, d.mergeHead?.() ?? null);
    },
    tracker: async () => ({ status: await d.tracker.getStatus() }),
    attention: () => d.attention(),
    herdr: async (): Promise<HerdrView> => {
      const agents = parseAgentList((await d.exec(d.herdrBin, ["agent", "list"], { env: env(), timeoutMs: 15000 })).stdout);
      const conductor = agents.find((a) => a.name === d.conductorName);
      let input: InputBox = "unknown";
      if (conductor !== undefined && conductor.pane !== "") {
        try {
          const ansi = (await d.exec(d.herdrBin, ["pane", "read", conductor.pane, "--format", "ansi"], { env: env(), timeoutMs: 15000 })).stdout;
          input = classifyInputBox(ansi);
        } catch {
          input = "unknown"; // an unreadable pane is never "empty"
        }
      }
      const id = d.builderRunId();
      const run = id === null ? undefined : (await records()).find((r) => r.id === id);
      const pane = run?.herdrPane ?? null;
      // no recorded pane is "unknown", never "gone": we cannot tell, so no restart order
      const builderPane: HerdrView["builderPane"] = pane === null ? "unknown" : agents.some((a) => a.pane === pane || a.pane.endsWith(`:${pane}`)) ? "present" : "gone";
      return { conductorPresent: conductor !== undefined, conductorWorking: conductor?.status === "working", input, builderPane };
    },
  };
}

export interface WriterDeps {
  exec: ExecOut; herdrBin: string; herdrWs: string; conductorName: string;
  tracker: { setStatus(s: string): Promise<void> };
  runEvent: (run: string, type: "phase", data: { phase: string }) => Promise<void>;
}

export function makeWriters(d: WriterDeps): Pick<ActDeps, "prompt" | "writeMarker" | "setStatus"> {
  return {
    prompt: async (text) => {
      try {
        await d.exec(d.herdrBin, ["agent", "prompt", d.conductorName, text], { env: { ...process.env, HERDR_WS: d.herdrWs }, timeoutMs: 30000 });
      } catch (e) {
        const code = (e as { code?: unknown }).code;
        const msg = `herdr-ws agent prompt failed: ${e instanceof Error ? e.message : String(e)}`;
        // a plain exit code or a missing binary: nothing was delivered. A timeout or anything else: it may have been.
        throw new PromptError(msg, (typeof code === "number" && code !== 0) || code === "ENOENT" ? "no" : "maybe");
      }
    },
    writeMarker: (run, phase) => d.runEvent(run, "phase", { phase }),
    setStatus: (s) => d.tracker.setStatus(s),
  };
}

// ---- thin glue over the real run and reviewer packages ----

/** The SDD workspace of a ticket inside a builder worktree: .digismith/board/<KEY>—<slug>[/worker-*]/.sdd-workspace */
export function findWorkspace(worktree: string, ticket: string): string | null {
  const board = join(worktree, ".digismith", "board");
  let names: string[];
  try { names = readdirSync(board); } catch { return null; }
  for (const n of names.sort()) {
    if (!n.startsWith(`${ticket}—`)) continue;
    const plan = join(board, n);
    const direct = join(plan, ".sdd-workspace");
    if (existsSync(direct)) return direct;
    try {
      for (const sub of readdirSync(plan).sort()) {
        const nested = join(plan, sub, ".sdd-workspace");
        if (existsSync(nested)) return nested;
      }
    } catch { /* not a folder */ }
  }
  return null;
}

function manifestField(text: string, field: string): string | null {
  const m = new RegExp(`^${field}:[ \\t]*(\\S+)[ \\t]*$`, "m").exec(text);
  return m === null ? null : m[1];
}

export function realStores(d: { env: NodeJS.ProcessEnv; ticket: string; builderRunId: () => string | null }): { runs: RunStore; reviewerData: ObserverDeps["reviewerData"] } {
  const runs: RunStore = {
    runsOf: async (ticket, sinceIso) =>
      listRuns(d.env, ticket)
        .filter((row) => sinceIso === "" || row.record.created_at >= sinceIso)
        .map((row) => {
          const dir = findRunDir(row.record.run, d.env);
          return {
            id: row.record.run, role: row.record.role, created_at: row.record.created_at,
            worktree: row.record.worktree, branch: row.record.branch, base_sha: row.record.base_sha, herdrPane: row.record.herdr.pane,
            events: dir === null ? [] : readEvents(dir).map((e) => ({ type: e.type, data: e.data })),
          };
        }),
  };
  const workspace = (): string | null => {
    const id = d.builderRunId();
    if (id === null) return null;
    const row = listRuns(d.env, d.ticket).find((r) => r.record.run === id);
    return row?.record.worktree ? findWorkspace(row.record.worktree, d.ticket) : null;
  };
  const TICKET_PACK_DIR = /^ticket-final-r\d+$/;
  const packOf = (dir: string): { round: number; head: string; base: string } | null => {
    let text: string;
    try { text = readFileSync(join(dir, "pack.md"), "utf8"); } catch { return null; }
    const round = Number(manifestField(text, "round"));
    const head = manifestField(text, "head");
    const base = manifestField(text, "base");
    return Number.isInteger(round) && head !== null && base !== null ? { round, head, base } : null;
  };
  return {
    runs,
    reviewerData: {
      packs: async () => {
        const ws = workspace();
        if (ws === null || !existsSync(join(ws, "reviews"))) return [];
        const out: PackView[] = [];
        for (const n of readdirSync(join(ws, "reviews")).sort()) {
          if (!TICKET_PACK_DIR.test(n)) continue; // only ticket-scope packs are proof; task packs are not
          const p = packOf(join(ws, "reviews", n));
          if (p !== null) out.push(p);
        }
        return out;
      },
      verdicts: async () => {
        const ws = workspace();
        if (ws === null) return [];
        // a review is joined with the pack.md of its own round folder; a review without a pack is an error, not a guess
        const root = join(ws, "reviews");
        if (!existsSync(root)) return [];
        let entries: ReturnType<typeof parseVerdictEntries> = [];
        try { entries = parseVerdictEntries(readFileSync(join(ws, "progress.md"), "utf8")); } catch (e) {
          if ((e as { code?: unknown }).code !== "ENOENT") throw e;
        }
        const reviews: Review[] = [];
        const heads: string[] = [];
        for (const name of readdirSync(root).sort()) {
          const m = /^(task|ticket)-(\d+|final)-r(\d+)$/.exec(name);
          const dir = join(root, name);
          if (m === null || !statSync(dir).isDirectory()) continue;
          const report = join(dir, "report.md");
          if (!existsSync(report)) continue; // the Reviewer has not finished: the phase waits
          const p = packOf(dir);
          if (p === null) throw new Error(`no readable pack.md next to ${report}`);
          reviews.push({ kind: m[1] as ReviewerType, id: m[2], round: Number(m[3]), file: report, findings: extractFindings(readFileSync(report, "utf8"), report) });
          heads.push(p.head);
        }
        // the ruling comes from the table's model across rounds: a finding blocks only when it is Critical or Important and its LAST ruling, in any round, is missing or still `fixing`
        const linked = linkRulings(reviews, entries);
        return reviews.map((r, i): VerdictView => {
          const blocking = r.findings.filter((f) => (f.severity === "Critical" || f.severity === "Important") && isOpen(linked.get(f)!.history));
          return { scope: r.kind as "task" | "ticket", result: blocking.length === 0 ? "clean" : "findings", head: heads[i] };
        });
      },
    },
  };
}

export function realRunEvent(env: NodeJS.ProcessEnv = process.env): WriterDeps["runEvent"] {
  return async (run, type, data) => {
    const dir = findRunDir(run, env);
    if (dir === null) throw new Error(`no run folder for ${run}`);
    appendEvent(dir, run, type, data, 2000);
  };
}
