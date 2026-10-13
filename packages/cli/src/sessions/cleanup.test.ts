import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CLEANUP_DAYS, planCleanup, runCleanup } from "./cleanup.ts";
import { buildCli } from "../index.ts";

const DAY = 86_400_000;
const NOW = new Date("2026-10-13T12:00:00Z");

function card(status: string, ended: string | undefined, extra = ""): string {
  return [
    "name: fake", "role: worker", "id: fake", "session: s1", "under: c", "domain: P",
    "mandate: x", "runs_on: herdr w1:p1", "created_by: c", "started: 2026-10-01T10:00+07:00",
    "last_seen: 2026-10-01T10:00+07:00", `status: ${status}`,
    ...(ended !== undefined ? [`ended: ${ended}`] : []), extra,
  ].filter(Boolean).join("\n") + "\n";
}
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString().replace(/\.\d+Z$/, "Z");

let depot: string;
const put = (rel: string, content: string) => {
  const f = path.join(depot, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  return f;
};

beforeEach(() => { depot = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-")); });
afterEach(() => { fs.rmSync(depot, { recursive: true, force: true }); });

describe("CLEANUP_DAYS", () => {
  it("is 3", () => expect(CLEANUP_DAYS).toBe(3));
});

describe("planCleanup", () => {
  it("deletes a 4-day closed and lost card; keeps a 2-day one", () => {
    const a = put("sessions/P/archive/a--1.yml", card("closed", ago(4 * DAY)));
    const b = put("sessions/P/archive/b--1.yml", card("lost", ago(4 * DAY)));
    const c = put("sessions/P/archive/c--1.yml", card("closed", ago(2 * DAY)));
    const plan = planCleanup(depot, NOW);
    expect(plan.delete.map((d) => d.path).sort()).toEqual([a, b]);
    expect(plan.kept.map((k) => k.path)).toContain(c);
  });

  it("is strictly older than CLEANUP_DAYS: exactly, just under and just over", () => {
    const exact = put("sessions/P/archive/exact--1.yml", card("closed", ago(CLEANUP_DAYS * DAY)));
    const under = put("sessions/P/archive/under--1.yml", card("closed", ago(CLEANUP_DAYS * DAY - 1000)));
    const over = put("sessions/P/archive/over--1.yml", card("closed", ago(CLEANUP_DAYS * DAY + 1000)));
    const plan = planCleanup(depot, NOW);
    expect(plan.delete.map((d) => d.path)).toEqual([over]);
    expect(plan.kept.map((k) => k.path).sort()).toEqual([exact, under].sort());
  });

  it("keeps an old open card in cards/, and a closed card sitting in cards/", () => {
    put("sessions/P/cards/o--1.yml", card("open", undefined));
    put("sessions/P/cards/x--1.yml", card("closed", ago(10 * DAY)));
    expect(planCleanup(depot, NOW).delete).toEqual([]);
  });

  it("keeps an open-status card inside archive/", () => {
    put("sessions/P/archive/o--1.yml", card("open", ago(10 * DAY)));
    expect(planCleanup(depot, NOW).delete).toEqual([]);
  });

  it("keeps a missing or unreadable ended", () => {
    put("sessions/P/archive/m--1.yml", card("closed", undefined));
    put("sessions/P/archive/u--1.yml", card("closed", "yesterday-ish"));
    const plan = planCleanup(depot, NOW);
    expect(plan.delete).toEqual([]);
    expect(plan.kept).toHaveLength(2);
  });

  it("keeps old notes, orders, identities, runbook, conductor state and the log, in any folder", () => {
    const old = card("closed", ago(30 * DAY));
    const keep = [
      "sessions/P/note.md", "sessions/P/archive/note.md", "sessions/P/archive/other/note.md",
      "sessions/P/conductor/note.md", "sessions/P/orders/order-1.md", "sessions/P/orders/order-2.yml",
      "sessions/P/workbox.md", "sessions/P/cleanup.log", "sessions/cleanup.log",
      "identities/digismith-maestro.yml", "conductors.json", "sessions/P/state.yml",
      "sessions/P/cards/c--1.yml", "sessions/P/conductor/c--1.yml", "sessions/P/archive/sub/deep--1.yml",
    ];
    for (const k of keep) put(k, k.endsWith(".yml") ? old : "old");
    for (const k of keep) fs.utimesSync(path.join(depot, k), new Date(0), new Date(0));
    expect(planCleanup(depot, NOW).delete).toEqual([]);
    for (const k of keep) expect(fs.existsSync(path.join(depot, k))).toBe(true);
  });

  it("skips a symlink in archive/ and never follows it", () => {
    const target = put("elsewhere/real.yml", card("closed", ago(30 * DAY)));
    fs.mkdirSync(path.join(depot, "sessions/P/archive"), { recursive: true });
    fs.symlinkSync(target, path.join(depot, "sessions/P/archive/link--1.yml"));
    expect(planCleanup(depot, NOW).delete).toEqual([]);
  });

  it("keeps and reports a card that does not parse", () => {
    put("sessions/P/archive/bad--1.yml", "this is not: a card\n::::\n");
    const plan = planCleanup(depot, NOW);
    expect(plan.delete).toEqual([]);
    expect(plan.errors).toHaveLength(1);
  });

  it("limits to one project with a filter", () => {
    put("sessions/P/archive/a--1.yml", card("closed", ago(4 * DAY)));
    const q = put("sessions/Q/archive/a--1.yml", card("closed", ago(4 * DAY)));
    expect(planCleanup(depot, NOW, "Q").delete.map((d) => d.path)).toEqual([q]);
  });

  it("rejects an unsafe project name", () => {
    expect(() => planCleanup(depot, NOW, "../x")).toThrow(/project/);
  });

  it("no sessions folder: nothing to do", () => {
    expect(planCleanup(depot, NOW)).toEqual({ delete: [], kept: [], errors: [] });
  });
});

describe("runCleanup", () => {
  const setup = () => {
    const a = put("sessions/P/archive/a--1.yml", card("closed", ago(4 * DAY)));
    const keep = put("sessions/P/archive/k--1.yml", card("closed", ago(1 * DAY)));
    const note = put("sessions/P/note.md", "n");
    return { a, keep, note };
  };

  it("dry run deletes nothing and writes no log", () => {
    const { a } = setup();
    const r = runCleanup({ depot, now: NOW, yes: false });
    expect(r.lines).toEqual([expect.stringContaining(`would delete ${a}`)]);
    expect(fs.existsSync(a)).toBe(true);
    expect(fs.existsSync(path.join(depot, "sessions/cleanup.log"))).toBe(false);
    expect(r.exitCode).toBe(0);
  });

  it("--yes deletes exactly the plan and logs one line per file, appending", () => {
    const { a, keep, note } = setup();
    const r = runCleanup({ depot, now: NOW, yes: true });
    expect(fs.existsSync(a)).toBe(false);
    expect(fs.existsSync(keep)).toBe(true);
    expect(fs.existsSync(note)).toBe(true);
    const log = path.join(depot, "sessions/cleanup.log");
    const lines = fs.readFileSync(log, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`deleted ${a}`);
    expect(r.lines[0]).toContain(`deleted ${a}`);
    put("sessions/P/archive/b--1.yml", card("lost", ago(9 * DAY)));
    runCleanup({ depot, now: NOW, yes: true });
    expect(fs.readFileSync(log, "utf-8").trim().split("\n")).toHaveLength(2);
    expect(fs.readFileSync(log, "utf-8").startsWith(lines[0])).toBe(true);
    expect(runCleanup({ depot, now: NOW, yes: true }).lines).toEqual([]);
  });

  it("exits non-zero on a card that does not parse, still deletes the good ones", () => {
    const { a } = setup();
    put("sessions/P/archive/bad--1.yml", "garbage\n");
    const r = runCleanup({ depot, now: NOW, yes: true });
    expect(r.exitCode).toBe(1);
    expect(r.errors[0]).toContain("bad--1.yml");
    expect(fs.existsSync(a)).toBe(false);
    expect(fs.existsSync(path.join(depot, "sessions/P/archive/bad--1.yml"))).toBe(true);
  });
});

describe("cli wiring", () => {
  it("registers sessions cleanup with --yes and --project", () => {
    expect.assertions(3);
    const argv = ["sessions", "cleanup", "--help"];
    buildCli(argv).parse(argv, {}, (err, _argv, output) => {
      expect(err).toBeFalsy();
      expect(output).toMatch(/--yes/);
      expect(output).toMatch(/--project/);
    });
  });
});
