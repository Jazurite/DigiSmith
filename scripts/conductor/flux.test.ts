import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  NIGHT_WINDOW, DEFAULT_WAKE, FLUX_RUN_LOG_DIR, inNightWindow, lastUsageSize, inputBoxState, scanNoteInFlight,
  fluxConductor, fluxAll, buildWake, type FluxDeps, type FluxHerdr, type FluxTarget, type HerdrAgent,
} from "./flux.ts";
import { closeCard, writeCard, listCards, findCardBySession, type SessionCard } from "../session-card.ts";

const OLD = "aaaaaaaa-0000-4000-8000-000000000001";
const NEW = "bbbbbbbb-0000-4000-8000-000000000002";
const NIGHT = new Date("2026-10-13T17:30:00Z"); // 00:30 UTC+7, Oct 14
const DAY = new Date("2026-10-13T05:00:00Z"); // 12:00 UTC+7

let tmp: string;
let env: NodeJS.ProcessEnv;
let tdir: string;
let note: string;
let brief: string;
let clock: Date;

const usageLine = (i: number, r: number, c: number, extra: object = {}) =>
  JSON.stringify({ type: "assistant", isSidechain: false, message: { usage: { input_tokens: i, cache_read_input_tokens: r, cache_creation_input_tokens: c, output_tokens: 9 } }, ...extra });

function writeTranscript(session: string, lines: string[], mtime?: Date) {
  const f = path.join(tdir, `${session}.jsonl`);
  fs.writeFileSync(f, lines.join("\n") + "\n");
  if (mtime) fs.utimesSync(f, mtime, mtime);
}
const card = (over: Partial<SessionCard> = {}): SessionCard => ({
  name: "tec", role: "conductor", id: "tec-01", session: OLD, domain: "DigiSmith", under: "jack", mandate: "m.md", state: note, runs_on: "herdr w2:pK",
  created_by: "jack", started: "2026-10-13T13:00+07:00", last_seen: "2026-10-13T13:48+07:00", status: "open", ...over,
});
const target = (over: Partial<FluxTarget> = {}): FluxTarget => ({ agent: "tec", project: "DigiSmith", brief, note, ...over });

const IDLE_BOX = "\x1b[2m────\x1b[0m\n❯ \x1b[2mtry something\x1b[0m\n\x1b[2m────\x1b[0m\n";

class FakeHerdr implements FluxHerdr {
  agents: HerdrAgent[] = [{ name: "tec", pane_id: "w2:pK", agent_status: "done", session: OLD }];
  calls: string[] = [];
  prompts: { text: string; wait: boolean }[] = [];
  box = IDLE_BOX;
  clearStalls = false;
  clearChangesId = true;
  clearDelayPolls = 1;
  wakeStalls = false;
  wakeReply = true;
  private polls = 0;
  private cleared = false;
  constructor(private ctx: { onClear?: () => void; onWake?: () => void }) {}
  async list() { this.calls.push("list"); return this.agents.map((a) => ({ ...a })); }
  async get(name: string) {
    this.calls.push(`get ${name}`);
    if (this.cleared) {
      this.polls++;
      if (this.clearChangesId && this.polls > this.clearDelayPolls) {
        const a = this.agents.find((x) => x.name === name)!;
        if (a.session === OLD) {
          a.session = NEW;
          this.ctx.onClear?.();
        }
      }
    }
    return this.agents.find((a) => a.name === name);
  }
  async readInput(pane: string) { this.calls.push(`readInput ${pane}`); return this.box; }
  async sendPrompt(name: string, text: string, o: { wait?: boolean } = {}) {
    this.calls.push(`prompt ${name}`);
    this.prompts.push({ text, wait: !!o.wait });
    if (text === "/clear") {
      this.cleared = true;
      return this.clearStalls ? { ok: false, code: "agent_prompt_stalled" } : { ok: true };
    }
    if (this.wakeReply) this.ctx.onWake?.();
    return this.wakeStalls ? { ok: false, code: "agent_prompt_stalled" } : { ok: true };
  }
}

let herdr: FakeHerdr;
let slept: number;
function deps(over: Partial<FluxDeps> = {}): FluxDeps {
  return {
    herdr, env, transcriptDir: tdir,
    now: () => clock,
    sleep: async (ms) => { slept += ms; clock = new Date(clock.getTime() + ms); },
    ...over,
  };
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dgs435-"));
  env = { DIGISMITH_DEPOT_DIR: path.join(tmp, "depot") };
  tdir = path.join(tmp, "transcripts");
  fs.mkdirSync(tdir);
  note = path.join(tmp, "note.md");
  brief = path.join(tmp, "brief.md");
  fs.writeFileSync(brief, "# brief\n");
  fs.writeFileSync(note, "## 2026-10-13 18:50: state before the flux\n- No ticket, no worker, no review, no merge in flight.\n");
  const t0 = new Date("2026-10-13T10:00:00Z");
  writeTranscript(OLD, ["{}", usageLine(2, 206343, 348), JSON.stringify({ type: "user" })], t0);
  fs.utimesSync(note, new Date("2026-10-13T11:50:00Z"), new Date("2026-10-13T11:50:00Z")); // after the last work
  writeCard(card(), env);
  clock = NIGHT;
  slept = 0;
  herdr = new FakeHerdr({
    onClear: () => {
      // what the hooks do in the same process: SessionEnd closes the old card, SessionStart writes a new one (DIGISMITH_* kept)
      closeCard({ project: "DigiSmith", id: "tec-01", session: OLD }, { env, result: "ended (clear)" });
      writeCard(card({ session: NEW }), env);
    },
    onWake: () => writeTranscript(NEW, [usageLine(3, 0, 9100)]),
  });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("night window", () => {
  const at = (iso: string) => new Date(iso);
  it("is one named constant: 23:30 to 02:00 at UTC+7", () => {
    expect(NIGHT_WINDOW).toEqual({ start: "23:30", end: "02:00", utcOffsetHours: 7 });
  });
  it("wraps over midnight with inclusive start and exclusive end", () => {
    expect(inNightWindow(at("2026-10-13T16:29:00Z"))).toBe(false); // 23:29
    expect(inNightWindow(at("2026-10-13T16:30:00Z"))).toBe(true); // 23:30
    expect(inNightWindow(at("2026-10-13T17:00:00Z"))).toBe(true); // 00:00
    expect(inNightWindow(at("2026-10-13T18:59:00Z"))).toBe(true); // 01:59
    expect(inNightWindow(at("2026-10-13T19:00:00Z"))).toBe(false); // 02:00
    expect(inNightWindow(at("2026-10-13T05:00:00Z"))).toBe(false); // noon
  });
  it("uses UTC+7 not the machine zone: 23:30 UTC is 06:30 next day, outside", () => {
    expect(inNightWindow(at("2026-10-13T23:30:00Z"))).toBe(false);
  });
});

describe("pure readers", () => {
  it("lastUsageSize sums input + cache read + cache creation of the last non-sidechain assistant usage", () => {
    const text = [usageLine(1, 1, 1), usageLine(10, 200, 30), usageLine(7, 7, 7, { isSidechain: true }), JSON.stringify({ type: "user" })].join("\n");
    expect(lastUsageSize(text)).toBe(240);
  });
  it("lastUsageSize is undefined without usage", () => {
    expect(lastUsageSize("{}\n")).toBeUndefined();
  });
  it("inputBoxState: dim text is a suggestion, normal text is typed, empty is empty", () => {
    expect(inputBoxState(IDLE_BOX)).toBe("empty");
    expect(inputBoxState("────\n❯ hello\n────\n")).toBe("typed");
    expect(inputBoxState("────\n❯ \x1b[2msuggest\x1b[0m\x1b[22m typed\n────\n")).toBe("typed");
    expect(inputBoxState("────\n❯ \n────\n")).toBe("empty");
    expect(inputBoxState("nothing like a box")).toBe("unreadable");
  });
  it("scanNoteInFlight: only sections after the last handoff; no handoff = newest section only", () => {
    const old = "## old\n- DGS-9 is building now\n\n";
    expect(scanNoteInFlight(`${old}## new\n- No ticket in flight. DGS-9 done.\n`)).toBeUndefined();
    expect(scanNoteInFlight(`${old}## new\n- DGS-12 build in flight\n`)).toBe("DGS-12");
    const withHandoff = `## a\n- DGS-1 running\n\n## Session end x (s) 2026\nResult: ended\nHandoff: card x\n\n## b\n- DGS-2 waiting for review\n`;
    expect(scanNoteInFlight(withHandoff)).toBe("DGS-2");
    const quiet = `## a\n- DGS-1 running\n\n## Session end x (s) 2026\nHandoff: card x\n`;
    expect(scanNoteInFlight(quiet)).toBeUndefined();
  });
});

describe("wake text", () => {
  it("default names the brief and the note", () => {
    const w = buildWake(target());
    expect(w).toContain(brief);
    expect(w).toContain(note);
    expect(w).toContain("Start no new work unless the note says so");
    expect(w.includes("\n")).toBe(false);
    expect(DEFAULT_WAKE).toContain("{brief}");
  });
  it("a per-target wake wins, and the paths are prepended when it names none", () => {
    const w = buildWake(target({ wake: "read the Current section first, then wait" }));
    expect(w).toContain("read the Current section first, then wait");
    expect(w).toContain(brief);
    expect(w).toContain(note);
  });
  it("a wake that already names both paths is used as it is", () => {
    const own = `read ${brief} and ${note} then wait`;
    expect(buildWake(target({ wake: own }))).toBe(own);
  });
});

describe("skips", () => {
  const skipped = async (reason: string | RegExp, over: Partial<FluxDeps> = {}, t: FluxTarget = target()) => {
    const r = await fluxConductor(t, {}, deps(over));
    expect(r.result).toBe("skipped");
    expect(r.reason).toMatch(reason);
    expect(herdr.prompts).toEqual([]);
    return r;
  };
  it("outside the night window", async () => {
    clock = DAY;
    await skipped("outside_night_window");
  });
  it("agent not found / ambiguous", async () => {
    await skipped("agent_not_found", {}, target({ agent: "ghost" }));
    herdr.agents.push({ name: "tec", pane_id: "w2:pZ", agent_status: "done", session: "x" });
    await skipped("agent_ambiguous");
  });
  it.each(["working", "blocked", "unknown"])("status %s", async (s) => {
    herdr.agents[0].agent_status = s;
    await skipped(`status_${s}`);
  });
  it("typed text in the input box", async () => {
    herdr.box = "────\n❯ half a sentence\n────\n";
    await skipped("input_typed");
  });
  it("an input box that cannot be read", async () => {
    herdr.box = "garbage";
    await skipped("input_box_unreadable");
  });
  it("an open worker card under the conductor", async () => {
    writeCard(card({ name: "dgs-9", role: "worker", id: "dgs-9", session: "w-1", under: "tec-01" }), env);
    await skipped("worker_running:dgs-9");
  });
  it("a worker of the target list that herdr shows working", async () => {
    herdr.agents.push({ name: "dgs-9", pane_id: "w2:p9", agent_status: "working", session: "w-1" });
    await skipped("worker_running:dgs-9", {}, target({ workers: ["dgs-9"] }));
  });
  it("Running or Waiting rows in the state block", async () => {
    const block = (b: string) => `<!-- digismith:conductor-state v1 -->\nUpdated: 2026-10-13T18:00+07:00\n\n${b}\n<!-- /digismith:conductor-state -->\n`;
    fs.writeFileSync(note, block("## Running\n- dgs-9 | DGS-9 | build | since 2026-10-13T13:35+07:00\n"));
    await skipped("note_running_rows");
    fs.writeFileSync(note, block("## Waiting for Jack\n- Merge DGS-9 now? | since 2026-10-13T13:50+07:00 | pane w2:p5\n"));
    await skipped("note_waiting_rows");
  });
  it("a note section newer than the last handoff that names a ticket in flight", async () => {
    fs.appendFileSync(note, "\n## 2026-10-13 19:00: new order\n- DGS-77 build in flight, worker running\n");
    await skipped("note_ticket_in_flight:DGS-77");
  });
  it("a note older than the last work (transcript or card)", async () => {
    fs.utimesSync(note, new Date("2026-10-13T09:00:00Z"), new Date("2026-10-13T09:00:00Z"));
    await skipped("note_stale");
  });
  it("a missing transcript or brief", async () => {
    fs.rmSync(path.join(tdir, `${OLD}.jsonl`));
    await skipped("no_transcript");
    fs.writeFileSync(path.join(tdir, `${OLD}.jsonl`), usageLine(1, 1, 1));
    fs.rmSync(brief);
    await skipped("no_brief");
  });
  it("a missing note", async () => {
    fs.rmSync(note);
    await skipped("no_note");
  });
  it("the sender digismith-conductor and any maestro are refused", async () => {
    await skipped("refused_target", {}, target({ agent: "digismith-conductor" }));
    fs.rmSync(path.join(tmp, "depot", "sessions", "DigiSmith", "cards"), { recursive: true });
    writeCard(card({ role: "maestro", id: "tec-01", under: undefined, mandate: undefined, machine: "workbox" }), env);
    await skipped("refused_target");
  });
  it("tolerates a conductor with no card and a note with no state block (the old b3 folder)", async () => {
    fs.rmSync(path.join(tmp, "depot", "sessions"), { recursive: true });
    herdr = new FakeHerdr({ onWake: () => writeTranscript(NEW, [usageLine(3, 0, 9100)]) });
    const r = await fluxConductor(target(), {}, deps());
    expect(r.result).toBe("fluxed");
    expect(r.checks.card).toMatch(/n\/a/);
  });
});

describe("dry run", () => {
  it("does every check, sends nothing, reports the plan, works by day", async () => {
    clock = DAY;
    const r = await fluxConductor(target(), { dryRun: true }, deps());
    expect(herdr.prompts).toEqual([]);
    expect(herdr.calls.some((c) => c.startsWith("prompt"))).toBe(false);
    expect(r.dry_run).toBe(true);
    expect(r.result).toBe("skipped");
    expect(r.reason).toBe("dry_run");
    expect(r.checks.night).toMatch(/outside.*would skip/);
    expect(r.would_send?.clear).toBe("/clear");
    expect(r.would_send?.wake).toContain(note);
    expect(r.session_old).toBe(OLD);
    expect(r.tokens_before).toBe(206343 + 2 + 348);
  });
  it("reports a failing check as the reason and still sends nothing", async () => {
    herdr.agents[0].agent_status = "working";
    const r = await fluxConductor(target(), { dryRun: true }, deps());
    expect(r.reason).toBe("status_working");
    expect(herdr.prompts).toEqual([]);
  });
  it("the guard throws when a prompt is attempted through the dry-run herdr", async () => {
    const calls: string[] = [];
    const real: FluxHerdr = { ...herdr, list: herdr.list.bind(herdr), get: herdr.get.bind(herdr), readInput: herdr.readInput.bind(herdr), sendPrompt: async () => { calls.push("sent"); return { ok: true }; } };
    await fluxConductor(target(), { dryRun: true }, deps({ herdr: real }));
    expect(calls).toEqual([]);
  });
});

describe("flux", () => {
  it("clears without --wait, polls the id, wakes with the paths, verifies old card closed and new card open", async () => {
    const r = await fluxConductor(target(), {}, deps());
    expect(r.result).toBe("fluxed");
    expect(r.session_old).toBe(OLD);
    expect(r.session_new).toBe(NEW);
    expect(r.tokens_before).toBe(206693);
    expect(r.tokens_after).toBe(9103);
    expect(r.needs_attention).toBe(false);
    expect(herdr.prompts[0]).toEqual({ text: "/clear", wait: false });
    expect(herdr.prompts[1].text).toContain(brief);
    expect(herdr.prompts[1].text).toContain(note);
    expect(herdr.prompts[1].wait).toBe(true);
    // the verify step read the cards by session id, not just the id change
    expect(findCardBySession(OLD, "DigiSmith", env)).toBeUndefined();
    expect(findCardBySession(NEW, "DigiSmith", env)?.card.state).toBe(note);
    const archived = listCards("DigiSmith", { scope: "archive", env }).filter((c) => c.card.session === OLD);
    expect(archived).toHaveLength(1);
    expect(archived[0].card.status).toBe("closed");
    expect(r.checks.card_old).toBe("closed");
    expect(r.checks.card_new).toBe("open");
    expect(r.checks.card_state).toBe("ok");
  });
  it("custom wake text per target is what is sent", async () => {
    await fluxConductor(target({ wake: "read the brief's Current section first, then wait; reply in at most 6 lines; read no worker pane" }), {}, deps());
    expect(herdr.prompts[1].text).toContain("reply in at most 6 lines; read no worker pane");
  });
  it("a stalled clear send is not trusted either way: a changed id carries on", async () => {
    herdr.clearStalls = true;
    const r = await fluxConductor(target(), {}, deps());
    expect(r.result).toBe("fluxed");
  });
  it("an id that never changes fails loudly and sends no wake", async () => {
    herdr.clearChangesId = false;
    const r = await fluxConductor(target(), {}, deps());
    expect(r.result).toBe("failed");
    expect(r.reason).toBe("clear_not_observed");
    expect(r.needs_attention).toBe(true);
    expect(herdr.prompts.map((p) => p.text)).toEqual(["/clear"]);
    expect(slept).toBeGreaterThanOrEqual(60_000);
  });
  it("a stalled wake is not resent; the reply decides", async () => {
    herdr.wakeStalls = true;
    const r = await fluxConductor(target(), {}, deps());
    expect(herdr.prompts.filter((p) => p.text !== "/clear")).toHaveLength(1);
    expect(r.result).toBe("fluxed");
  });
  it("no reply to the wake = verify_failed and needs_attention", async () => {
    herdr.wakeReply = false;
    const r = await fluxConductor(target(), {}, deps());
    expect(r.result).toBe("failed");
    expect(r.reason).toBe("verify_failed");
    expect(r.needs_attention).toBe(true);
    expect(r.checks.reply).toMatch(/no/);
  });
  it("verify fails when the old card is still open or the new card is missing", async () => {
    herdr = new FakeHerdr({ onWake: () => writeTranscript(NEW, [usageLine(3, 0, 9100)]) }); // the hooks did not run
    const r = await fluxConductor(target(), {}, deps());
    expect(r.result).toBe("failed");
    expect(r.checks.card_old).toBe("still open");
    expect(r.checks.card_new).toBe("missing");
  });
  it("verify fails when the new card points at another note", async () => {
    herdr = new FakeHerdr({
      onClear: () => {
        closeCard({ project: "DigiSmith", id: "tec-01", session: OLD }, { env, result: "ended (clear)" });
        writeCard(card({ session: NEW, state: "/elsewhere/note.md" }), env);
      },
      onWake: () => writeTranscript(NEW, [usageLine(3, 0, 9100)]),
    });
    const r = await fluxConductor(target(), {}, deps());
    expect(r.result).toBe("failed");
    expect(r.checks.card_state).toMatch(/differs/);
  });
  it("never uses any herdr verb but list, get, readInput, prompt", async () => {
    await fluxConductor(target(), {}, deps());
    for (const c of herdr.calls) expect(c).toMatch(/^(list|get |readInput |prompt )/);
  });
  it("appends one JSON line to the run log when asked", async () => {
    const r = await fluxConductor(target(), { log: true }, deps());
    const dir = path.join(tmp, "depot", ...FLUX_RUN_LOG_DIR);
    const files = fs.readdirSync(dir);
    expect(files).toEqual(["2026-10-14.jsonl"]); // the UTC+7 date
    const lines = fs.readFileSync(path.join(dir, files[0]), "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0]);
    expect(row).toMatchObject({ v: 1, job: "conductor-flux", agent: "tec", result: "fluxed", session_old: OLD, session_new: NEW, tokens_before: 206693, tokens_after: 9103, dry_run: false });
    expect(row.ts).toMatch(/\+07:00$/);
    expect(r.result).toBe("fluxed");
  });
  it("a dry run writes no log by default", async () => {
    await fluxConductor(target(), { dryRun: true }, deps());
    expect(fs.existsSync(path.join(tmp, "depot", ...FLUX_RUN_LOG_DIR))).toBe(false);
  });
});

describe("fluxAll", () => {
  it("drops digismith-conductor and maestros, lists the targets first, and goes on after a failure", async () => {
    herdr.agents.push({ name: "other", pane_id: "w2:pO", agent_status: "working", session: "o-1" });
    const targets = [target({ agent: "digismith-conductor" }), target({ agent: "other" }), target()];
    const out = await fluxAll(targets, { dryRun: true }, deps());
    expect(out.targets).toEqual(["other", "tec"]);
    expect(out.results.map((r) => [r.agent, r.reason])).toEqual([["other", "status_working"], ["tec", "dry_run"]]);
  });
});
