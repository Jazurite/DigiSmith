import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./catch-up-cli.ts";
import { formatCard, type SessionCard } from "../session-card.ts";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "catch-up-cli.ts");

describe("parseArgs", () => {
  it("reads the flags and defaults the project and max age", () => {
    expect(parseArgs(["--maestro", "m1", "--session", "s1", "--conductor", "c"])).toMatchObject({ identity: "m1", session: "s1", conductor: "c", project: "DigiSmith", maxAgeMin: 30, refresh: false, noWrite: false });
  });
  it("takes refresh, no-write, max-age-min, now and project", () => {
    expect(parseArgs(["--maestro", "m", "--session", "s", "--conductor", "c", "--refresh", "--no-write", "--max-age-min", "5", "--project", "P", "--now", "2026-10-13T08:00:00Z"])).toMatchObject({ refresh: true, noWrite: true, maxAgeMin: 5, project: "P", now: "2026-10-13T08:00:00Z" });
  });
  it("rejects a missing required flag, an unknown flag and a bad number", () => {
    expect(() => parseArgs(["--session", "s", "--conductor", "c"])).toThrow(/--maestro/);
    expect(() => parseArgs(["--maestro", "m", "--session", "s", "--conductor", "c", "--bogus"])).toThrow(/--bogus/);
    expect(() => parseArgs(["--maestro", "m", "--session", "s", "--conductor", "c", "--max-age-min", "x"])).toThrow(/max-age-min/);
  });
});

describe("catch-up-cli (temp depot)", () => {
  let depot: string;
  beforeEach(() => {
    depot = fs.mkdtempSync(path.join(os.tmpdir(), "dgs428-"));
    const cards = path.join(depot, "sessions", "DigiSmith", "cards");
    fs.mkdirSync(cards, { recursive: true });
    const card: SessionCard = { name: "maestro", role: "maestro", id: "m1", session: "s-old", domain: "DigiSmith", state: "note.md", runs_on: "desktop", machine: "mac", created_by: "jack", started: "2026-10-13T09:00+07:00", last_seen: "2026-10-13T12:00+07:00", status: "open" };
    fs.writeFileSync(path.join(cards, "m1--s-old.yml"), formatCard(card));
    fs.mkdirSync(path.join(depot, "sessions", "DigiSmith", "c"), { recursive: true });
    fs.writeFileSync(path.join(depot, "sessions", "DigiSmith", "c", "note.md"), "# note\nkeep me\n");
  });
  afterEach(() => fs.rmSync(depot, { recursive: true, force: true }));
  const run = (extra: string[]) =>
    spawnSync("node", ["--experimental-strip-types", CLI, "--maestro", "m1", "--session", "s-me", "--conductor", "c", "--now", "2026-10-13T08:00:00Z", ...extra], {
      env: { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, DIGISMITH_DEPOT_DIR: depot }, encoding: "utf8",
    });

  it("prints the catch-up with its window and writes one block into the note, keeping the rest", () => {
    const r = run([]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Window: 2026-10-13 12:00 UTC+7 to 2026-10-13 15:00 UTC+7");
    const note = fs.readFileSync(path.join(depot, "sessions", "DigiSmith", "c", "note.md"), "utf8");
    expect(note.startsWith("# note\nkeep me\n")).toBe(true);
    expect(note.match(/digismith:catch-up v1 maestro=m1/g)).toHaveLength(1);
  });
  it("a second run within the max age reuses the block, and the note keeps one block", () => {
    run([]);
    const r = run(["--now", "2026-10-13T08:05:00Z"]);
    expect(r.stdout).toContain("(from note, written 2026-10-13T15:00+07:00)");
    const note = fs.readFileSync(path.join(depot, "sessions", "DigiSmith", "c", "note.md"), "utf8");
    expect(note.match(/digismith:catch-up v1 maestro=m1/g)).toHaveLength(1);
  });
  it("exits 2 on bad arguments and 3 when the conductor note is missing", () => {
    expect(spawnSync("node", ["--experimental-strip-types", CLI], { encoding: "utf8" }).status).toBe(2);
    fs.rmSync(path.join(depot, "sessions", "DigiSmith", "c", "note.md"));
    const r = run([]);
    expect(r.status).toBe(3);
    expect(r.stdout).toContain("# Catch-up");
  });
});

import { taskIdForKey } from "./catch-up-cli.ts";
describe("taskIdForKey (S12)", () => {
  it("reads the task id from the board folder, else undefined", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dgs428-board-"));
    const dir = path.join(root, ".digismith", "board", "DGS-428—catch-up", "worker-dgs-428");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(root, ".digismith", "board", "DGS-428—catch-up", "ticket.md"), "Ticket DGS-428 (task `14zcebrvm6r`)\n");
    expect(taskIdForKey("DGS-428", root)).toBe("14zcebrvm6r");
    expect(taskIdForKey("DGS-999", root)).toBeUndefined();
    expect(taskIdForKey("../x", root)).toBeUndefined();
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("parseArgs path safety (review)", () => {
  const base = ["--maestro", "m", "--session", "s", "--conductor", "c"];
  it("rejects values that could leave the depot folder or carry shell text", () => {
    expect(() => parseArgs(["--maestro", "m", "--session", "s", "--conductor", "../../x"])).toThrow(/--conductor/);
    expect(() => parseArgs([...base, "--project", ".."])).toThrow(/--project/);
    expect(() => parseArgs(["--maestro", "m; ls", "--session", "s", "--conductor", "c"])).toThrow(/--maestro/);
  });
});
