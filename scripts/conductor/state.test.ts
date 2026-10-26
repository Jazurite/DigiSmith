import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { collectState, resolveNotePath, type State } from "./state.ts";
import { STATE_MARKER, markerLines } from "./state-block.ts";
import type { Runner } from "./runner.ts";
import { SAMPLE_BODY } from "./test-fixtures.ts";

const NOW = new Date("2026-10-13T07:05:00Z"); // 14:05 UTC+7

let tmp: string;
let depot: string;
let repo: string;
let notePath: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dgs422-state-"));
  depot = path.join(tmp, "depot");
  repo = path.join(tmp, "repo");
  fs.mkdirSync(depot, { recursive: true });
  fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
  fs.mkdirSync(path.join(repo, ".digismith/board/DGS-404—role/worker-dgs-404"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".digismith/board/DGS-404—role/worker-dgs-404/report.html"), "<html>");
  notePath = path.join(tmp, "note.md");
  const m = markerLines(STATE_MARKER);
  fs.writeFileSync(notePath, `# free text\n\n${m.open}\n${SAMPLE_BODY}${m.close}\n\n## Session end x\nResult: ok\n`);
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const GIT = [
  "aaa\t2026-10-13T12:00:00+07:00\tdocs(dgs-404): role architecture design, plan and report",
  "bbb\t2026-10-13T11:00:00+07:00\tchore: bump plugin version",
  "ccc\t2026-10-13T10:00:00+07:00\tfeat(dgs-417): card format",
  "ddd\t2026-10-13T09:00:00+07:00\tdocs(dgs-404): earlier commit",
].join("\n");
const TABS = JSON.stringify({ result: { tabs: [{ tab_id: "w2:t1", label: "conductor" }, { tab_id: "w2:t2", label: "scout" }] } });

function fakeRunner(over: Partial<Record<string, { code: number; stdout: string; stderr?: string } | Error>> = {}): Runner & { calls: string[][] } {
  const calls: string[][] = [];
  const fn = (async (cmd: string, args: string[]) => {
    calls.push([cmd, ...args]);
    const key = cmd === "git" ? "git" : args.includes("status") ? "status" : "tabs";
    const o = over[key];
    if (o instanceof Error) throw o;
    if (o) return { stderr: "", ...o };
    if (key === "git") return { code: 0, stdout: GIT, stderr: "" };
    if (key === "status") return { code: 0, stdout: "status: running\nversion: 0.9.3\n", stderr: "" };
    return { code: 0, stdout: TABS, stderr: "" };
  }) as Runner & { calls: string[][] };
  fn.calls = calls;
  return fn;
}

const base = () => ({ project: "DigiSmith", conductor: "digismith-conductor", note: notePath, repoDir: repo });
const deps = (runner: Runner) => ({ runner, now: () => NOW, env: { DIGISMITH_DEPOT_DIR: depot } });

describe("resolveNotePath", () => {
  it("prefers --note, then env, then conductors.json, then the depot default", () => {
    const env = { DIGISMITH_DEPOT_DIR: depot };
    const args = { project: "DigiSmith", conductor: "digismith-conductor" };
    expect(resolveNotePath({ ...args, note: "/a/b.md" }, { ...env, DIGISMITH_CONDUCTOR_NOTE: "/c.md" })).toBe("/a/b.md");
    expect(resolveNotePath(args, { ...env, DIGISMITH_CONDUCTOR_NOTE: "/c.md" })).toBe("/c.md");
    fs.writeFileSync(path.join(depot, "conductors.json"), JSON.stringify({ "DigiSmith/digismith-conductor": { note: "/d.md" } }));
    expect(resolveNotePath(args, env)).toBe("/d.md");
    fs.rmSync(path.join(depot, "conductors.json"));
    expect(resolveNotePath(args, env)).toBe(path.join(depot, "sessions/DigiSmith/digismith-conductor/note.md"));
  });
  it("ignores a broken conductors.json", () => {
    fs.writeFileSync(path.join(depot, "conductors.json"), "{nope");
    expect(resolveNotePath({ project: "P", conductor: "c" }, { DIGISMITH_DEPOT_DIR: depot })).toBe(path.join(depot, "sessions/P/c/note.md"));
  });
});

describe("collectState", () => {
  it("adds the run limits to Health (DGS-665)", async () => {
    const s = await collectState(base(), deps(fakeRunner()));
    expect(s.health.limits).toMatch(/^builder \d+\/\d+, reviewer \d+\/\d+, role \d+\/\d+$/);
  });
  it("fills every section from the note, git and herdr", async () => {
    const runner = fakeRunner();
    const s = await collectState(base(), deps(runner));
    expect(s.version).toBe(1);
    expect(s.asOf).toBe("2026-10-13T14:05:00+07:00");
    expect(s.note).toMatchObject({ path: notePath, found: true, blockFound: true });
    expect(s.running).toHaveLength(2);
    expect(s.waiting[0].pane).toBe("w2:p5");
    expect(s.decided).toHaveLength(1);
    expect(s.parked).toHaveLength(1);
    expect(s.next).toHaveLength(3);
    expect(s.health.seats[0]).toEqual({ seat: "jack", fiveHourPct: 19, weeklyPct: 59 });
    expect(s.health.server).toBe("running");
    expect(s.health.tabs).toEqual(["w2:t1 conductor", "w2:t2 scout"]);
    expect(s.done).toEqual([
      { key: "DGS-404", line: "role architecture design, plan and report", report: ".digismith/board/DGS-404—role/worker-dgs-404/report.html" },
      { key: "DGS-417", line: "card format" },
    ]);
    expect(s.sources).toMatchObject({ note: "ok", git: "ok", herdr: "ok", clickup: "skipped" });
    expect(s.warnings).toEqual([]);
  });
  it("asks git for origin/main since the window start, defaulting to the start of today UTC+7", async () => {
    const runner = fakeRunner();
    await collectState(base(), deps(runner));
    const git = runner.calls.find((c) => c[0] === "git")!;
    expect(git).toContain("origin/main");
    expect(git).toContain("--since=2026-10-13T00:00:00+07:00");
    const r2 = fakeRunner();
    await collectState({ ...base(), since: "2026-10-12T20:00:00+07:00" }, deps(r2));
    expect(r2.calls.find((c) => c[0] === "git")).toContain("--since=2026-10-12T20:00:00+07:00");
  });
  it("never calls a runner verb outside the read-only set (works through readOnlyRunner)", async () => {
    const { readOnlyRunner } = await import("./runner.ts");
    const s = await collectState(base(), deps(readOnlyRunner(fakeRunner())));
    expect(s.sources.git).toBe("ok");
    expect(s.sources.herdr).toBe("ok");
  });
  it("uses the workspace for the tab list when given", async () => {
    const runner = fakeRunner();
    await collectState({ ...base(), herdrWorkspace: "w2" }, deps(runner));
    expect(runner.calls.find((c) => c.includes("tab"))).toEqual(expect.arrayContaining(["--workspace", "w2"]));
  });
  it("returns empty sections and a warning when the note is missing", async () => {
    const s = await collectState({ ...base(), note: path.join(tmp, "nope.md") }, deps(fakeRunner()));
    expect(s.note).toMatchObject({ found: false, blockFound: false });
    expect(s.sources.note).toBe("missing");
    expect(s.running).toEqual([]);
    expect(s.next).toEqual([]);
    expect(s.warnings.join("\n")).toMatch(/note/i);
    expect(s.done.length).toBe(2); // other sources still answer
  });
  it("warns when the note has no block", async () => {
    fs.writeFileSync(notePath, "# only free text\n");
    const s = await collectState(base(), deps(fakeRunner()));
    expect(s.note).toMatchObject({ found: true, blockFound: false });
    expect(s.warnings.join("\n")).toMatch(/block/i);
  });
  it("passes a bad block's problems through as warnings and keeps the good rows", async () => {
    const m = markerLines(STATE_MARKER);
    fs.writeFileSync(notePath, `${m.open}\n## Running\n- bad\n- w | K | s | since 2026-10-13T13:35+07:00\n${m.close}\n`);
    const s = await collectState(base(), deps(fakeRunner()));
    expect(s.running).toHaveLength(1);
    expect(s.warnings.some((w) => /line 3/.test(w))).toBe(true);
  });
  it("gives a partial answer when git fails", async () => {
    const s = await collectState(base(), deps(fakeRunner({ git: { code: 128, stdout: "", stderr: "fatal" } })));
    expect(s.sources.git).toBe("failed");
    expect(s.done).toEqual([]);
    expect(s.running).toHaveLength(2);
    expect(s.warnings.some((w) => /git/i.test(w))).toBe(true);
  });
  it("gives a partial answer when herdr fails or is missing", async () => {
    const failed = await collectState(base(), deps(fakeRunner({ status: { code: 1, stdout: "", stderr: "no server" }, tabs: { code: 1, stdout: "" } })));
    expect(failed.sources.herdr).toBe("failed");
    expect(failed.health.tabs).toEqual([]);
    expect(failed.health.server).toBe("unknown");
    const missing = await collectState(base(), deps(fakeRunner({ status: { code: 127, stdout: "", stderr: "ENOENT" }, tabs: { code: 127, stdout: "" } })));
    expect(missing.sources.herdr).toBe("skipped");
  });
  it("survives a runner that throws and bad tab JSON", async () => {
    const s = await collectState(base(), deps(fakeRunner({ git: new Error("boom"), tabs: { code: 0, stdout: "not json" } })));
    expect(s.sources.git).toBe("failed");
    expect(s.health.tabs).toEqual([]);
    expect(s.warnings.length).toBeGreaterThan(0);
  });
  it("cross-checks open worker cards against the Running rows", async () => {
    const card = (name: string, domain: string) => ({ card: { name, role: "worker", domain, id: name, status: "open" } as never, path: "x" });
    const listCards = vi.fn(() => [card("dgs-422", "DGS-422"), card("dgs-999", "DGS-999")]);
    const s = await collectState(base(), { ...deps(fakeRunner()), listCards });
    expect(listCards).toHaveBeenCalledWith("DigiSmith", { scope: "open" });
    expect(s.sources.cards).toBe("ok");
    const w = s.warnings.join("\n");
    expect(w).toMatch(/dgs-999.*no row/i);
    expect(w).toMatch(/dgs-417.*no open card/i);
    expect(w).not.toMatch(/dgs-422/);
  });
  it("marks cards as stub when no card reader is available", async () => {
    const s = await collectState(base(), deps(fakeRunner()));
    expect(s.sources.cards).toBe("stub");
  });
  it("does not run any write: the fake runner only sees git and herdr", async () => {
    const runner = fakeRunner();
    await collectState(base(), deps(runner));
    expect(new Set(runner.calls.map((c) => c[0]))).toEqual(new Set(["git", "herdr"]));
  });
});

export type { State };

describe("collectState stale state (DGS-577)", () => {
  const writeBody = (body: string) => {
    const m = markerLines(STATE_MARKER);
    fs.writeFileSync(notePath, `# free\n\n${m.open}\n${body}${m.close}\n`);
  };
  const withHeader = (lines: string) => SAMPLE_BODY.replace(/^Changed:.*\n/m, "").replace("Conductor:", `${lines}Conductor:`);
  const run = async (project = "DigiSmith", runner: Runner = fakeRunner()) => collectState({ ...base(), project }, deps(runner));

  it("warns when the content is 3 days old and not when it is 1 day old", async () => {
    writeBody(withHeader("Changed: 2026-10-10T09:00+07:00\n"));
    expect((await run()).warnings.join("\n")).toMatch(/content unchanged for 3 days/);
    writeBody(withHeader("Changed: 2026-10-12T09:00+07:00\n"));
    expect((await run()).warnings.join("\n")).not.toMatch(/unchanged for/);
  });
  it("flags a Waiting or Running item 3 days old, not 1 day old", async () => {
    writeBody(withHeader("Changed: 2026-10-13T14:00+07:00\n").replace("since 2026-10-13T13:50+07:00 | pane", "since 2026-10-10T09:00+07:00 | pane").replace("dgs-422 | DGS-422 | plan | since 2026-10-13T13:35+07:00", "dgs-422 | DGS-422 | plan | since 2026-10-10T09:00+07:00"));
    const w = (await run()).warnings.join("\n");
    expect(w).toMatch(/Waiting item "Merge DGS-417 now\?" is 3 days old/);
    expect(w).toMatch(/Running item "dgs-422 \| DGS-422" is 3 days old/);
    expect(w).not.toMatch(/dgs-417 \| DGS-417/);
  });
  it("warns when a watch path is newer than Changed, not when older, and when missing", async () => {
    const f = path.join(tmp, "project-note.md");
    fs.writeFileSync(f, "x");
    writeBody(withHeader(`Changed: 2026-10-13T10:00+07:00\nWatch: ${f}, ${path.join(tmp, "nope")}\n`));
    const t = (iso: string) => fs.utimesSync(f, new Date(iso), new Date(iso));
    t("2026-10-13T05:00:00Z"); // 12:00 UTC+7, after Changed
    const newer = (await run()).warnings.join("\n");
    expect(newer).toMatch(/project-note.md changed 2026-10-13T12:00:00\+07:00, after the block content/);
    expect(newer).toMatch(/watch path .*nope not found/);
    t("2026-10-13T01:00:00Z"); // 08:00 UTC+7, before Changed
    expect((await run()).warnings.join("\n")).not.toMatch(/after the block content/);
  });
  it("says the change time is not recorded for an old block", async () => {
    writeBody(withHeader(""));
    const s = await run();
    expect(s.note.changed).toBeUndefined();
    expect(s.warnings.join("\n")).toMatch(/content change time not recorded/);
  });
  it("runs no git for another project or a folder that is not a checkout", async () => {
    const r1 = fakeRunner();
    const s1 = await run("Emma", r1);
    expect(r1.calls.some((c) => c[0] === "git")).toBe(false);
    expect(s1.warnings.join("\n")).not.toMatch(/git log/);
    fs.rmSync(path.join(repo, ".git"), { recursive: true });
    const r2 = fakeRunner();
    const s2 = await run("DigiSmith", r2);
    expect(r2.calls.some((c) => c[0] === "git")).toBe(false);
    expect(s2.warnings.join("\n")).not.toMatch(/git log/);
  });
  it("turns a Running unknown block into one unknown row", async () => {
    writeBody(withHeader("Changed: 2026-10-13T14:00+07:00\nRunning: unknown (why)\n").replace(/^- dgs-4.*\n/gm, "- x\n").replace(/## Running\n(- x\n)+/, "## Running\nnone\n"));
    const s = await run();
    expect(s.running).toEqual([{ worker: "unknown", key: "-", stage: "Running cannot be read: why", since: "2026-10-13T14:05+07:00" }]);
  });
});
