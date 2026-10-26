import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";

import * as os from "node:os";
import * as path from "node:path";
import { findAuto, startAuto } from "./auto.ts";
import { appendEvent } from "./events.ts";
import { readRun } from "./record.ts";

const failWrite = vi.hoisted(() => ({ once: false }));
vi.mock("node:fs", async (orig) => {
  const real = await orig<typeof import("node:fs")>();
  const writeFileSync = ((...args: Parameters<typeof real.writeFileSync>) => {
    if (failWrite.once) {
      failWrite.once = false;
      throw Object.assign(new Error("denied"), { code: "EACCES" });
    }
    return real.writeFileSync(...args);
  }) as typeof real.writeFileSync;
  return { ...real, writeFileSync, default: { ...real, writeFileSync } };
});

let tmp: string;
let depot: string;
let repo: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "nw-auto-")));
  depot = path.join(tmp, "depot");
  fs.mkdirSync(depot);
  repo = path.join(tmp, "DigiSmith");
  fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");
  env = { DIGISMITH_DEPOT_DIR: depot, CLAUDE_PID: "4242" };
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const start = (p: Record<string, unknown>, e: NodeJS.ProcessEnv = env) => startAuto({ cwd: repo, ...p }, e, new Date("2026-10-24T05:00:00Z"));

describe("startAuto", () => {
  it("startAuto records DIGISMITH_SEAT as the seat", () => {
    const a = start({ session_id: "sid-seat", source: "startup" }, { ...env, DIGISMITH_SEAT: "dev0" })!;
    expect(readRun(a.dir).seat).toBe("dev0");
  });
  it("startAuto records the login seat from the fake .claude.json", () => {
    const home = path.join(tmp, "home");
    fs.mkdirSync(home);
    fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ oauthAccount: { emailAddress: "Jack@jazurite.com" } }));
    const a = start({ session_id: "sid-login", source: "startup" }, { ...env, HOME: home })!;
    expect(readRun(a.dir).seat).toBe("jack");
  });
  it("makes a new run under the project with id s-<session_id>", () => {
    const a = start({ session_id: "sid-1", source: "startup", model: "claude-opus-5-5" })!;
    expect(a).toMatchObject({ run: "s-sid-1", created: true, needsLabel: false });
    expect(a.dir).toBe(path.join(depot, "runs", "DigiSmith", "s-sid-1"));
    expect(readRun(a.dir)).toMatchObject({
      schema: "nightwatch-run/v1", run: "s-sid-1", ticket: null, role: "other", role_from: "none", source: "auto",
      project: "DigiSmith", session_id: "sid-1", order: null, budget: null, base_sha: null, branch: "main",
      worktree: null, model: "claude-opus-5-5", created_at: "2026-10-24T05:00:00.000Z", herdr: { workspace: null, tab: null, pane: null },
    });
    expect(findAuto({ session_id: "sid-1" }, env)).toEqual({ dir: a.dir, run: "s-sid-1" });
  });
  it("files a run under the ticket when the branch names one", () => {
    fs.writeFileSync(path.join(repo, ".git", "HEAD"), "ref: refs/heads/DGS-7__thing\n");
    const a = start({ session_id: "sid-2", source: "startup" })!;
    expect(a.dir).toBe(path.join(depot, "runs", "DGS-7", "s-sid-2"));
    expect(readRun(a.dir).ticket).toBe("DGS-7");
  });
  it("gives maestro outside herdr when one identity card names the repo", () => {
    fs.mkdirSync(path.join(depot, "identities"));
    fs.writeFileSync(path.join(depot, "identities", "m.yml"), `folder: ${repo}\n`);
    expect(readRun(start({ session_id: "sid-3", source: "startup" })!.dir)).toMatchObject({ role: "maestro", role_from: "identity" });
  });
  it("inside herdr: other, pending, the herdr fields, and needsLabel", () => {
    const a = start({ session_id: "sid-4", source: "startup" }, { ...env, HERDR_PANE_ID: "w2:p8W", HERDR_TAB_ID: "w2:t8W", HERDR_WORKSPACE_ID: "w2" })!;
    expect(a.needsLabel).toBe(true);
    expect(readRun(a.dir)).toMatchObject({ role: "other", role_from: "pending", herdr: { workspace: "w2", tab: "w2:t8W", pane: "w2:p8W" } });
  });
  it("a claude -p child (CLAUDE_CODE_ENTRYPOINT=sdk-cli) is other, none, with no labeller, in herdr and at a Maestro folder", () => {
    const a = start({ session_id: "sid-p1", source: "startup" }, { ...env, CLAUDE_CODE_ENTRYPOINT: "sdk-cli", HERDR_PANE_ID: "w2:p8W" })!;
    expect(a.needsLabel).toBe(false);
    expect(readRun(a.dir)).toMatchObject({ role: "other", role_from: "none" });
    fs.mkdirSync(path.join(depot, "identities"));
    fs.writeFileSync(path.join(depot, "identities", "m.yml"), `folder: ${repo}\n`);
    expect(readRun(start({ session_id: "sid-p2", source: "startup" }, { ...env, CLAUDE_CODE_ENTRYPOINT: "sdk-cli" })!.dir)).toMatchObject({ role: "other", role_from: "none" });
    expect(readRun(start({ session_id: "sid-p3", source: "startup" }, { ...env, CLAUDE_CODE_ENTRYPOINT: "cli" })!.dir)).toMatchObject({ role: "maestro", role_from: "identity" });
  });
  it("a resume in a new claude process, then a /clear there, continues the run", () => {
    const a = start({ session_id: "sid-r1", source: "startup" })!;
    expect(start({ session_id: "sid-r1", source: "resume" }, { ...env, CLAUDE_PID: "5151" })!.run).toBe("s-sid-r1");
    appendEvent(a.dir, a.run, "ended", { reason: "clear", session_id: "sid-r1" }, 2000);
    expect(start({ session_id: "sid-r2", source: "clear" }, { ...env, CLAUDE_PID: "5151" })).toEqual({ dir: a.dir, run: "s-sid-r1", created: false, needsLabel: false });
  });
  it("a resume (same session_id) continues the run", () => {
    const a = start({ session_id: "sid-5", source: "startup" })!;
    expect(start({ session_id: "sid-5", source: "resume" })).toEqual({ dir: a.dir, run: "s-sid-5", created: false, needsLabel: false });
  });
  it("a /clear in the same claude process continues the run", () => {
    const a = start({ session_id: "sid-6", source: "startup" })!;
    appendEvent(a.dir, a.run, "ended", { reason: "clear", session_id: "sid-6" }, 2000);
    const b = start({ session_id: "sid-6b", source: "clear" })!;
    expect(b).toEqual({ dir: a.dir, run: "s-sid-6", created: false, needsLabel: false });
    expect(findAuto({ session_id: "sid-6b" }, env)?.run).toBe("s-sid-6");
  });
  it("a /clear after an ended with another reason, or in another process, is a new run", () => {
    const a = start({ session_id: "sid-7", source: "startup" })!;
    appendEvent(a.dir, a.run, "ended", { reason: "logout", session_id: "sid-7" }, 2000);
    expect(start({ session_id: "sid-7b", source: "clear" })!.run).toBe("s-sid-7b");
    expect(start({ session_id: "sid-7c", source: "clear" }, { ...env, CLAUDE_PID: "9999" })!.run).toBe("s-sid-7c");
  });
  it("does nothing without a safe session_id or without a depot folder", () => {
    expect(start({ source: "startup" })).toBeNull();
    expect(start({ session_id: "has space" })).toBeNull();
    expect(start({ session_id: "sid-8" }, { DIGISMITH_DEPOT_DIR: path.join(tmp, "no-depot") })).toBeNull();
    expect(fs.existsSync(path.join(tmp, "no-depot"))).toBe(false);
  });
  it("keeps prompt text and other payload fields out of run.json", () => {
    const a = start({ session_id: "sid-9", source: "startup", prompt: "SECRET-PROMPT", transcript_path: "/x/SECRET" })!;
    expect(fs.readFileSync(path.join(a.dir, "run.json"), "utf8")).not.toMatch(/SECRET/);
  });
  it("a clear continues the run when events.jsonl has a null line", () => {
    const a = start({ session_id: "sid-10", source: "startup" })!;
    fs.appendFileSync(path.join(a.dir, "events.jsonl"), "null\n42\n");
    expect(start({ session_id: "sid-10b", source: "clear" })!.run).toBe("s-sid-10");
  });
  it("an ended event without data is not a clear end, so a clear starts a new run", () => {
    const a = start({ session_id: "sid-11", source: "startup" })!;
    fs.appendFileSync(path.join(a.dir, "events.jsonl"), JSON.stringify({ type: "ended", seq: 9 }) + "\n");
    expect(start({ session_id: "sid-11b", source: "clear" })!.run).toBe("s-sid-11b");
  });
  it("a failed run.json write removes the dir it made, throws, and the next start works", () => {
    failWrite.once = true;
    expect(() => start({ session_id: "sid-12", source: "startup" })).toThrow();
    expect(fs.existsSync(path.join(depot, "runs", "DigiSmith", "s-sid-12"))).toBe(false);
    const a = start({ session_id: "sid-12", source: "startup" })!;
    expect(a).toMatchObject({ run: "s-sid-12", created: true });
    expect(findAuto({ session_id: "sid-12" }, env)?.run).toBe("s-sid-12");
  });
  it("a leftover empty run dir gets its run.json on the next start", () => {
    fs.mkdirSync(path.join(depot, "runs", "DigiSmith", "s-sid-13"), { recursive: true });
    const a = start({ session_id: "sid-13", source: "startup" })!;
    expect(a.run).toBe("s-sid-13");
    expect(readRun(a.dir).session_id).toBe("sid-13");
    expect(findAuto({ session_id: "sid-13" }, env)?.run).toBe("s-sid-13");
  });
});
