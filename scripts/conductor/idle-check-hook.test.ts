import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runPrompt, PRE_PROMPT_HANDLERS } from "../session-cards/hook-cli.ts";
import { idleHandler, IDLE_CONTEXT_MARKER } from "./idle-check.ts";
import { findCardBySession, writeCard, type SessionCard } from "../session-card.ts";

let depot: string;
let env: NodeJS.ProcessEnv;
const maestro = (session: string, last_seen: string, status: SessionCard["status"] = "open"): SessionCard => ({
  name: "digismith-maestro", role: "maestro", id: "dsm-maestro", session, domain: "DigiSmith", state: "note.md",
  runs_on: "desktop", machine: "mac", created_by: "jack", started: "2026-10-13T09:00+07:00", last_seen, status,
});
beforeEach(() => {
  depot = fs.mkdtempSync(path.join(os.tmpdir(), "dgs428hook-"));
  env = { PATH: process.env.PATH, DIGISMITH_DEPOT_DIR: depot, DIGISMITH_ROLE: "maestro", DIGISMITH_ID: "dsm-maestro", DIGISMITH_PROJECT: "DigiSmith", DIGISMITH_MACHINE: "mac", DIGISMITH_STATE: "note.md", DIGISMITH_CREATED_BY: "jack" };
  writeCard(maestro("s-me", "2026-10-13T10:00+07:00"), env);
  writeCard(maestro("s-other", "2026-10-13T12:00+07:00"), env);
});
afterEach(() => fs.rmSync(depot, { recursive: true, force: true }));

describe("idle check through DGS-418's real pre-prompt extension point", () => {
  it("is registered in the handler list", () => {
    expect(PRE_PROMPT_HANDLERS).toContain(idleHandler);
  });
  it("runs BEFORE the heartbeat: it sees the stale last_seen, then the heartbeat refreshes it", () => {
    const first = runPrompt({ session_id: "s-me" }, env);
    expect(first).toContain(IDLE_CONTEXT_MARKER);
    expect(first).toContain("--conductor 'digismith-conductor'");
    expect(findCardBySession("s-me", "DigiSmith", env)!.card.last_seen > "2026-10-13T12:00+07:00").toBe(true);
    // the heartbeat has refreshed last_seen, so the next prompt is no longer idle
    expect(runPrompt({ session_id: "s-me" }, env)).toBe("");
  });
  it("is silent for a session with no card", () => {
    expect(runPrompt({ session_id: "nobody" }, env)).toBe("");
  });
});
