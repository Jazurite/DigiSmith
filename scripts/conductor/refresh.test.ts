import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { refreshState, type RefreshDeps } from "./refresh.ts";
import { parseMarkers, stripMarkers } from "./markers.ts";
import { collectState } from "./state.ts";
import { extractBlock, parseStateBody, STATE_MARKER, markerLines } from "./state-block.ts";
import { main, type Io } from "./cli.ts";
import { readOnlyRunner, type Runner } from "./runner.ts";

const NOW = new Date("2026-10-13T12:00:00Z"); // 19:00 UTC+7
let tmp: string;
let repo: string;
let note: string;

const BODY = (extra = "") => `Updated: 2026-10-13T14:25+07:00
Conductor: digismith-conductor

## Running
none

## Waiting for Jack
- Remove the stray file [resolves: gone stray.txt] | since 2026-10-12T20:00+07:00 | pane w2:p1
- Keep this one | since 2026-10-12T20:00+07:00 | pane w2:p1

## Decided under the mandate
- A decision [resolves: ticket DGS-1] | why: r | allowed by: o

## Parked or failed
- Parked thing [resolves: merged DGS-430] | why: w | next step: n
- Open thing | why: w | next step: n

## Next
1. Do X [resolves: ticket DGS-411]
2. Do Y
${extra}
## Health
- Seats and usage: jack: 5h 19%, weekly 59%
`;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dgs462-"));
  repo = path.join(tmp, "repo");
  fs.mkdirSync(repo);
  note = path.join(tmp, "note.md");
  const m = markerLines(STATE_MARKER);
  fs.writeFileSync(note, `# free\ntext\n\n${m.open}\n${BODY()}${m.close}\n\n## Session end\nResult: ok\n`);
  fs.writeFileSync(path.join(repo, "stray.txt"), "x");
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const agent = (name: string, ws: string, status = "working", title = name.toUpperCase()) => ({ name, workspace_id: ws, agent_status: status, pane_id: `${ws}:p1`, terminal_title_stripped: title });
const AGENTS = [
  agent("digismith-conductor", "w2"), agent("dgs-462", "w2", "working", "DGS-462 ⚚ state block refresh"), agent("dgs-438", "w2", "idle"),
  agent("d3-worker", "w2"), agent("emkt-817", "w3"), agent("somebody-maestro", "w2"),
];
const GIT = "aaa1111\t2026-10-13T18:50:27+07:00\tfeat(dgs-435): flux\nbbb2222\t2026-10-13T18:51:00+07:00\tchore: bump plugin version\n";

function runner(over: { agents?: unknown[]; git?: { code: number; stdout: string; stderr?: string }; herdrFail?: boolean } = {}): Runner & { calls: string[][] } {
  const calls: string[][] = [];
  const fn = (async (cmd: string, args: string[]) => {
    calls.push([cmd, ...args]);
    if (cmd === "git") return { stderr: "", ...(over.git ?? { code: 0, stdout: GIT }) };
    if (over.herdrFail) return { code: 1, stdout: "", stderr: "boom" };
    return { code: 0, stdout: JSON.stringify({ result: { agents: over.agents ?? AGENTS } }), stderr: "" };
  }) as Runner & { calls: string[][] };
  fn.calls = calls;
  return fn;
}
const opts = (o: object = {}) => ({ project: "DigiSmith", conductor: "digismith-conductor", note, repoDir: repo, herdrWorkspace: "w2", workers: ["dgs-462", "dgs-438"], ...o });
const deps = (r: Runner, over: Partial<RefreshDeps> = {}): RefreshDeps => ({ runner: r, now: () => NOW, env: { DIGISMITH_DEPOT_DIR: path.join(tmp, "depot") }, ticketStatus: async () => "in progress", ...over });
const block = () => parseStateBody(extractBlock(fs.readFileSync(note, "utf-8"), STATE_MARKER).body);

describe("markers", () => {
  it("parses ticket, merged, gone and exists; strips them from the text", () => {
    const m = parseMarkers("Do X [resolves: ticket DGS-411] [resolves: gone a/b.txt]");
    expect(m.resolvers).toEqual([{ kind: "ticket", key: "DGS-411" }, { kind: "gone", path: "a/b.txt" }]);
    expect(m.text).toBe("Do X");
    expect(stripMarkers("Do X [resolves: merged DGS-1]")).toBe("Do X");
  });
  it("refuses absolute and .. paths and unknown kinds", () => {
    expect(parseMarkers("x [resolves: gone /etc/passwd]").malformed).toHaveLength(1);
    expect(parseMarkers("x [resolves: exists ../a]").malformed).toHaveLength(1);
    expect(parseMarkers("x [resolves: soon]").malformed).toHaveLength(1);
  });
});

describe("refreshState: Running", () => {
  it("rebuilds Running from the pinned workspace: owned workers only, leads dropped, others under owner unknown", async () => {
    const r = await refreshState(opts(), deps(runner()));
    expect(r.state.running.map((x) => [x.worker, x.key, x.stage])).toEqual([["dgs-462", "DGS-462", "working"], ["dgs-438", "DGS-438", "idle"]]);
    expect(r.state.ownerUnknown).toEqual(["d3-worker"]);
    const b = block().state;
    expect(b.running).toHaveLength(2);
    expect(b.ownerUnknown).toEqual(["d3-worker"]);
    expect(b.workers).toEqual(["dgs-462", "dgs-438"]);
    expect(b.updated).toBe("2026-10-13T19:00:00+07:00");
  });
  it("reuses the stored --workers list when none is passed", async () => {
    await refreshState(opts(), deps(runner()));
    const r = await refreshState(opts({ workers: undefined }), deps(runner()));
    expect(r.state.running).toHaveLength(2);
  });
  it("owns a pane through its card's under field; since comes from the card, then the old row, then now", async () => {
    const card = (o: object) => ({ card: { role: "worker", started: "2026-10-13T10:00+07:00", under: "digismith-conductor", ...o }, path: "x" });
    const cards = () => [card({ name: "d3-worker", id: "w1", domain: "DigiSmith" }), card({ name: "gone-worker", id: "w2", domain: "DGS-77" }), card({ name: "alien", id: "w3", under: "someone-else" })];
    const r = await refreshState(opts({ workers: ["dgs-438"] }), deps(runner(), { listCards: cards }));
    const rows = Object.fromEntries(r.state.running.map((x) => [x.worker, x]));
    expect(rows["d3-worker"].since).toBe("2026-10-13T10:00+07:00");
    expect(rows["dgs-438"].since).toBe("2026-10-13T19:00:00+07:00");
    expect(rows["gone-worker"]).toMatchObject({ stage: "card open, no pane", key: "DGS-77" });
    expect(rows["alien"]).toBeUndefined();
    expect(r.state.ownerUnknown).toEqual(["dgs-462"]);
    const again = await refreshState(opts({ workers: ["dgs-438"] }), deps(runner(), { now: () => new Date("2026-10-13T13:00:00Z") }));
    expect(again.state.running.find((x) => x.worker === "dgs-438")!.since).toBe("2026-10-13T19:00:00+07:00"); // kept from the old row
  });
  it("keeps the old Running and warns when herdr fails", async () => {
    await refreshState(opts(), deps(runner()));
    const r = await refreshState(opts(), deps(runner({ herdrFail: true })));
    expect(r.state.running).toHaveLength(2);
    expect(r.warnings.join()).toMatch(/herdr agent list failed/);
  });
  it("warns when no workspace is pinned", async () => {
    const r = await refreshState(opts({ herdrWorkspace: undefined }), deps(runner()));
    expect(r.warnings.join()).toMatch(/no herdr workspace pinned/);
  });
});

describe("refreshState: kept parts and markers", () => {
  it("keeps unmarked Waiting, Decided, Parked, Next and seats; drops resolved marked items", async () => {
    const r = await refreshState(opts(), deps(runner(), { ticketStatus: async (k) => (k === "DGS-411" ? "done" : "in progress") }));
    fs.rmSync(path.join(repo, "stray.txt"));
    expect(r.dropped.join("\n")).toMatch(/Next: Do X/);
    expect(r.state.waiting.map((w) => w.question)).toEqual([expect.stringContaining("Remove the stray file"), "Keep this one"]); // file still there at refresh time
    expect(r.state.parked.map((p) => p.what)).toEqual([expect.stringContaining("Parked thing"), "Open thing"]); // DGS-430 not merged
    expect(r.state.next).toEqual(["Do Y"]);
    expect(r.state.decided).toHaveLength(1); // Decided is a log: its marker never drops it
    expect(r.state.seats).toHaveLength(1);
    const r2 = await refreshState(opts(), deps(runner(), { ticketStatus: async () => "in progress" }));
    expect(r2.state.waiting.map((w) => w.question)).toEqual(["Keep this one"]); // file gone now
  });
  it("drops on merged and exists markers", async () => {
    const git = { code: 0, stdout: `${GIT}ccc\t2026-10-13T18:00:00+07:00\tfeat(dgs-430): adapter\n` };
    fs.writeFileSync(note, fs.readFileSync(note, "utf-8").replace("- Open thing | why", "- Open thing [resolves: exists stray.txt] | why"));
    const r = await refreshState(opts(), deps(runner({ git })));
    expect(r.state.parked.map((p) => p.what)).toEqual([]);
  });
  it("needs every marker of an item to hold", async () => {
    fs.writeFileSync(note, fs.readFileSync(note, "utf-8").replace("2. Do Y", "2. Do Y [resolves: gone stray.txt] [resolves: ticket DGS-9]"));
    const r = await refreshState(opts(), deps(runner(), { ticketStatus: async () => "in progress" }));
    expect(r.state.next).toContain("Do Y [resolves: gone stray.txt] [resolves: ticket DGS-9]");
  });
  it("keeps the item and warns on a bad marker, an unreadable ticket, a failed git, a path that leaves the repo", async () => {
    fs.writeFileSync(note, fs.readFileSync(note, "utf-8").replace("2. Do Y", "2. Do Y [resolves: soon]\n3. Z [resolves: ticket DGS-8]\n4. W [resolves: gone link/x]"));
    fs.symlinkSync(os.tmpdir(), path.join(repo, "link"));
    const r = await refreshState(opts(), deps(runner({ git: { code: 1, stdout: "", stderr: "no git" } }), { ticketStatus: async () => undefined }));
    expect(r.state.next).toHaveLength(4);
    expect(r.state.parked).toHaveLength(2);
    const w = r.warnings.join("\n");
    expect(w).toMatch(/bad marker \[resolves: soon\]/);
    expect(w).toMatch(/DGS-8 unreadable/);
    expect(w).toMatch(/git log origin\/main failed/);
    expect(w).toMatch(/leaves the repo/);
  });
  it("creates the block when the note has none, leaves the text outside the block alone, is idempotent and honours --dry-run", async () => {
    fs.writeFileSync(note, "# only text\n");
    const dry = await refreshState(opts({ dryRun: true }), deps(runner()));
    expect(dry.written).toBe(false);
    expect(fs.readFileSync(note, "utf-8")).toBe("# only text\n");
    await refreshState(opts(), deps(runner()));
    const once = fs.readFileSync(note, "utf-8");
    expect(once.startsWith("# only text\n")).toBe(true);
    await refreshState(opts(), deps(runner()));
    expect(fs.readFileSync(note, "utf-8")).toBe(once);
  });
  it("refuses to write over a block it cannot read", async () => {
    fs.writeFileSync(note, fs.readFileSync(note, "utf-8").replace("## Next", "## Nxt"));
    const before = fs.readFileSync(note, "utf-8");
    await expect(refreshState(opts(), deps(runner()))).rejects.toThrow(/not valid, nothing was written/);
    expect(fs.readFileSync(note, "utf-8")).toBe(before);
  });
  it("keeps the text outside the block", async () => {
    await refreshState(opts(), deps(runner()));
    const t = fs.readFileSync(note, "utf-8");
    expect(t.startsWith("# free\ntext\n")).toBe(true);
    expect(t.endsWith("## Session end\nResult: ok\n")).toBe(true);
  });
  it("makes only calls the read-only guard allows", async () => {
    const inner = runner();
    await refreshState(opts(), deps(readOnlyRunner(inner)));
    expect(inner.calls.map((c) => c.slice(0, 4).join(" "))).toEqual(["git log origin/main --max-count=300", "herdr --session default agent"]);
  });
});

describe("a stale block and a newer merge (the ticket's test)", () => {
  it("warns before the refresh; after it Running is rebuilt and the warning is gone", async () => {
    const collect = () => collectState({ project: "DigiSmith", conductor: "digismith-conductor", note, repoDir: repo }, { runner: runner(), now: () => NOW, env: { DIGISMITH_DEPOT_DIR: path.join(tmp, "depot") } });
    const stale = await collect();
    expect(stale.note.stale).toBe(true);
    expect(stale.newestMerge).toEqual({ time: "2026-10-13T18:50:27+07:00", hash: "aaa1111" }); // the version bump does not count
    expect(stale.warnings.join("\n")).toMatch(/older than the newest merge 2026-10-13T18:50:27\+07:00 \(aaa1111\): run state-refresh/);
    expect(stale.running).toEqual([]);
    await refreshState(opts(), deps(runner()));
    const fresh = await collect();
    expect(fresh.note.stale).toBeFalsy();
    expect(fresh.warnings.join("\n")).not.toMatch(/older than the newest merge/);
    expect(fresh.running.map((r) => r.worker)).toEqual(["dgs-462", "dgs-438"]);
    expect(fresh.health.server).toMatch(/owner unknown: d3-worker/);
    expect(fresh.waiting[0].question).not.toMatch(/resolves/); // markers are not shown
  });
});

describe("cli state-refresh", () => {
  it("runs the refresh with --workers and prints the diff", async () => {
    const o = { out: "", err: "" };
    const io: Io & { runner: Runner; ticketStatus: () => Promise<string> } = {
      stdout: (s) => void (o.out += s), stderr: (s) => void (o.err += s), readStdin: async () => "", now: () => NOW,
      env: { DIGISMITH_DEPOT_DIR: path.join(tmp, "depot"), HERDR_WS: "w2" }, runner: runner(), ticketStatus: async () => "in progress",
    };
    const code = await main(["state-refresh", "--note", note, "--repo", repo, "--workers", "dgs-462, dgs-438"], { ...io, listCards: () => [] });
    expect(code).toBe(0);
    expect(o.out).toMatch(/refreshed the state block/);
    expect(o.out).toMatch(/\+ dgs-462 \| DGS-462 \| working/);
    expect(block().state.workers).toEqual(["dgs-462", "dgs-438"]);
  });
});
