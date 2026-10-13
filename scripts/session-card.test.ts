import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  validateCard, parseCard, formatCard, readCard, writeCard, listCards, listCardProblems,
  touchCard, closeCard, markLost, newestLastSeen, nowIso, cardsDir, archiveDir, cardPath,
  findCardBySession, LEGAL_PARENT_ROLES, CardError, type SessionCard,
} from "./session-card.ts";

const conductor = (): SessionCard => ({
  name: "digismith-conductor", role: "conductor", id: "dsm-conductor-01",
  session: "3f2b8c1e-1111-4222-8333-444455556666", under: "jack", domain: "DigiSmith",
  mandate: ".digismith/sessions/DigiSmith/order.md", state: ".digismith/sessions/DigiSmith/note.md",
  runs_on: "herdr w2:p1", created_by: "jack",
  started: "2026-10-13T13:00+07:00", last_seen: "2026-10-13T13:40+07:00", status: "open",
});
const maestro = (): SessionCard => ({
  name: "jack-maestro", role: "maestro", id: "jack-maestro", session: "s-m1", domain: "DigiSmith",
  state: "note.md", runs_on: "Workbox over SSH", machine: "gradion-mac", created_by: "jack",
  started: "2026-10-13T13:00+07:00", last_seen: "2026-10-13T13:00+07:00", status: "open",
});
const worker = (): SessionCard => ({
  name: "dgs-417", role: "worker", id: "dgs-417-worker", session: "s-w1", under: "dsm-conductor-01",
  domain: "DGS-417", mandate: "brief.md", runs_on: "herdr w2:p5", created_by: "dsm-conductor-01",
  started: "2026-10-13T13:00+07:00", last_seen: "2026-10-13T13:01+07:00", status: "open",
});
const errs = (c: unknown): string[] => {
  const r = validateCard(c);
  return r.ok ? [] : r.errors;
};

describe("validateCard", () => {
  it("accepts a good card per role", () => {
    for (const c of [conductor(), maestro(), worker()]) expect(errs(c)).toEqual([]);
    expect(errs({ ...worker(), role: "scout" })).toEqual([]);
    expect(errs({ ...worker(), role: "reviewer" })).toEqual([]);
    expect(errs({ ...worker(), role: "observer", mandate: undefined })).toEqual([]);
  });
  it("rejects a non-object", () => {
    expect(errs(null).length).toBe(1);
    expect(errs([]).length).toBe(1);
  });
  it.each(["name", "role", "id", "session", "domain", "runs_on", "created_by", "started", "last_seen", "status"])(
    "rejects missing %s", (f) => {
      const c: Record<string, unknown> = { ...conductor() };
      delete c[f];
      expect(errs(c).some((e) => e.includes(f))).toBe(true);
    });
  it("rejects an unknown field, an empty value, a multi-line value, a non-string", () => {
    expect(errs({ ...conductor(), extra: "x" }).some((e) => e.includes("extra"))).toBe(true);
    expect(errs({ ...conductor(), name: "" }).length).toBeGreaterThan(0);
    expect(errs({ ...conductor(), name: "a\nb" }).length).toBeGreaterThan(0);
    expect(errs({ ...conductor(), name: 5 }).length).toBeGreaterThan(0);
  });
  it("rejects an unknown role and a bad status", () => {
    expect(errs({ ...conductor(), role: "boss" }).some((e) => e.includes("role"))).toBe(true);
    expect(errs({ ...conductor(), status: "dead" }).some((e) => e.includes("status"))).toBe(true);
  });
  it.each(["2026-10-13 13:00", "2026-10-13T13:00", "2026-13-01T10:00+07:00", "2026-02-30T10:00+07:00",
    "2026-10-13T25:00+07:00", "yesterday", "2026-10-13T13:00+7"])("rejects bad timestamp %s", (t) => {
    expect(errs({ ...conductor(), started: t, last_seen: t }).length).toBeGreaterThan(0);
  });
  it("accepts seconds and Z", () => {
    expect(errs({ ...conductor(), started: "2026-10-13T06:00:00Z", last_seen: "2026-10-13T13:00:30+07:00" })).toEqual([]);
  });
  it("rejects last_seen before started (offsets compared as instants)", () => {
    expect(errs({ ...conductor(), last_seen: "2026-10-13T12:00+07:00" }).length).toBeGreaterThan(0);
    expect(errs({ ...conductor(), started: "2026-10-13T13:00+07:00", last_seen: "2026-10-13T06:30Z" })).toEqual([]);
  });
  it("validates ended and result when present", () => {
    expect(errs({ ...conductor(), ended: "2026-10-13T14:00+07:00", result: "merged" })).toEqual([]);
    expect(errs({ ...conductor(), ended: "soon" }).length).toBeGreaterThan(0);
    expect(errs({ ...conductor(), result: "a\nb" }).length).toBeGreaterThan(0);
    expect(errs({ ...conductor(), result: "x".repeat(300) }).length).toBeGreaterThan(0);
  });
  it("checks id, under and session shapes", () => {
    expect(errs({ ...conductor(), id: "Bad_ID" }).length).toBeGreaterThan(0);
    expect(errs({ ...conductor(), under: "dsm-conductor-01" }).some((e) => e.includes("under"))).toBe(true);
    expect(errs({ ...conductor(), session: "../x" }).length).toBeGreaterThan(0);
    expect(errs({ ...conductor(), session: "a/b" }).length).toBeGreaterThan(0);
    expect(errs({ ...conductor(), domain: "a/b" }).length).toBeGreaterThan(0);
    expect(errs({ ...conductor(), domain: ".." }).length).toBeGreaterThan(0);
  });
  it("applies the role rules", () => {
    expect(errs({ ...maestro(), under: "jack" }).some((e) => e.includes("under"))).toBe(true);
    expect(errs({ ...conductor(), under: undefined }).some((e) => e.includes("under"))).toBe(true);
    expect(errs({ ...maestro(), machine: undefined }).some((e) => e.includes("machine"))).toBe(true);
    expect(errs({ ...conductor(), machine: "x" }).some((e) => e.includes("machine"))).toBe(true);
    expect(errs({ ...conductor(), mandate: undefined }).some((e) => e.includes("mandate"))).toBe(true);
    expect(errs({ ...worker(), mandate: undefined }).some((e) => e.includes("mandate"))).toBe(true);
    expect(errs({ ...conductor(), state: undefined }).some((e) => e.includes("state"))).toBe(true);
    expect(errs({ ...maestro(), state: undefined }).some((e) => e.includes("state"))).toBe(true);
  });
  it("exports the legal parent roles", () => {
    expect(LEGAL_PARENT_ROLES.conductor).toEqual(["maestro"]);
    expect(LEGAL_PARENT_ROLES.worker).toContain("conductor");
  });

  describe("secret-like values", () => {
    const fake = (s: string) => s; // all literals below are fabricated shapes
    it.each([
      ["sk key", fake("sk-" + "a1B2c3D4e5F6g7H8i9J0")],
      ["ghp", fake("ghp_" + "abcdefghijklmnopqrstuv")],
      ["github_pat", fake("github_pat_" + "abcdefghijk")],
      ["slack", fake("xoxb-" + "123456789012")],
      ["aws", fake("AKIA" + "ABCDEFGHIJKLMNOP")],
      ["google", fake("AIza" + "SyABCDEFGHIJKLMNOPQRSTUV")],
      ["bearer", "Bearer abc.def"],
      ["jwt", fake("eyJhbGciOiJI" + ".eyJzdWIiOiIx" + ".abcdEFGH")],
      ["pem", "-----BEGIN PRIVATE KEY-----"],
      ["url creds", "https://u:pw@host/x"],
      ["long run", "Zk3" + "9aB".repeat(12)],
    ])("refuses %s", (_n, v) => {
      for (const field of ["name", "result", "runs_on", "state"]) {
        const e = errs({ ...conductor(), [field]: v });
        expect(e.some((x) => x.includes(field) && /secret/i.test(x))).toBe(true);
        expect(e.join("\n")).not.toContain(v);
      }
    });
    it("passes a UUID, a path, a hyphenated word", () => {
      expect(errs({ ...conductor(), session: "0b9c1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4" })).toEqual([]);
      expect(errs({ ...conductor(), state: "/Users/x/.digismith-depot/sessions/DigiSmith/dsm-conductor-01/note.md" })).toEqual([]);
      expect(errs({ ...conductor(), name: "role-architecture-design-follow-up" })).toEqual([]);
    });
  });
});

describe("parse and format", () => {
  it("round trips, including quoted values", () => {
    const c = { ...conductor(), runs_on: "herdr: w2 # p1", result: " padded " };
    const back = parseCard(formatCard(c));
    expect(back).toEqual(c);
  });
  it("allows comments and blank lines", () => {
    const text = "# card\n\n" + formatCard(conductor());
    expect(parseCard(text)).toEqual(conductor());
  });
  it("throws CardError listing errors for a bad card", () => {
    expect(() => parseCard("role: boss\n")).toThrow(CardError);
    expect(() => parseCard("not a line\n")).toThrow(CardError);
    expect(() => parseCard(formatCard(conductor()) + "name: dup\n")).toThrow(/duplicate/);
  });
  it("refuses to format an invalid card", () => {
    expect(() => formatCard({ ...conductor(), role: "boss" as never })).toThrow(CardError);
  });
});

describe("depot layout", () => {
  let tmp: string;
  let env: NodeJS.ProcessEnv;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "card-depot-"));
    env = { DIGISMITH_DEPOT_DIR: tmp };
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("writes into cards/ atomically, leaving no temp file", () => {
    const p = writeCard(conductor(), env);
    expect(p).toBe(path.join(tmp, "sessions", "DigiSmith", "cards", `dsm-conductor-01--${conductor().session}.yml`));
    expect(cardPath(conductor(), env)).toBe(p);
    expect(readCard(p)).toEqual(conductor());
    expect(fs.readdirSync(cardsDir("DigiSmith", env)).filter((f) => f.endsWith(".tmp") || f.startsWith("."))).toEqual([]);
  });
  it("refuses to write an invalid card and writes nothing", () => {
    expect(() => writeCard({ ...conductor(), role: "boss" as never }, env)).toThrow(CardError);
    expect(fs.existsSync(path.join(tmp, "sessions"))).toBe(false);
  });
  it("keeps the old card when a write dies before the rename; list ignores temp files", () => {
    const p = writeCard(conductor(), env);
    fs.writeFileSync(path.join(path.dirname(p), ".dsm-conductor-01--x.yml.123.abc.tmp"), "role: bo");
    expect(readCard(p)).toEqual(conductor());
    expect(listCards("DigiSmith", { env }).map((x) => x.card.id)).toEqual(["dsm-conductor-01"]);
    expect(listCardProblems("DigiSmith", env)).toEqual([]);
  });
  it("rejects unsafe project names", () => {
    expect(() => cardsDir("..", env)).toThrow();
    expect(() => cardsDir("a/b", env)).toThrow();
    expect(() => listCards("../x", { env })).toThrow();
  });
  it("touchCard moves last_seen only", () => {
    writeCard(conductor(), env);
    const now = new Date("2026-10-13T08:00:00Z");
    const c = touchCard({ project: "DigiSmith", id: "dsm-conductor-01", session: conductor().session }, now, env);
    expect(c.last_seen).toBe("2026-10-13T15:00+07:00");
    expect(c).toEqual({ ...conductor(), last_seen: "2026-10-13T15:00+07:00" });
  });
  it("touchCard refuses a missing or non-open card", () => {
    const ref = { project: "DigiSmith", id: "dsm-conductor-01", session: conductor().session };
    expect(() => touchCard(ref, undefined, env)).toThrow(/no open card/);
    writeCard(conductor(), env);
    closeCard(ref, { env });
    expect(() => touchCard(ref, undefined, env)).toThrow();
  });
  it("closeCard archives (file kept), sets status, ended and result", () => {
    const p = writeCard(conductor(), env);
    const ref = { project: "DigiSmith", id: "dsm-conductor-01", session: conductor().session };
    const a = closeCard(ref, { now: new Date("2026-10-13T09:00:00Z"), result: "merged DGS-417", env });
    expect(a).toBe(path.join(archiveDir("DigiSmith", env), path.basename(p)));
    expect(fs.existsSync(p)).toBe(false);
    const c = readCard(a);
    expect(c.status).toBe("closed");
    expect(c.ended).toBe("2026-10-13T16:00+07:00");
    expect(c.result).toBe("merged DGS-417");
    expect(closeCard(ref, { env })).toBe(a); // second close is a no-op
    expect(readCard(a)).toEqual(c);
  });
  it("closeCard with a bad result refuses and leaves the open card", () => {
    const p = writeCard(conductor(), env);
    const ref = { project: "DigiSmith", id: "dsm-conductor-01", session: conductor().session };
    expect(() => closeCard(ref, { result: "a\nb", env })).toThrow(CardError);
    expect(fs.existsSync(p)).toBe(true);
    expect(readCard(p).status).toBe("open");
  });
  it("markLost archives with status lost", () => {
    writeCard(worker(), env);
    const a = markLost({ project: "DGS-417", id: "dgs-417-worker", session: "s-w1" }, { env });
    expect(readCard(a).status).toBe("lost");
    expect(a).toContain(`${path.sep}archive${path.sep}`);
  });
  it("close of an unknown card throws", () => {
    expect(() => closeCard({ project: "DigiSmith", id: "nope", session: "x" }, { env })).toThrow(/no card/);
  });
  it("listCards scopes", () => {
    writeCard(conductor(), env);
    writeCard({ ...worker(), domain: "DigiSmith" }, env);
    closeCard({ project: "DigiSmith", id: "dgs-417-worker", session: "s-w1" }, { env });
    expect(listCards("DigiSmith", { env }).map((x) => x.card.id).sort()).toEqual(["dgs-417-worker", "dsm-conductor-01"]);
    expect(listCards("DigiSmith", { scope: "open", env }).map((x) => x.card.id)).toEqual(["dsm-conductor-01"]);
    expect(listCards("DigiSmith", { scope: "archive", env }).map((x) => x.card.id)).toEqual(["dgs-417-worker"]);
    expect(listCards("Nothing", { env })).toEqual([]);
  });
  it("skips a bad card and reports it as a problem", () => {
    writeCard(conductor(), env);
    fs.writeFileSync(path.join(cardsDir("DigiSmith", env), "bad--x.yml"), "role: boss\n");
    expect(listCards("DigiSmith", { env }).length).toBe(1);
    const problems = listCardProblems("DigiSmith", env);
    expect(problems.length).toBe(1);
    expect(problems[0].path).toContain("bad--x.yml");
    expect(problems[0].errors.length).toBeGreaterThan(0);
  });
  it("newestLastSeen spans open and archive, per id; undefined when none", () => {
    expect(newestLastSeen("DigiSmith", "jack-maestro", env)).toBeUndefined();
    writeCard(maestro(), env);
    writeCard({ ...maestro(), session: "s-m2", last_seen: "2026-10-13T15:00+07:00" }, env);
    writeCard({ ...maestro(), session: "s-m3", last_seen: "2026-10-13T18:00+07:00" }, env);
    closeCard({ project: "DigiSmith", id: "jack-maestro", session: "s-m3" }, { now: new Date("2026-10-13T11:00:00Z"), env });
    writeCard(conductor(), env);
    expect(newestLastSeen("DigiSmith", "jack-maestro", env)).toBe("2026-10-13T18:00+07:00");
  });
  it("findCardBySession finds open cards, in one project or across all", () => {
    writeCard(conductor(), env);
    writeCard(worker(), env);
    expect(findCardBySession("s-w1", undefined, env)?.card.id).toBe("dgs-417-worker");
    expect(findCardBySession("s-w1", "DGS-417", env)?.card.id).toBe("dgs-417-worker");
    expect(findCardBySession("s-w1", "DigiSmith", env)).toBeUndefined();
    expect(findCardBySession("nope", undefined, env)).toBeUndefined();
    closeCard({ project: "DGS-417", id: "dgs-417-worker", session: "s-w1" }, { env });
    expect(findCardBySession("s-w1", undefined, env)).toBeUndefined();
  });
  it("findCardBySession with an unsafe session returns undefined", () => {
    expect(findCardBySession("../x", undefined, env)).toBeUndefined();
  });
  it("nowIso uses +07:00 and minute precision", () => {
    expect(nowIso(new Date("2026-10-13T06:40:59Z"))).toBe("2026-10-13T13:40+07:00");
  });
});

describe("cli", { timeout: 30000 }, () => {
  const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), "session-card-cli.ts");
  let tmp: string;
  beforeEach(() => (tmp = fs.mkdtempSync(path.join(os.tmpdir(), "card-cli-"))));
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const run = (...args: string[]) =>
    spawnSync("node", ["--experimental-strip-types", "--no-warnings", cli, "--depot", tmp, ...args], { encoding: "utf-8" });

  it("validate: ok and fail exit codes", () => {
    const good = path.join(tmp, "good.yml");
    fs.writeFileSync(good, formatCard(conductor()));
    const bad = path.join(tmp, "bad.yml");
    fs.writeFileSync(bad, "role: boss\n");
    expect(run("validate", good).status).toBe(0);
    expect(run("validate", good).stdout).toContain("ok");
    const r = run("validate", bad);
    expect(r.status).toBe(1);
    expect(r.stderr + r.stdout).toContain("role");
  });
  it("write then read, list, touch, close", () => {
    const f = path.join(tmp, "c.yml");
    fs.writeFileSync(f, formatCard(conductor()));
    const w = run("write", f);
    expect(w.status).toBe(0);
    expect(w.stdout.trim()).toContain(path.join(tmp, "sessions", "DigiSmith", "cards"));
    expect(run("read", "DigiSmith", "dsm-conductor-01", conductor().session).stdout).toContain("role: conductor");
    expect(run("list", "DigiSmith", "--scope", "open").stdout).toContain("dsm-conductor-01");
    expect(run("touch", "DigiSmith", "dsm-conductor-01", conductor().session).status).toBe(0);
    expect(run("close", "DigiSmith", "dsm-conductor-01", conductor().session, "--result", "done").status).toBe(0);
    expect(run("list", "DigiSmith", "--scope", "archive").stdout).toContain("closed");
  });
  it("creates a Maestro card by hand with --field flags (S11)", () => {
    const r = run("new", "--field", "name=jack-maestro", "--field", "role=maestro", "--field", "id=jack-maestro",
      "--field", "session=s-m1", "--field", "domain=DigiSmith", "--field", "state=note.md",
      "--field", "runs_on=Workbox", "--field", "machine=gradion-mac", "--field", "created_by=jack");
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toContain(path.join("cards", "jack-maestro--s-m1.yml"));
    const c = readCard(r.stdout.trim().split("\n").pop()!);
    expect(c.role).toBe("maestro");
    expect(c.status).toBe("open");
    expect(c.started).toMatch(/\+07:00$/);
  });
  it("new refuses an invalid card (Maestro with under) and writes nothing", () => {
    const r = run("new", "--field", "name=m", "--field", "role=maestro", "--field", "id=m", "--field", "session=s",
      "--field", "domain=D", "--field", "state=n", "--field", "runs_on=x", "--field", "machine=y",
      "--field", "created_by=jack", "--field", "under=jack");
    expect(r.status).toBe(1);
    expect(fs.existsSync(path.join(tmp, "sessions"))).toBe(false);
  });
});
