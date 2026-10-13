import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { main, type Io } from "./cli.ts";
import { STATE_MARKER, markerLines } from "./state-block.ts";
import { SAMPLE_BODY } from "./test-fixtures.ts";
import type { Runner } from "./runner.ts";

let tmp: string;
let note: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dgs422-cli-"));
  note = path.join(tmp, "note.md");
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function io(stdin = ""): Io & { out: string; err: string } {
  const o = {
    out: "", err: "",
    stdout: (s: string) => { o.out += s; },
    stderr: (s: string) => { o.err += s; },
    readStdin: async () => stdin,
    now: () => new Date("2026-10-13T07:05:00Z"),
    env: { DIGISMITH_DEPOT_DIR: path.join(tmp, "depot") } as NodeJS.ProcessEnv,
  };
  return o;
}
const runner: Runner = async (cmd, args) => {
  if (cmd === "git") return { code: 0, stdout: "a\t2026-10-13T10:00:00+07:00\tfeat(dgs-417): card format\n", stderr: "" };
  if (args.includes("status")) return { code: 0, stdout: "status: running\n", stderr: "" };
  return { code: 0, stdout: JSON.stringify({ result: { tabs: [] } }), stderr: "" };
};
const withNote = () => {
  const m = markerLines(STATE_MARKER);
  fs.writeFileSync(note, `# free\n${m.open}\n${SAMPLE_BODY}${m.close}\n`);
};

describe("cli", () => {
  it("prints usage and exits 1 for no command or an unknown one", async () => {
    for (const argv of [[], ["wat"]]) {
      const i = io();
      expect(await main(argv, { ...i, runner })).toBe(1);
      expect(i.err).toMatch(/Usage:[\s\S]*state[\s\S]*state-write[\s\S]*consult/);
    }
  });
  it("state --json prints the state object", async () => {
    withNote();
    const i = io();
    expect(await main(["state", "--json", "--note", note, "--repo", tmp], { ...i, runner })).toBe(0);
    const s = JSON.parse(i.out);
    expect(s.version).toBe(1);
    expect(s.running).toHaveLength(2);
    expect(s.done[0].key).toBe("DGS-417");
    expect(s.conductor).toBe("digismith-conductor");
  });
  it("state prints the text form by default", async () => {
    withNote();
    const i = io();
    expect(await main(["state", "--note", note, "--repo", tmp], { ...i, runner })).toBe(0);
    expect(i.out).toMatch(/^# Catch-up: digismith-conductor/);
    expect(i.out).toMatch(/## Health/);
  });
  it("state-write writes a validated block from stdin and leaves the rest alone", async () => {
    fs.writeFileSync(note, "# free\n## Session end x\nResult: ok\n");
    const i = io(SAMPLE_BODY);
    expect(await main(["state-write", "--from", "-", "--note", note], { ...i, runner })).toBe(0);
    const t = fs.readFileSync(note, "utf-8");
    expect(t.startsWith("# free\n## Session end x\nResult: ok\n")).toBe(true);
    expect(t).toContain("<!-- digismith:conductor-state v1 -->");
    expect(t).toContain("- dgs-422 | DGS-422 | plan");
  });
  it("state-write accepts a pasted block with its markers, from a file", async () => {
    const m = markerLines(STATE_MARKER);
    const f = path.join(tmp, "b.md");
    fs.writeFileSync(f, `${m.open}\n${SAMPLE_BODY}${m.close}\n`);
    fs.writeFileSync(note, "x\n");
    expect(await main(["state-write", "--from", f, "--note", note], { ...io(), runner })).toBe(0);
    expect(fs.readFileSync(note, "utf-8").match(/digismith:conductor-state v1/g)).toHaveLength(1);
  });
  it("state-write adds Updated when the body has none", async () => {
    fs.writeFileSync(note, "x\n");
    await main(["state-write", "--from", "-", "--note", note], { ...io("## Running\nnone\n"), runner });
    expect(fs.readFileSync(note, "utf-8")).toMatch(/Updated: 2026-10-13T14:05:00\+07:00/);
  });
  it("state-write refuses an invalid block with readable errors and writes nothing", async () => {
    fs.writeFileSync(note, "x\n");
    const i = io("## Running\n- only | two\n");
    expect(await main(["state-write", "--from", "-", "--note", note], { ...i, runner })).toBe(1);
    expect(i.err).toMatch(/line 2/);
    expect(i.err).toMatch(/<worker> \| <KEY>/);
    expect(fs.readFileSync(note, "utf-8")).toBe("x\n");
  });
  it("state-write needs --from", async () => {
    const i = io();
    expect(await main(["state-write", "--note", note], { ...i, runner })).toBe(1);
    expect(i.err).toMatch(/--from/);
  });
  it("consult without --remote answers locally", async () => {
    withNote();
    const i = io();
    expect(await main(["consult", "--note", note, "--repo", tmp], { ...i, runner })).toBe(0);
    expect(i.out).toMatch(/## Running/);
  });
  it("consult --remote goes through the fake runner (ssh) and renders the answer", async () => {
    withNote();
    const local = io();
    await main(["state", "--json", "--note", note, "--repo", tmp], { ...local, runner });
    const calls: string[][] = [];
    const r2: Runner = async (cmd, args) => {
      calls.push([cmd, ...args]);
      return { code: 0, stdout: local.out, stderr: "" };
    };
    const i = io();
    expect(await main(["consult", "--remote", "workbox"], { ...i, runner: r2 })).toBe(0);
    expect(calls[0].slice(0, 6)).toEqual(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "workbox"]);
    expect(i.out).toMatch(/- dgs-422 \| DGS-422 \| plan/);
  });
  it("consult --remote reports an ssh failure and exits 1", async () => {
    const i = io();
    const r: Runner = async () => ({ code: 255, stdout: "", stderr: "Permission denied" });
    expect(await main(["consult", "--remote", "workbox"], { ...i, runner: r })).toBe(1);
    expect(i.err).toMatch(/Permission denied/);
  });
  it("consult --remote with a bad target exits 1 and never runs", async () => {
    let ran = false;
    const r: Runner = async () => { ran = true; return { code: 0, stdout: "", stderr: "" }; };
    const i = io();
    expect(await main(["consult", "--remote", "-oProxyCommand=x"], { ...i, runner: r })).toBe(1);
    expect(ran).toBe(false);
  });
});
