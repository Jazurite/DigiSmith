// The Maestro's consult: the conductor's state, locally or over plain ssh (read-only, Observer-grade).
import type { Runner } from "./runner.ts";
import { sshStateArgs } from "./runner.ts";
import type { State } from "./state.ts";

const SECTION_KEYS = ["done", "running", "waiting", "decided", "parked", "next"] as const;

export function parseRemoteState(stdout: string): State {
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  let parsed: unknown;
  const candidates = [stdout.trim(), ...lines.filter((l) => l.startsWith("{"))];
  for (const c of candidates) {
    try {
      parsed = JSON.parse(c);
      break;
    } catch {
      // try the next candidate
    }
  }
  if (parsed === undefined || typeof parsed !== "object" || parsed === null) {
    throw new Error("the remote answer is not valid JSON (is the state script on the remote machine?)");
  }
  const s = parsed as Record<string, unknown>;
  if (s.version !== 1) throw new Error(`unsupported state version ${String(s.version)} (this consult reads version 1)`);
  for (const k of SECTION_KEYS) if (!Array.isArray(s[k])) throw new Error(`the remote state has no "${k}" list`);
  const h = s.health as { seats?: unknown; tabs?: unknown } | undefined;
  if (!h || !Array.isArray(h.seats) || !Array.isArray(h.tabs)) throw new Error('the remote state has no valid "health"');
  return parsed as State;
}

const pretty = (iso: string): string => {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?\+07:00$/.exec(iso);
  return m ? `${m[1]} ${m[2]} UTC+7` : iso;
};
const list = (rows: string[]) => (rows.length ? rows.join("\n") : "none");

/** Text in the shape of the catch-up template (DGS-427); the catch-up itself is DGS-428's. */
export function renderText(s: State): string {
  const seats = s.health.seats.map((x) => `${x.seat}: 5h ${x.fiveHourPct}%, weekly ${x.weeklyPct}%`).join("; ");
  const out = [
    `# State: ${s.conductor}`,
    `As of: ${pretty(s.asOf)}   Project: ${s.project}   Note: ${s.note.path}`,
    "",
    "## Done",
    list(s.done.map((d) => `- ${d.key}: ${d.line}.${d.report ? ` Report: ${d.report}` : ""}`)),
    "",
    "## Running",
    list(s.running.map((r) => `- ${r.worker} | ${r.key} | ${r.stage} | since ${pretty(r.since)}`)),
    "",
    "## Waiting for Jack",
    list(s.waiting.map((r) => `- ${r.question} | since ${pretty(r.since)} | pane ${r.pane}`)),
    "",
    "## Decided under the mandate",
    list(s.decided.map((r) => `- ${r.decision} | why: ${r.why} | allowed by: ${r.allowedBy}`)),
    "",
    "## Parked or failed",
    list(s.parked.map((r) => `- ${r.what} | why: ${r.why} | next step: ${r.next}`)),
    "",
    "## Next",
    list(s.next.slice(0, 3).map((r, i) => `${i + 1}. ${r}`)),
    "",
    "## Health",
    `- Seats and usage: ${seats || "none"}`,
    `- Server: ${s.health.server}`,
    `- Open tabs: ${s.health.tabs.length}${s.health.tabs.length ? `: ${s.health.tabs.join(", ")}` : ""}`,
  ];
  const degraded = Object.entries(s.sources).filter(([, v]) => v !== "ok" && v !== "skipped");
  if (s.warnings.length || degraded.length) {
    out.push("", "## Warnings");
    for (const [k, v] of degraded) out.push(`- source ${k}: ${v}`);
    for (const w of s.warnings) out.push(`- ${w}`);
  }
  return `${out.join("\n")}\n`;
}

export interface ConsultOpts {
  project: string;
  conductor: string;
  remote?: string;
  remoteRepo?: string;
  machine?: string;
  since?: string;
}

export interface ConsultResult {
  state: State;
  live?: { pane: string; name: string; status: string }[];
  warnings: string[];
}

export const DEFAULT_REMOTE_REPO = "$HOME/Workspace/Jazurite/DigiSmith";

export async function consult(
  opts: ConsultOpts,
  deps: { runner: Runner; local: () => Promise<State> },
): Promise<ConsultResult> {
  if (!opts.remote) return { state: await deps.local(), warnings: [] };
  const args = sshStateArgs({
    target: opts.remote,
    repo: opts.remoteRepo ?? DEFAULT_REMOTE_REPO,
    project: opts.project,
    conductor: opts.conductor,
    since: opts.since,
  });
  const r = await deps.runner("ssh", args, { timeoutMs: 30_000 });
  if (r.code !== 0) {
    throw new Error(`ssh ${opts.remote} failed (exit ${r.code}): ${r.stderr.trim() || "no output"}`);
  }
  const result: ConsultResult = { state: parseRemoteState(r.stdout), warnings: [] };
  if (opts.machine) {
    try {
      const l = await deps.runner("herdr", ["--machine", opts.machine, "agent", "list"], { timeoutMs: 15_000 });
      if (l.code !== 0) throw new Error(l.stderr.trim() || `exit ${l.code}`);
      const agents = (JSON.parse(l.stdout) as { result?: { agents?: { name?: string; pane_id?: string; agent_status?: string }[] } }).result?.agents ?? [];
      result.live = agents.map((a) => ({ pane: a.pane_id ?? "?", name: a.name ?? "", status: a.agent_status ?? "unknown" }));
    } catch (e) {
      result.warnings.push(`live pane list failed: ${(e as Error).message}`);
    }
  }
  return result;
}
