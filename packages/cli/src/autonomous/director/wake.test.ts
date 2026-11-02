import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { readFileSync as read } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExecOut } from "../observers-real.ts";
import { readEvents } from "../state.ts";
import type { Plan } from "./plan.ts";
import { wakeDirector, type WakeDeps } from "./wake.ts";

const FIX = (n: string): string => read(join(__dirname, "..", "fixtures", n), "utf8");
const EMPTY = FIX("input-box-empty.ansi");
const TYPED = FIX("input-box-typed.ansi");
const SUGGESTION = FIX("input-box-suggestion.ansi");
const agents = (status: string, pane = "p1", name = "director"): string => JSON.stringify({ result: { agents: [{ name, agent_status: status, pane_id: pane }] } });

let dir: string;
let now: Date;
let calls: { file: string; args: string[]; env?: NodeJS.ProcessEnv }[];
let list: string | Error;
let pane: string | Error;
let promptFails: boolean;
const NOW = new Date("2026-11-03T03:00:00.000Z");
const plan = (hash = "h1", wake = true): Plan => ({ moves: [], shown: [], wake, hash });

const exec: ExecOut = async (file, args, opts) => {
  calls.push({ file, args, env: opts?.env });
  if (args.includes("list")) { if (list instanceof Error) throw list; return { stdout: list }; }
  if (args.includes("read")) { if (pane instanceof Error) throw pane; return { stdout: pane }; }
  if (args.includes("prompt")) { if (promptFails) throw new Error("exit 1"); return { stdout: "" }; }
  return { stdout: "" };
};
const deps = (over: Partial<WakeDeps> = {}): WakeDeps => ({ dir, now: () => now, exec, herdrBin: "/bin/herdr-ws", target: () => ({ agent: "director", session: "Castle" }), ...over });
const sent = () => calls.filter((c) => c.args.includes("prompt"));
const tick = () => JSON.parse(readFileSync(join(dir, "director", "last-tick.json"), "utf8"));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "director-"));
  now = NOW; calls = []; list = agents("idle"); pane = EMPTY; promptFails = false;
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("wakeDirector", () => {
  it("sends 'Director tick: dg director plan' when the plan wakes, the pane exists, is not working and the input box is empty", async () => {
    expect(await wakeDirector(deps(), plan())).toBe("sent");
    expect(sent()).toHaveLength(1);
    expect(sent()[0].args).toEqual(["--session", "Castle", "agent", "prompt", "director", "Director tick: dg director plan"]);
    expect(sent()[0].file).toBe("/bin/herdr-ws");
    expect(tick()).toMatchObject({ hash: "h1", at: NOW.toISOString() });
    expect(readEvents(dir, NOW.getTime() - 1000, NOW.getTime() + 1000).map((e) => e.kind)).toEqual(["director-tick"]);
  });
  it("passes the workspace and scope in the environment when the target has them", async () => {
    await wakeDirector(deps({ target: () => ({ agent: "director", session: "Castle", workspace: "w9", scope: "Castle/Factory" }) }), plan());
    expect(sent()[0].env).toMatchObject({ HERDR_WS: "w9", HERDR_SCOPE: "Castle/Factory" });
  });
  it("a default session sends no --session flag", async () => {
    await wakeDirector(deps({ target: () => ({ agent: "director", session: "default" }) }), plan());
    expect(sent()[0].args).toEqual(["agent", "prompt", "director", "Director tick: dg director plan"]);
  });
  it("sends nothing when the plan does not wake", async () => {
    expect(await wakeDirector(deps(), plan("", false))).toBe("none");
    expect(calls).toEqual([]);
  });
  it("sends nothing and returns none when no Director is configured", async () => {
    expect(await wakeDirector(deps({ target: () => null }), plan())).toBe("none");
    expect(calls).toEqual([]);
  });
  it("sends nothing when the pane is missing", async () => {
    list = agents("idle", "p1", "someone-else");
    expect(await wakeDirector(deps(), plan())).toBe("skipped");
    list = JSON.stringify({ result: { agents: [{ name: "director", agent_status: "idle", pane_id: "" }] } });
    expect(await wakeDirector(deps(), plan())).toBe("skipped");
    expect(sent()).toEqual([]);
  });
  it("sends nothing when the Director is working", async () => {
    list = agents("working");
    expect(await wakeDirector(deps(), plan())).toBe("skipped");
    expect(sent()).toEqual([]);
  });
  it("sends nothing when the input box has typed text, a suggestion, or cannot be read", async () => {
    for (const p of [TYPED, SUGGESTION, "garbage with no prompt", new Error("pane read failed")]) {
      pane = p;
      expect(await wakeDirector(deps(), plan())).toBe("skipped");
    }
    expect(sent()).toEqual([]);
  });
  it("the same hash is not sent again within 10 minutes; a new hash is; the same hash after 10 minutes is", async () => {
    expect(await wakeDirector(deps(), plan("h1"))).toBe("sent");
    now = new Date(NOW.getTime() + 9 * 60_000);
    expect(await wakeDirector(deps(), plan("h1"))).toBe("skipped");
    expect(await wakeDirector(deps(), plan("h2"))).toBe("sent");
    now = new Date(NOW.getTime() + 20 * 60_000);
    expect(await wakeDirector(deps(), plan("h2"))).toBe("sent");
    expect(sent()).toHaveLength(3);
  });
  it("a failing exec never throws out of wake", async () => {
    list = new Error("herdr missing");
    expect(await wakeDirector(deps(), plan())).toBe("skipped");
    list = "not json";
    expect(await wakeDirector(deps(), plan())).toBe("skipped");
    list = agents("idle");
    promptFails = true;
    expect(await wakeDirector(deps(), plan())).toBe("skipped");
    expect(() => readFileSync(join(dir, "director", "last-tick.json"))).toThrow();   // a failed send is not remembered
    promptFails = false;
    expect(await wakeDirector(deps(), plan())).toBe("sent");
  });
  it("F3: the prompt is out, then the state write fails: still sent, and an event is still tried", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, "director", "last-tick.json"), { recursive: true });   // the state file is a directory: the write fails
    expect(await wakeDirector(deps(), plan())).toBe("sent");
    expect(sent()).toHaveLength(1);
  });
  it("a damaged last-tick.json does not stop the wake", async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(dir, "director"), { recursive: true });
    writeFileSync(join(dir, "director", "last-tick.json"), "{nope");
    expect(await wakeDirector(deps(), plan())).toBe("sent");
  });
});
