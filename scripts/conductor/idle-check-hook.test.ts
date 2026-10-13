import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { runPrompt, PRE_PROMPT_HANDLERS } from "../session-cards/hook-cli.ts";
import { idleHandler, IDLE_CONTEXT_MARKER } from "./idle-check.ts";
import { readStamp, writeStamp } from "./idle-stamp.ts";
import { writeCard, type SessionCard } from "../session-card.ts";

let depot: string;
let repo: string;
let env: NodeJS.ProcessEnv;
const maestro = (session: string, last_seen: string): SessionCard => ({
  name: "digismith-maestro", role: "maestro", id: "dsm-maestro", session, domain: "DigiSmith", state: "note.md",
  runs_on: "desktop", machine: "mac", created_by: "jack", started: "2026-10-13T09:00+07:00", last_seen, status: "open",
});
const git = (...a: string[]) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const setNote = (updated: string) => {
  const dir = path.join(depot, "sessions", "DigiSmith", "digismith-conductor");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "note.md"), `free text\n<!-- digismith:conductor-state v1 -->\nUpdated: ${updated}\n\n## Running\n- none\n<!-- /digismith:conductor-state -->\n`);
};
const prompt = (text: string, session = "s-me") => runPrompt({ session_id: session, cwd: repo, prompt: text } as never, env);

beforeEach(() => {
  depot = fs.mkdtempSync(path.join(os.tmpdir(), "dgs438hook-"));
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "dgs438repo-"));
  git("init", "-q", "-b", "main");
  git("-c", "user.email=a@b", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "one");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  env = { PATH: process.env.PATH, DIGISMITH_DEPOT_DIR: depot, DIGISMITH_ROLE: "maestro", DIGISMITH_ID: "dsm-maestro", DIGISMITH_PROJECT: "DigiSmith", DIGISMITH_MACHINE: "mac", DIGISMITH_STATE: "note.md", DIGISMITH_CREATED_BY: "jack" };
  writeCard(maestro("s-me", "2026-10-13T10:00+07:00"), env);
  writeCard(maestro("s-other", "2026-10-13T12:00+07:00"), env);
  setNote("2026-10-13T10:00+07:00");
});
afterEach(() => {
  fs.rmSync(depot, { recursive: true, force: true });
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("idle check through DGS-418's real pre-prompt extension point", () => {
  it("is registered in the handler list", () => {
    expect(PRE_PROMPT_HANDLERS).toContain(idleHandler);
  });
  it("the bug: another session is newer than this one, but Jack is active here: silent", () => {
    expect(prompt("first")).toBe(""); // no stamp yet: silent, stamp written
    expect(readStamp("DigiSmith", "s-me", env)?.last_prompt).toBeTruthy();
    expect(prompt("second")).toBe("");
  });
  it("fires once after 30+ idle minutes when the repo head moved, then not again", () => {
    writeStamp("DigiSmith", "s-me", { last_prompt: ago(45), caught_up_head: git("rev-parse", "HEAD"), caught_up_updated: "2026-10-13T10:00+07:00" }, env);
    expect(prompt("back")).toBe(""); // nothing changed since the last catch-up
    writeStamp("DigiSmith", "s-me", { last_prompt: ago(45), caught_up_head: git("rev-parse", "HEAD"), caught_up_updated: "2026-10-13T10:00+07:00" }, env);
    git("-c", "user.email=a@b", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "two");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    const out = prompt("back again");
    expect(out).toContain(IDLE_CONTEXT_MARKER);
    expect(out).toContain("--conductor 'digismith-conductor'");
    expect(readStamp("DigiSmith", "s-me", env)?.caught_up_head).toBe(git("rev-parse", "HEAD"));
    writeStamp("DigiSmith", "s-me", { ...readStamp("DigiSmith", "s-me", env)!, last_prompt: ago(60) }, env);
    expect(prompt("and again")).toBe(""); // idle again, nothing new
  });
  it("fires when only the conductor state block's Updated: changed", () => {
    writeStamp("DigiSmith", "s-me", { last_prompt: ago(45), caught_up_head: git("rev-parse", "HEAD"), caught_up_updated: "2026-10-13T10:00+07:00" }, env);
    setNote("2026-10-13T11:30+07:00");
    expect(prompt("back")).toContain(IDLE_CONTEXT_MARKER);
    expect(readStamp("DigiSmith", "s-me", env)?.caught_up_updated).toBe("2026-10-13T11:30+07:00");
  });
  it("a harness notice does not fire and leaves the stamp alone", () => {
    const st = { last_prompt: ago(45), caught_up_head: "old", caught_up_updated: "old" };
    writeStamp("DigiSmith", "s-me", st, env);
    expect(prompt("<task-notification><task-id>x</task-id></task-notification>")).toBe("");
    expect(readStamp("DigiSmith", "s-me", env)?.last_prompt).toBe(st.last_prompt);
  });
  it("is silent for a session with no card", () => {
    expect(prompt("hi", "nobody")).toBe("");
  });
});
