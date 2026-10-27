// DGS-435: the conductor flux, a JOB MODULE. A Nexus scheduler (DGS-456) can call fluxConductor / fluxAll later;
// scripts/conductor/flux-cli.ts is the manual entry. DGS-664: no clock rule; the idle checks are the only gate.
// Everything that touches the world comes in through FluxDeps, and the herdr interface has no verb that closes a tab, a pane or an agent.
import * as fs from "node:fs";
import * as path from "node:path";
import { depotDir } from "../depot-dir.ts";
import { findCardBySession, listCards, type SessionCard } from "../session-card.ts";
import { extractBlock, parseStateBody, STATE_MARKER } from "./state-block.ts";
import { iso7 } from "./state.ts";

/** Run log folder under the depot, one <UTC+7 date>.jsonl per day (the DGS-434 proposal). */
export const FLUX_RUN_LOG_DIR = ["runs", "conductor-flux"] as const;
export const JOB_NAME = "conductor-flux";

export const DEFAULT_WAKE =
  "You were renewed with a clear and remember nothing. Read your brief {brief} and your state note {note}. " +
  "Continue your standing order. Start no new work unless the note says so. Then wait. Reply in at most 6 lines.";

const CLEAR_POLL_MS = 2000;
const CLEAR_POLLS = 30; // 60 s
const REPLY_POLLS = 60; // 120 s
const WAKE_TIMEOUT_MS = 180_000;
const NOTE_GRACE_MS = 2 * 60_000;
const TAIL_BYTES = 256 * 1024;

export interface FluxTarget {
  agent: string;
  project: string;
  brief: string;
  note: string;
  /** Per-conductor wake text; the default is DEFAULT_WAKE. */
  wake?: string;
  /** Names of this conductor's workers; any of them listed in herdr, in any status, blocks the flux. */
  workers?: string[];
}

export interface HerdrAgent {
  name: string;
  pane_id: string;
  agent_status: string;
  session: string;
}

/** Closed on purpose: no close, kill, focus or create verb exists here. */
export interface FluxHerdr {
  list(): Promise<HerdrAgent[]>;
  get(name: string): Promise<HerdrAgent | undefined>;
  /** The pane's visible screen, ANSI kept (dim = suggestion, normal = typed). */
  readInput(pane: string): Promise<string>;
  sendPrompt(name: string, text: string, opts?: { wait?: boolean; until?: string[]; timeoutMs?: number }): Promise<{ ok: boolean; code?: string }>;
}

export interface FluxDeps {
  herdr: FluxHerdr;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  env: NodeJS.ProcessEnv;
  /** Where <session id>.jsonl transcripts live (~/.claude/projects/<repo slug>). */
  transcriptDir: string;
  /** Resolves a relative card.state; default process.cwd(). */
  repoRoot?: string;
}

export interface FluxOpts {
  dryRun?: boolean;
  /** Append the result to the run log. */
  log?: boolean;
  /** The agent was named on the command line (allows the sender digismith-conductor; --all never does). */
  named?: boolean;
}

export interface FluxResult {
  v: 1;
  job: typeof JOB_NAME;
  run_id: string;
  ts: string;
  ts_utc: string;
  agent: string;
  dry_run: boolean;
  result: "fluxed" | "skipped" | "failed";
  reason: string | null;
  needs_attention: boolean;
  tokens_before: number | null;
  tokens_after: number | null;
  session_old: string | null;
  session_new: string | null;
  checks: Record<string, string>;
  would_send?: { clear: string; wake: string };
  duration_s: number;
}

/** The sender; it fluxes only when named on the command line. */
export const SENDER = "digismith-conductor";

// ---------- pure readers ----------

/** input + cache read + cache creation of the last main-thread assistant usage; no model call. */
export function lastUsageSize(text: string): number | undefined {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"usage"')) continue;
    try {
      const o = JSON.parse(lines[i]) as { type?: string; isSidechain?: boolean; message?: { usage?: Record<string, unknown> } };
      const u = o.message?.usage;
      if (o.type !== "assistant" || o.isSidechain || !u) continue;
      const n = (k: string) => (typeof u[k] === "number" ? (u[k] as number) : 0);
      return n("input_tokens") + n("cache_read_input_tokens") + n("cache_creation_input_tokens");
    } catch {
      // a partial line at the start of a tail read, or junk: skip it
    }
  }
  return undefined;
}

function readTail(file: string): string | undefined {
  try {
    const fd = fs.openSync(file, "r");
    try {
      const size = fs.fstatSync(fd).size;
      const len = Math.min(size, TAIL_BYTES);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      return buf.toString("utf-8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return undefined;
  }
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** The Claude input box: the last line that starts with the prompt mark. Dim text is a suggestion; normal text is typed. */
export function inputBoxState(ansi: string): "empty" | "typed" | "unreadable" {
  const lines = ansi.split("\n");
  let at = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*[│|]?\s*[❯>]/.test(lines[i].replace(ANSI_RE, ""))) {
      at = i;
      break;
    }
  }
  if (at < 0) return "unreadable";
  const line = lines[at];
  const mark = line.search(/[❯>]/);
  let dim = false;
  for (let i = mark + 1; i < line.length; ) {
    if (line[i] === "\x1b") {
      const m = /^\x1b\[([0-9;]*)m/.exec(line.slice(i));
      if (m) {
        const ps = m[1] === "" ? ["0"] : m[1].split(";");
        for (let k = 0; k < ps.length; k++) {
          const p = ps[k];
          if (p === "38" || p === "48" || p === "58") k += ps[k + 1] === "5" ? 2 : ps[k + 1] === "2" ? 4 : 0; // colour sub-parameters are not flags
          else if (p === "2") dim = true;
          else if (p === "0" || p === "22") dim = false;
        }
        i += m[0].length;
        continue;
      }
    }
    if (!dim && !/[\s│|]/.test(line[i])) return "typed";
    i++;
  }
  return "empty";
}

const IN_FLIGHT = /\b(in flight|in-flight|running|building|being built|in review|under review|reviewing|waiting|awaiting|pending|merging|to do|in progress|claimed)\b/i;
const NOT_IN_FLIGHT = /\b(no|none|nothing|not|without|done|merged|closed|parked)\b/i;

/**
 * A ticket in flight in a note section newer than the last handoff (DGS-418's "## Session end" block).
 * With no handoff heading only the newest section counts. Returns the first ticket key or undefined.
 */
export function scanNoteInFlight(text: string): string | undefined {
  const sections: string[] = [];
  for (const line of text.split("\n")) {
    if (/^## /.test(line)) sections.push(line);
    else if (sections.length) sections[sections.length - 1] += `\n${line}`;
  }
  let lastHandoff = -1;
  sections.forEach((s, i) => {
    if (/^## Session end\b/.test(s)) lastHandoff = i;
  });
  const newer = lastHandoff >= 0 ? sections.slice(lastHandoff + 1) : sections.slice(-1);
  for (const s of newer) {
    for (const line of s.split("\n")) {
      const k = /\bDGS-\d+/.exec(line);
      if (k && IN_FLIGHT.test(line) && !NOT_IN_FLIGHT.test(line)) return k[0];
    }
  }
  return undefined;
}

export function buildWake(t: FluxTarget): string {
  const fill = (s: string) => s.replaceAll("{brief}", t.brief).replaceAll("{note}", t.note);
  let w = t.wake ? fill(t.wake) : fill(DEFAULT_WAKE);
  if (t.wake && !(w.includes(t.brief) && w.includes(t.note))) w = `Brief: ${t.brief}. Note: ${t.note}. ${w}`;
  w = w.replace(/\s*\n\s*/g, " ").trim();
  return w.startsWith("-") ? `Wake: ${w}` : w; // herdr reads a leading dash as a flag
}

// ---------- the job ----------

type Checks = Record<string, string>;

function parseTime(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : t;
}

function mtime(file: string): number | undefined {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return undefined;
  }
}

function appendLog(r: FluxResult, deps: FluxDeps): void {
  const dir = path.join(depotDir(deps.env), ...FLUX_RUN_LOG_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, `${r.ts.slice(0, 10)}.jsonl`), `${JSON.stringify(r)}\n`);
}

export async function fluxConductor(target: FluxTarget, opts: FluxOpts, deps: FluxDeps): Promise<FluxResult> {
  const started = deps.now();
  const checks: Checks = {};
  const res: FluxResult = {
    v: 1, job: JOB_NAME, run_id: `${iso7(started)}-${target.agent}`, ts: iso7(started), ts_utc: started.toISOString(),
    agent: target.agent, dry_run: !!opts.dryRun, result: "skipped", reason: null, needs_attention: false,
    tokens_before: null, tokens_after: null, session_old: null, session_new: null, checks, duration_s: 0,
  };
  const finish = (result: FluxResult["result"], reason: string | null, attention = false): FluxResult => {
    res.result = result;
    res.reason = reason;
    res.needs_attention = attention;
    res.duration_s = Math.round((deps.now().getTime() - started.getTime()) / 1000);
    if (opts.log) {
      try {
        appendLog(res, deps);
      } catch (e) {
        checks.log_error = (e as Error).message; // a failed log write never undoes or hides a finished flux
      }
    }
    return res;
  };
  const skip = (reason: string) => finish("skipped", reason);
  try {
    // 0. refused targets
    if (target.agent === SENDER && !opts.named) return skip("refused_target");

    // 1. the agent
    const found = (await deps.herdr.list()).filter((a) => a.name === target.agent);
    if (found.length === 0) return skip("agent_not_found");
    if (found.length > 1) return skip("agent_ambiguous");
    const agent = found[0];
    res.session_old = agent.session;
    if (!agent.session) return skip("no_session");
    const oldCard = findCardBySession(agent.session, target.project, deps.env)?.card;
    if (oldCard && oldCard.role === "maestro") return skip("refused_target");
    checks.card = oldCard ? `${oldCard.id} open` : "n/a (no open card for this session)";

    // 2. status
    if (!["idle", "done"].includes(agent.agent_status)) return skip(`status_${agent.agent_status}`);
    checks.status = agent.agent_status;

    // 3. typed text in the input box
    const box = inputBoxState(await deps.herdr.readInput(agent.pane_id));
    checks.input = box;
    if (box === "typed") return skip("input_typed");
    if (box === "unreadable") return skip("input_box_unreadable");

    // 4. files
    if (!fs.existsSync(target.brief)) return skip("no_brief");
    if (!fs.existsSync(target.note)) return skip("no_note");

    // 5. no worker running, nothing in flight
    if (oldCard) {
      const w = listCards(target.project, { scope: "open", env: deps.env }).find((c) => c.card.role === "worker" && c.card.under === oldCard.id);
      if (w) return skip(`worker_running:${w.card.name}`);
    }
    if (target.workers?.length) {
      const live = await deps.herdr.list();
      for (const name of target.workers) {
        if (live.some((x) => x.name === name)) return skip(`worker_running:${name}`); // an idle or done tab is a tab not yet closed
      }
    }
    const noteText = fs.readFileSync(target.note, "utf-8");
    const block = extractBlock(noteText, STATE_MARKER);
    let blockUpdated: number | undefined;
    if (block.found) {
      const s = parseStateBody(block.body).state;
      if (s.running.length) return skip("note_running_rows");
      if (s.runningUnknown !== undefined) return skip("note_running_unknown");
      if (s.waiting.length) return skip("note_waiting_rows");
      blockUpdated = parseTime(s.updated);
      checks.note_block = "ok";
    } else checks.note_block = "none (the evidence is the herdr list, the cards and the note text)";
    const inFlight = scanNoteInFlight(noteText);
    if (inFlight) return skip(`note_ticket_in_flight:${inFlight}`);

    // 6. the note is written after the last work
    const transcript = path.join(deps.transcriptDir, `${agent.session}.jsonl`);
    const tail = readTail(transcript);
    if (tail === undefined) return skip("no_transcript");
    const size = lastUsageSize(tail);
    if (size === undefined) return skip("no_usage");
    res.tokens_before = size;
    const lastWork = Math.max(mtime(transcript) ?? 0, parseTime(oldCard?.last_seen) ?? 0);
    const noteWritten = Math.max(mtime(target.note) ?? 0, blockUpdated ?? 0);
    if (noteWritten + NOTE_GRACE_MS < lastWork) return skip("note_stale");
    checks.note = "written after the last work";

    // dry run: every check passed, nothing is sent
    const wake = buildWake(target);
    if (opts.dryRun) {
      res.would_send = { clear: "/clear", wake };
      return skip("dry_run");
    }

    // 7a. one last look right before the send: the conductor may have started a turn or someone may be typing
    const last = await deps.herdr.get(agent.name);
    if (!last || !["idle", "done"].includes(last.agent_status) || last.session !== agent.session) return skip("changed_before_clear");
    if ((await deps.herdr.readInput(last.pane_id).then(inputBoxState)) !== "empty") return skip("changed_before_clear");

    // 7. flux: /clear without --wait (herdr stalls on it), then watch the session id
    const clear = await deps.herdr.sendPrompt(agent.name, "/clear", {});
    if (!clear.ok) checks.clear_send = clear.code ?? "error";
    let renewed: HerdrAgent | undefined;
    for (let i = 0; i < CLEAR_POLLS; i++) {
      const a = await deps.herdr.get(agent.name);
      if (a && a.session && a.session !== agent.session && ["idle", "done"].includes(a.agent_status)) {
        renewed = a;
        break;
      }
      await deps.sleep(CLEAR_POLL_MS);
    }
    if (!renewed) return finish("failed", "clear_not_observed", true);
    res.session_new = renewed.session;

    // 8. wake: names the brief and the note; a stalled send is never repeated
    const sent = await deps.herdr.sendPrompt(agent.name, wake, { wait: true, until: ["idle", "done"], timeoutMs: WAKE_TIMEOUT_MS });
    if (!sent.ok) checks.wake_send = sent.code ?? "error";
    const newTranscript = path.join(deps.transcriptDir, `${renewed.session}.jsonl`);
    let after: number | undefined;
    let status = renewed.agent_status;
    for (let i = 0; i < REPLY_POLLS; i++) {
      const t = readTail(newTranscript);
      after = t === undefined ? undefined : lastUsageSize(t);
      const a = await deps.herdr.get(agent.name);
      status = a?.agent_status ?? "unknown";
      if (after !== undefined && ["idle", "done"].includes(status)) break;
      await deps.sleep(CLEAR_POLL_MS);
    }
    res.tokens_after = after ?? null;

    // 9. verify: the new session, a reply, idle, and the cards read by session id
    const problems: string[] = [];
    checks.session = "changed";
    if (after === undefined) {
      checks.reply = "no reply in the new transcript";
      problems.push("reply");
    } else checks.reply = "yes";
    if (!["idle", "done"].includes(status)) {
      checks.status_after = status;
      problems.push("status");
    } else checks.status_after = status;
    if (oldCard) {
      const stillOpen = findCardBySession(agent.session, target.project, deps.env);
      const archived = listCards(target.project, { scope: "archive", env: deps.env }).find((c) => c.card.session === agent.session);
      checks.card_old = stillOpen ? "still open" : archived ? archived.card.status : "missing";
      if (checks.card_old !== "closed") problems.push("card_old");
      const fresh: SessionCard | undefined = findCardBySession(renewed.session, target.project, deps.env)?.card;
      checks.card_new = fresh ? "open" : "missing";
      if (!fresh) problems.push("card_new");
      else {
        const root = deps.repoRoot ?? process.cwd();
        const same = !!fresh.state && path.resolve(root, fresh.state) === path.resolve(root, target.note);
        checks.card_state = same ? "ok" : `differs (${fresh.state ?? "none"})`;
        if (!same) problems.push("card_state");
      }
    }
    return problems.length ? finish("failed", "verify_failed", true) : finish("fluxed", null);
  } catch (e) {
    checks.error = (e as Error).message;
    return finish("failed", "error", true);
  }
}

/** --all never includes the sender; the CLI prints this list before it runs anything. */
export function allTargets(targets: FluxTarget[]): FluxTarget[] {
  return targets.filter((t) => t.agent !== SENDER);
}

/** Targets run one after the other; a failure of one does not stop the next. */
export async function fluxAll(
  targets: FluxTarget[],
  opts: FluxOpts,
  deps: FluxDeps,
  run: typeof fluxConductor = fluxConductor,
): Promise<{ targets: string[]; results: FluxResult[] }> {
  const list = allTargets(targets);
  const results: FluxResult[] = [];
  for (const t of list) results.push(await run(t, { ...opts, named: false }, deps));
  return { targets: list.map((t) => t.agent), results };
}
