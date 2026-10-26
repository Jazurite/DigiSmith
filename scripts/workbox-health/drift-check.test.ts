// scripts/workbox-health/drift-check.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { countDrift, findCheckouts, checkRepo, formatLine, run, runSweep, changedRepos, sweepAlarmLines, countSweepRepo, REPO_LIMIT_MS, type SweepState, type SweepRepo } from "./drift-check.ts";

let tmp: string;
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" });
const put = (cwd: string, f: string, t: string | Buffer) => { fs.mkdirSync(path.dirname(path.join(cwd, f)), { recursive: true }); fs.writeFileSync(path.join(cwd, f), t); };

// a repo configured like the Workbox (DGS-478): autocrlf=input, fileMode=false
function mkRepo(name = "repo"): string {
  const r = path.join(tmp, name);
  fs.mkdirSync(r, { recursive: true });
  git(r, "init", "-q");
  git(r, "config", "user.email", "t@t"); git(r, "config", "user.name", "t");
  git(r, "config", "core.autocrlf", "input"); git(r, "config", "core.fileMode", "false");
  put(r, "crlf.txt", "a\nb\n"); put(r, "real.txt", "x\n"); put(r, "both.txt", "x\ny\n"); put(r, "mode.sh", "echo\n");
  put(r, "bin.dat", Buffer.from([0, 1, 2, 3]));
  git(r, "add", "."); git(r, "commit", "-qm", "init");
  return r;
}
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dgs498-")); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("countDrift", () => {
  it("clean repo: 0 and 0", () => { expect(countDrift(mkRepo())).toEqual({ eol: 0, mode: 0 }); });
  it("CRLF only counts as eol", () => {
    const r = mkRepo(); put(r, "crlf.txt", "a\r\nb\r\n");
    expect(countDrift(r)).toEqual({ eol: 1, mode: 0 });
  });
  it("a real change is not drift", () => {
    const r = mkRepo(); put(r, "real.txt", "changed\n");
    expect(countDrift(r)).toEqual({ eol: 0, mode: 0 });
  });
  it("CRLF plus a real edit is not drift", () => {
    const r = mkRepo(); put(r, "both.txt", "x\r\nz\r\n");
    expect(countDrift(r)).toEqual({ eol: 0, mode: 0 });
  });
  it("mode only counts as mode, although fileMode=false in the repo", () => {
    const r = mkRepo(); fs.chmodSync(path.join(r, "mode.sh"), 0o755);
    expect(countDrift(r)).toEqual({ eol: 0, mode: 1 });
  });
  it("mixed: 1 eol, 1 mode, real changes ignored", () => {
    const r = mkRepo(); put(r, "crlf.txt", "a\r\nb\r\n"); put(r, "real.txt", "c\n"); fs.chmodSync(path.join(r, "mode.sh"), 0o755);
    expect(countDrift(r)).toEqual({ eol: 1, mode: 1 });
  });
  it("a changed binary file and a deleted file are real changes", () => {
    const r = mkRepo(); put(r, "bin.dat", Buffer.from([9, 9, 9])); fs.rmSync(path.join(r, "real.txt"));
    expect(countDrift(r)).toEqual({ eol: 0, mode: 0 });
  });
  it("a file with content change and mode change is not counted as mode", () => {
    const r = mkRepo(); put(r, "mode.sh", "echo 2\n"); fs.chmodSync(path.join(r, "mode.sh"), 0o755);
    expect(countDrift(r)).toEqual({ eol: 0, mode: 0 });
  });
  it("is read-only: HEAD, index and config are unchanged", () => {
    const r = mkRepo(); put(r, "crlf.txt", "a\r\nb\r\n");
    const snap = () => [git(r, "rev-parse", "HEAD"), fs.readFileSync(path.join(r, ".git/index")).toString("hex"), fs.readFileSync(path.join(r, ".git/config"), "utf8")];
    const before = snap(); countDrift(r);
    expect(snap()).toEqual(before);
  });
  it("throws on a folder that is not a repo", () => {
    const d = path.join(tmp, "plain"); fs.mkdirSync(d);
    expect(() => countDrift(d)).toThrow();
  });
});


describe("findCheckouts", () => {
  it("finds repos and linked worktrees, skips node_modules and .debris", () => {
    const r = mkRepo("proj");
    git(r, "worktree", "add", "-q", path.join(r, ".worktrees", "wt"), "-b", "wt");
    mkRepo("node_modules/dep"); mkRepo(".debris/old");
    const got = findCheckouts(tmp).map((p) => path.relative(tmp, p));
    expect(got).toEqual(["proj", path.join("proj", ".worktrees", "wt")]);
  });
  it("a .git file with a missing gitdir is a broken link, with no crash", () => {
    const d = path.join(tmp, "dead"); fs.mkdirSync(d); fs.writeFileSync(path.join(d, ".git"), "gitdir: ../nowhere\n");
    expect(checkRepo(d)).toMatchObject({ eol: 0, mode: 0, broken: "../nowhere" });
  });
});

describe("formatLine", () => {
  const base = { repo: "", broken: null, error: null };
  it("prints nothing for a clean repo", () => { expect(formatLine({ ...base, repo: "/r/a", eol: 0, mode: 0 }, "/r")).toBeNull(); });
  it("uses a path relative to the root", () => { expect(formatLine({ ...base, repo: "/r/a/b", eol: 3, mode: 1 }, "/r")).toBe("a/b: 3 eol, 1 mode"); });
  it("keeps a path outside the root absolute", () => { expect(formatLine({ ...base, repo: "/x/a", eol: 1, mode: 0 }, "/r")).toBe("/x/a: 1 eol, 0 mode"); });
  it("names a broken link and a failed check", () => {
    expect(formatLine({ ...base, repo: "/r/a", eol: 0, mode: 0, broken: "../nowhere" }, "/r")).toBe("a: broken git link (../nowhere)");
    expect(formatLine({ ...base, repo: "/r/a", eol: 0, mode: 0, error: "timeout" }, "/r")).toBe("a: check failed (timeout)");
  });
});

describe("run", () => {
  const go = (argv: string[], env: NodeJS.ProcessEnv = { DIGISMITH_DEPOT_DIR: path.join(tmp, "depot") }) => {
    const lines: string[] = []; const code = run(argv, env, (s) => lines.push(s)); return { code, lines };
  };
  it("exit 0 and no output when clean; one CSV line per repo", () => {
    mkRepo("a"); mkRepo("b");
    const { code, lines } = go(["--root", tmp]);
    expect(code).toBe(0); expect(lines).toEqual([]);
    const csv = fs.readFileSync(path.join(tmp, "depot/observability/drift.csv"), "utf8").trim().split("\n");
    expect(csv[0]).toBe("time_utc7,repo,eol,mode,note");
    expect(csv).toHaveLength(3);
    expect(csv[1]).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,a,0,0,$/);
  });
  it("exit 1 and a line for a drifting repo", () => {
    const r = mkRepo("a"); put(r, "crlf.txt", "a\r\nb\r\n");
    const { code, lines } = go(["--root", tmp]);
    expect(code).toBe(1); expect(lines).toEqual(["a: 1 eol, 0 mode"]);
  });
  it("--no-log writes no CSV", () => {
    mkRepo("a"); go(["--root", tmp, "--no-log"]);
    expect(fs.existsSync(path.join(tmp, "depot/observability/drift.csv"))).toBe(false);
  });
  it("--json lists every checkout, clean ones too", () => {
    mkRepo("a"); const r = mkRepo("b"); put(r, "crlf.txt", "a\r\nb\r\n");
    const { lines } = go(["--root", tmp, "--json", "--no-log"]);
    expect(JSON.parse(lines.join("\n"))).toEqual([
      { repo: path.join(tmp, "a"), eol: 0, mode: 0, broken: null, error: null },
      { repo: path.join(tmp, "b"), eol: 1, mode: 0, broken: null, error: null },
    ]);
  });
  it("--repo checks one checkout, found from a subfolder", () => {
    const r = mkRepo("a"); put(r, "crlf.txt", "a\r\nb\r\n"); mkRepo("b");
    const { code, lines } = go(["--repo", path.join(r, ".git/.."), "--no-log"]);
    expect(code).toBe(1); expect(lines).toHaveLength(1);
  });
  it("a failed check is reported, not clean, with a CSV note", () => {
    const d = path.join(tmp, "bad"); fs.mkdirSync(path.join(d, ".git"), { recursive: true });
    const { code, lines } = go(["--root", tmp]);
    expect(code).toBe(1); expect(lines[0]).toMatch(/^bad: check failed \(/);
    expect(fs.readFileSync(path.join(tmp, "depot/observability/drift.csv"), "utf8")).toContain(",bad,,,check-failed");
  });
});

describe("--alarm", () => {
  const alarm = (cwd: string) => {
    const lines: string[] = []; const code = run(["--alarm", "--repo", cwd], { DIGISMITH_DEPOT_DIR: path.join(tmp, "depot") }, (s) => lines.push(s)); return { code, lines };
  };
  it("is silent on a clean checkout and exits 0", () => { expect(alarm(mkRepo())).toEqual({ code: 0, lines: [] }); });
  it("prints exactly one line on drift, exits 0, writes no CSV", () => {
    const r = mkRepo(); put(r, "crlf.txt", "a\r\nb\r\n"); fs.chmodSync(path.join(r, "mode.sh"), 0o755);
    const { code, lines } = alarm(r);
    expect(code).toBe(0);
    expect(lines).toEqual([`DigiSmith: drift alarm: ${fs.realpathSync(r)} 1 eol, 1 mode (DGS-498)`]);
    expect(fs.existsSync(path.join(tmp, "depot/observability/drift.csv"))).toBe(false);
  });
  it("is silent outside a git checkout", () => {
    const d = path.join(tmp, "plain"); fs.mkdirSync(d);
    expect(alarm(d)).toEqual({ code: 0, lines: [] });
  });
  it("is silent on a broken link or a failed check, and still exits 0", () => {
    const d = path.join(tmp, "dead"); fs.mkdirSync(d); fs.writeFileSync(path.join(d, ".git"), "gitdir: ../nowhere\n");
    expect(alarm(d)).toEqual({ code: 0, lines: [] });
  });
});

describe("hooks.json", () => {
  it("has the alarm in SessionStart with --alarm --repo \"$PWD\"", () => {
    const hooks = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "..", "hooks", "hooks.json"), "utf8")).hooks;
    const cmds: string[] = hooks.SessionStart.flatMap((g: { hooks: { command: string }[] }) => g.hooks.map((h) => h.command));
    expect(cmds.filter((c) => c.includes("workbox-health/drift-check.ts"))).toEqual([
      'node --experimental-strip-types "${CLAUDE_PLUGIN_ROOT}/scripts/workbox-health/drift-check.ts" --alarm --repo "$PWD"',
    ]);
  });
});

describe("sweep", () => {
  const depot = () => path.join(tmp, "depot", "observability");
  const stateFile = () => path.join(depot(), "drift-sweep.json");
  const csvFile = () => path.join(depot(), "drift.csv");
  const sweepOnce = (count = countSweepRepo, at = "2026-10-26T07:05:00Z") =>
    runSweep({ root: tmp, stateFile: stateFile(), csvFile: csvFile(), now: () => new Date(at), count });
  const csvRows = () => fs.readFileSync(csvFile(), "utf8").trim().split("\n").slice(1);
  // the sweep root is tmp, so keep the depot out of it
  beforeEach(() => { tmp = path.join(tmp, "ws"); fs.mkdirSync(tmp); fs.mkdirSync(path.join(path.dirname(tmp), "depot"), { recursive: true }); });
  function world() {
    const a = mkRepo("a"); put(a, "crlf.txt", "a\r\nb\r\n");
    const b = mkRepo("b"); fs.chmodSync(path.join(b, "mode.sh"), 0o755);
    mkRepo("clean");
    const d = path.join(tmp, "dead"); fs.mkdirSync(d); fs.writeFileSync(path.join(d, ".git"), "gitdir: ../nowhere\n");
    return { a, b };
  }

  it("holds every repo in the result and the state file", () => {
    world();
    const state = sweepOnce();
    expect(state.repos.map((r) => [r.repo, r.eol, r.mode, r.broken])).toEqual([
      ["a", 1, 0, false], ["b", 0, 1, false], ["clean", 0, 0, false], ["dead", null, null, true],
    ]);
    expect(state.ranAtUtc7).toBe("2026-10-26 14:05:00");
    expect(JSON.parse(fs.readFileSync(stateFile(), "utf8"))).toEqual(state);
    expect(fs.existsSync(stateFile() + ".tmp")).toBe(false);
  });
  it("first sweep writes drifting and broken repos only", () => {
    world(); sweepOnce();
    expect(csvRows()).toEqual([
      "2026-10-26 14:05:00,a,1,0,sweep", "2026-10-26 14:05:00,b,0,1,sweep", "2026-10-26 14:05:00,dead,,,broken-link",
    ]);
  });
  it("an unchanged second sweep writes nothing", () => {
    world(); sweepOnce(); sweepOnce(countSweepRepo, "2026-10-26T07:15:00Z");
    expect(csvRows()).toHaveLength(3);
  });
  it("a recovery writes one sweep:recovered line", () => {
    const { a } = world(); sweepOnce();
    put(a, "crlf.txt", "a\nb\n");
    sweepOnce(countSweepRepo, "2026-10-26T07:15:00Z");
    expect(csvRows().slice(3)).toEqual(["2026-10-26 14:15:00,a,0,0,sweep:recovered"]);
  });
  it("a changed count writes one line", () => {
    const { a } = world(); sweepOnce();
    put(a, "both.txt", "x\r\ny\r\n"); put(a, "real.txt", "x\r\n");
    sweepOnce(countSweepRepo, "2026-10-26T07:15:00Z");
    expect(csvRows().slice(3)).toEqual(["2026-10-26 14:15:00,a,3,0,sweep"]);
  });
  it("a repo that times out is noted and the others still run", () => {
    world();
    const slow = (repo: string, limit: number): SweepRepo =>
      path.basename(repo) === "a"
        ? { repo, eol: null, mode: null, broken: false, note: "timeout" }
        : countSweepRepo(repo, limit);
    const state = sweepOnce(slow);
    expect(state.repos.find((r) => r.repo === "a")).toMatchObject({ note: "timeout", eol: null });
    expect(state.repos.find((r) => r.repo === "b")).toMatchObject({ eol: 0, mode: 1 });
    expect(csvRows()).toContain("2026-10-26 14:05:00,a,,,timeout");
  });
  it("a throwing count is a failed check, not a failed sweep", () => {
    world();
    const state = sweepOnce((repo, l) => { if (path.basename(repo) === "a") throw new Error("boom"); return countSweepRepo(repo, l); });
    expect(state.repos[0]).toMatchObject({ repo: "a", note: "check-failed" });
    expect(state.repos[1].eol).toBe(0);
  });
  it("passes the per-repo limit to the counter", () => {
    mkRepo("a"); const seen: number[] = [];
    sweepOnce((repo, l) => { seen.push(l); return countSweepRepo(repo, l); });
    expect(seen).toEqual([REPO_LIMIT_MS]);
  });
  it("a real git call over the limit is reported as timeout", () => {
    const r = mkRepo("a");
    expect(countSweepRepo(r, 0)).toMatchObject({ repo: r, note: "timeout", eol: null });
  });
  it("changedRepos: first sweep skips a clean repo; unreadable state counts as first", () => {
    const st = (repos: SweepRepo[]): SweepState => ({ ranAt: "", ranAtUtc7: "", repos });
    const clean = { repo: "c", eol: 0, mode: 0, broken: false, note: "" };
    const bad = { repo: "d", eol: 2, mode: 0, broken: false, note: "" };
    expect(changedRepos(null, st([clean, bad])).map((c) => [c.repo.repo, c.note])).toEqual([["d", "sweep"]]);
  });

  describe("CLI", () => {
    const go = (argv: string[]) => { const lines: string[] = []; const code = run(argv, { DIGISMITH_DEPOT_DIR: path.join(path.dirname(tmp), "depot") }, (s) => lines.push(s)); return { code, lines }; };
    it("exit 0 with drift, prints the drift lines, writes state and CSV", () => {
      world();
      const { code, lines } = go(["--sweep", "--root", tmp]);
      expect(code).toBe(0);
      expect(lines).toEqual(["a: 1 eol, 0 mode", "b: 0 eol, 1 mode", "dead: broken git link (../nowhere)"]);
      expect(fs.existsSync(path.join(path.dirname(tmp), "depot/observability/drift-sweep.json"))).toBe(true);
    });
    it("exit 1 when the root is missing", () => {
      expect(go(["--sweep", "--root", path.join(tmp, "nope")]).code).toBe(1);
    });
    it("is read-only: HEAD, index and config of every repo are unchanged", () => {
      const { a, b } = world();
      const snap = (r: string) => [git(r, "rev-parse", "HEAD"), fs.readFileSync(path.join(r, ".git/index")).toString("hex"), fs.readFileSync(path.join(r, ".git/config"), "utf8")];
      const before = [snap(a), snap(b)];
      go(["--sweep", "--root", tmp]);
      expect([snap(a), snap(b)]).toEqual(before);
    });
  });
});

describe("sweepAlarmLines", () => {
  const now = new Date("2026-10-26T07:30:00Z");
  const repo = (name: string, eol: number, mode = 0): SweepRepo => ({ repo: name, eol, mode, broken: false, note: "" });
  const state = (repos: SweepRepo[], ranAt = "2026-10-26T07:05:00Z"): SweepState => ({ ranAt, ranAtUtc7: "2026-10-26 14:05:00", repos });
  it("names another drifting repo", () => {
    expect(sweepAlarmLines(state([repo("Emma/shopify-dev", 2), repo("x", 0)]), "cur", now))
      .toEqual(["DigiSmith: drift alarm (sweep 14:05 UTC+7): Emma/shopify-dev 2 eol, 0 mode  (DGS-557)"]);
  });
  it("names five repos, then and <k> more", () => {
    const repos = Array.from({ length: 7 }, (_, i) => repo(`r${i}`, 1));
    const [line] = sweepAlarmLines(state(repos), "cur", now);
    expect(line).toContain("r4 1 eol, 0 mode; and 2 more  (DGS-557)");
    expect(line).not.toContain("r5");
  });
  it("names a broken link", () => {
    const s = state([{ repo: "dead", eol: null, mode: null, broken: true, note: "broken-link" }]);
    expect(sweepAlarmLines(s, "cur", now)[0]).toContain("dead broken git link");
  });
  it("does not repeat the current repo", () => { expect(sweepAlarmLines(state([repo("cur", 3)]), "cur", now)).toEqual([]); });
  it("prints nothing when all is clean and fresh", () => { expect(sweepAlarmLines(state([repo("a", 0)]), "cur", now)).toEqual([]); });
  it("prints the stale line when the state is older than 60 minutes", () => {
    expect(sweepAlarmLines(state([repo("a", 0)]), "cur", new Date("2026-10-26T08:06:00Z")))
      .toEqual(["DigiSmith: drift sweep has not run since 2026-10-26 14:05 UTC+7 (job drift-sweep)"]);
  });
  it("prints nothing without a state", () => { expect(sweepAlarmLines(null, "cur", now)).toEqual([]); });
});

describe("--alarm with sweep state", () => {
  const alarm = (cwd: string) => {
    const lines: string[] = []; const code = run(["--alarm", "--repo", cwd], { DIGISMITH_DEPOT_DIR: path.join(tmp, "depot") }, (s) => lines.push(s)); return { code, lines };
  };
  const writeState = (text: string) => { const f = path.join(tmp, "depot/observability/drift-sweep.json"); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  it("prints its own line first, then the sweep line; writes no CSV", () => {
    const r = mkRepo("cur"); put(r, "crlf.txt", "a\r\nb\r\n");
    writeState(JSON.stringify({ ranAt: new Date().toISOString(), ranAtUtc7: "2026-10-26 14:05:00", root: tmp, repos: [
      { repo: "cur", eol: 1, mode: 0, broken: false, note: "" }, { repo: "other", eol: 2, mode: 0, broken: false, note: "" } ] }));
    const { code, lines } = alarm(r);
    expect(code).toBe(0);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("(DGS-498)");
    expect(lines[1]).toBe("DigiSmith: drift alarm (sweep 14:05 UTC+7): other 2 eol, 0 mode  (DGS-557)");
    expect(fs.existsSync(path.join(tmp, "depot/observability/drift.csv"))).toBe(false);
  });
  it("is silent and exits 0 on broken JSON or a missing file", () => {
    const r = mkRepo("cur");
    expect(alarm(r)).toEqual({ code: 0, lines: [] });
    writeState("{not json");
    expect(alarm(r)).toEqual({ code: 0, lines: [] });
  });
});
