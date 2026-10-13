import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { identityPromptHandler, isCatchUpPrompt, CATCH_UP_MARKER } from "./prompt-identity.ts";
import type { CliRun } from "./prompt-identity.ts";
import { findCardBySession, listCards } from "./cards.ts";
import { writeIdentity } from "../identity.ts";
import { PRE_PROMPT_HANDLERS, main } from "./hook-cli.ts";

let depot: string;
let repo: string;
const bare = () => ({ DIGISMITH_DEPOT_DIR: depot } as NodeJS.ProcessEnv);
const record = () => ({
  id: "digismith-maestro", name: "DigiSmith Maestro", owner: "jack", project: "DigiSmith", folder: repo,
  conductors: ["digismith-conductor"], role: "maestro", machine: "jack-desktop", state: path.join(repo, "note.md"), created: "2026-10-13T15:00+07:00",
});
beforeEach(() => {
  depot = fs.mkdtempSync(path.join(os.tmpdir(), "dgs437-"));
  repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dgs437-repo-")));
  execFileSync("git", ["init", "-q", repo]);
  execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "i"]);
});
afterEach(() => {
  fs.rmSync(depot, { recursive: true, force: true });
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("isCatchUpPrompt", () => {
  it("matches the narrow catch-up wordings", () => {
    for (const p of ["how's it going?", "How is it going", "catch me up", "catch-up please", "what did I miss?", "what's the status?", "status?", "what is the update"])
      expect(isCatchUpPrompt(p), p).toBe(true);
  });
  it("does not match other prompts or long ones", () => {
    for (const p of ["merge DGS-12 and tell me the status of DGS-12 when it is done in the usual way please, thanks", "list the files", "", undefined])
      expect(isCatchUpPrompt(p as string | undefined), String(p)).toBe(false);
  });
});

describe("identityPromptHandler", () => {
  const ev = (extra = {}) => ({ session_id: "d1", cwd: repo, ...extra });

  it("no card yet: writes it from the record and returns the identity line", () => {
    writeIdentity(record(), bare());
    const out = identityPromptHandler(ev({ prompt: "hello" }), bare());
    expect(out).toContain("[digismith identity]");
    expect(out).toContain("session d1");
    expect(findCardBySession("d1", "DigiSmith", bare())!.card).toMatchObject({ role: "maestro", id: "digismith-maestro" });
  });
  it("idempotent: a second prompt writes no second card and prints nothing", () => {
    writeIdentity(record(), bare());
    identityPromptHandler(ev({ prompt: "hello" }), bare());
    expect(identityPromptHandler(ev({ prompt: "again" }), bare())).toBeUndefined();
    expect(listCards("DigiSmith", { scope: "open", env: bare() })).toHaveLength(1);
  });
  it("herdr, DIGISMITH_ROLE sessions and sessions without a record are untouched", () => {
    writeIdentity(record(), bare());
    const calls: string[][] = [];
    const run: CliRun = (a) => { calls.push(a); return { status: 0, stdout: "x" }; };
    expect(identityPromptHandler(ev({ prompt: "catch me up" }), { ...bare(), HERDR_PANE_ID: "w2:p1" }, { run })).toBeUndefined();
    expect(identityPromptHandler(ev({ prompt: "catch me up" }), { ...bare(), DIGISMITH_ROLE: "worker", DIGISMITH_PROJECT: "DigiSmith", DIGISMITH_ID: "w", DIGISMITH_UNDER: "c", DIGISMITH_MANDATE: "m", DIGISMITH_CREATED_BY: "c" }, { run })).toBeUndefined();
    expect(identityPromptHandler({ session_id: "z", cwd: os.tmpdir(), prompt: "catch me up" }, bare(), { run })).toBeUndefined();
    expect(calls).toEqual([]);
    expect(listCards("DigiSmith", { env: bare() })).toHaveLength(0);
  });
  it("catch-up intent: card first, then runs the catch-up command with identity, session and conductor", () => {
    writeIdentity(record(), bare());
    const calls: string[][] = [];
    const run: CliRun = (a) => { calls.push(a); return { status: 0, stdout: "## Done\n- x\n" }; };
    const out = identityPromptHandler(ev({ prompt: "how's it going?" }), bare(), { run })!;
    expect(out).toContain("[digismith identity]");
    expect(out).toContain(CATCH_UP_MARKER);
    expect(out).toContain("## Done");
    expect(calls).toHaveLength(1);
    expect(calls[0].join(" ")).toMatch(/catch-up-cli\.ts --maestro digismith-maestro --session d1 --conductor digismith-conductor --project DigiSmith/);
  });
  it("catch-up on a session that already has its card still runs it, without the identity line", () => {
    writeIdentity(record(), bare());
    identityPromptHandler(ev({ prompt: "hi" }), bare());
    const run: CliRun = () => ({ status: 0, stdout: "body" });
    const out = identityPromptHandler(ev({ prompt: "catch me up" }), bare(), { run })!;
    expect(out).not.toContain("[digismith identity]");
    expect(out).toContain("body");
  });
  it("exit 3 and 4 (note not saved) still count as output", () => {
    writeIdentity(record(), bare());
    for (const status of [3, 4]) {
      const out = identityPromptHandler(ev({ session_id: `s${status}`, prompt: "status?" }), bare(), { run: () => ({ status, stdout: "body" }) })!;
      expect(out).toContain("body");
    }
  });
  it("catch-up command fails: falls back to consult; both fail: only the identity line, no throw", () => {
    writeIdentity(record(), bare());
    const calls: string[][] = [];
    const run: CliRun = (a) => { calls.push(a); return a.some((x) => x.endsWith("catch-up-cli.ts")) ? { status: 1, stdout: "" } : { status: 0, stdout: "consult text" }; };
    const out = identityPromptHandler(ev({ prompt: "catch me up" }), bare(), { run })!;
    expect(out).toContain("consult text");
    expect(calls[1].join(" ")).toMatch(/cli\.ts consult --project DigiSmith/);
    const out2 = identityPromptHandler(ev({ session_id: "d2", prompt: "catch me up" }), bare(), { run: () => { throw new Error("boom"); } })!;
    expect(out2).toContain("[digismith identity]");
    expect(out2).not.toContain(CATCH_UP_MARKER);
  });
  it("is the first pre-prompt handler, and hook-cli main prints its output", () => {
    expect(PRE_PROMPT_HANDLERS[0]).toBe(identityPromptHandler);
    writeIdentity(record(), bare());
    expect(main("prompt", JSON.stringify({ session_id: "m1", cwd: repo, prompt: "hello" }), bare())).toContain("[digismith identity]");
  });
});
