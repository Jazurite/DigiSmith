// scripts/workbox-health/drift-check.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { countDrift, findCheckouts, checkRepo, formatLine, run } from "./drift-check.ts";

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
