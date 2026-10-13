import { describe, it, expect, vi } from "vitest";
import { consult, parseRemoteState, renderText } from "./consult.ts";
import type { State } from "./state.ts";
import type { Runner } from "./runner.ts";

const STATE: State = {
  version: 1, project: "DigiSmith", conductor: "digismith-conductor", asOf: "2026-10-13T14:05:00+07:00",
  note: { path: "/n.md", found: true, blockFound: true },
  done: [{ key: "DGS-404", line: "design", report: "r.html" }],
  running: [{ worker: "dgs-422", key: "DGS-422", stage: "plan", since: "2026-10-13T13:35:00+07:00" }],
  waiting: [], decided: [], parked: [], next: ["a", "b", "c"],
  health: { seats: [{ seat: "jack", fiveHourPct: 19, weeklyPct: 59 }], server: "running", tabs: ["w2:t1 conductor"] },
  sources: { note: "ok", cards: "ok", git: "ok", herdr: "ok", clickup: "skipped" },
  warnings: [],
};

describe("parseRemoteState", () => {
  it("accepts a valid state", () => expect(parseRemoteState(JSON.stringify(STATE))).toEqual(STATE));
  it("rejects invalid JSON", () => expect(() => parseRemoteState("nope")).toThrow(/not valid json/i));
  it("rejects a wrong version", () => expect(() => parseRemoteState(JSON.stringify({ ...STATE, version: 2 }))).toThrow(/version/i));
  it("rejects a missing section", () => {
    const { running, ...rest } = STATE;
    void running;
    expect(() => parseRemoteState(JSON.stringify(rest))).toThrow(/running/);
  });
  it("tolerates leading noise before the JSON line (ssh banners)", () => {
    expect(parseRemoteState(`Welcome\n${JSON.stringify(STATE)}\n`)).toEqual(STATE);
  });
});

describe("renderText", () => {
  it("prints the seven sections in the fixed order and none for empty ones", () => {
    const t = renderText(STATE);
    const heads = [...t.matchAll(/^## (.*)$/gm)].map((m) => m[1]);
    expect(heads).toEqual(["Done", "Running", "Waiting for Jack", "Decided under the mandate", "Parked or failed", "Next", "Health"]);
    expect(t).toMatch(/## Waiting for Jack\nnone/);
    expect(t).toMatch(/- DGS-404: design\. Report: r\.html/);
    expect(t).toMatch(/- dgs-422 \| DGS-422 \| plan \| since 2026-10-13 13:35 UTC\+7/);
    expect(t).toMatch(/1\. a\n2\. b\n3\. c/);
    expect(t).toMatch(/- Seats and usage: jack: 5h 19%, weekly 59%/);
    expect(t).toMatch(/- Open tabs: 1: w2:t1 conductor/);
  });
  it("lists warnings and degraded sources at the end", () => {
    const t = renderText({ ...STATE, warnings: ["git log failed"], sources: { ...STATE.sources, git: "failed" } });
    expect(t).toMatch(/Warnings/);
    expect(t).toMatch(/git log failed/);
  });
});

describe("consult", () => {
  const remote = { remote: "workbox", remoteRepo: "$HOME/Workspace/Jazurite/DigiSmith", project: "DigiSmith", conductor: "digismith-conductor" };
  it("runs the fixed ssh command and returns the remote state", async () => {
    const runner = vi.fn(async () => ({ code: 0, stdout: JSON.stringify(STATE), stderr: "" })) as unknown as Runner;
    const s = await consult(remote, { runner, local: async () => { throw new Error("no local"); } });
    expect(s.state).toEqual(STATE);
    expect(runner).toHaveBeenCalledWith("ssh", [
      "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "workbox",
      "node", "--experimental-strip-types", "$HOME/Workspace/Jazurite/DigiSmith/scripts/conductor/cli.ts",
      "state", "--json", "--project", "DigiSmith", "--conductor", "digismith-conductor",
    ], expect.objectContaining({ timeoutMs: expect.any(Number) }));
  });
  it("without --remote it collects locally and never calls ssh", async () => {
    const runner = vi.fn() as unknown as Runner;
    const local = vi.fn(async () => STATE);
    const s = await consult({ project: "DigiSmith", conductor: "digismith-conductor" }, { runner, local });
    expect(s.state).toEqual(STATE);
    expect(runner).not.toHaveBeenCalled();
  });
  it("fails clearly on a non-zero exit, with the ssh stderr", async () => {
    const runner = (async () => ({ code: 255, stdout: "", stderr: "Permission denied (publickey)" })) as Runner;
    await expect(consult(remote, { runner, local: async () => STATE })).rejects.toThrow(/ssh.*255.*Permission denied/s);
  });
  it("fails clearly on a timeout and on a missing script", async () => {
    const t = (async () => ({ code: 124, stdout: "", stderr: "timed out after 30000 ms" })) as Runner;
    await expect(consult(remote, { runner: t, local: async () => STATE })).rejects.toThrow(/timed out/);
    const m = (async () => ({ code: 1, stdout: "", stderr: "Cannot find module" })) as Runner;
    await expect(consult(remote, { runner: m, local: async () => STATE })).rejects.toThrow(/Cannot find module/);
  });
  it("fails on invalid JSON from the remote", async () => {
    const runner = (async () => ({ code: 0, stdout: "<html>", stderr: "" })) as Runner;
    await expect(consult(remote, { runner, local: async () => STATE })).rejects.toThrow(/not valid json/i);
  });
  it("refuses a bad target before running anything", async () => {
    const runner = vi.fn() as unknown as Runner;
    await expect(consult({ ...remote, remote: "-oProxyCommand=x" }, { runner, local: async () => STATE })).rejects.toThrow(/refused/i);
    expect(runner).not.toHaveBeenCalled();
  });
  it("adds the live pane list with --machine, through herdr --machine agent list", async () => {
    const live = JSON.stringify({ result: { agents: [{ name: "digismith-conductor", pane_id: "w2:p1", agent_status: "working" }] } });
    const runner = vi.fn(async (cmd: string) =>
      cmd === "ssh" ? { code: 0, stdout: JSON.stringify(STATE), stderr: "" } : { code: 0, stdout: live, stderr: "" }) as unknown as Runner;
    const s = await consult({ ...remote, machine: "workbox" }, { runner, local: async () => STATE });
    expect(runner).toHaveBeenCalledWith("herdr", ["--machine", "workbox", "agent", "list"], expect.anything());
    expect(s.live).toEqual([{ pane: "w2:p1", name: "digismith-conductor", status: "working" }]);
  });
  it("a failing live read only adds a warning", async () => {
    const runner = vi.fn(async (cmd: string) =>
      cmd === "ssh" ? { code: 0, stdout: JSON.stringify(STATE), stderr: "" } : { code: 1, stdout: "", stderr: "unknown machine" }) as unknown as Runner;
    const s = await consult({ ...remote, machine: "x" }, { runner, local: async () => STATE });
    expect(s.state).toEqual(STATE);
    expect(s.warnings.join()).toMatch(/live/i);
  });
});
