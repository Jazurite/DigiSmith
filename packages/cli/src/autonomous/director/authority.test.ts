import { describe, expect, it } from "vitest";
import {
  AUTHORITY, AUTHORITY_PATHS, AUTHORITY_PATH_SPELLINGS, approvalCovers, checkAuthority, fullPathCovered, isAuthorityFile, isCovered, namesAuthorityPath, parseApproval,
} from "./authority.ts";

const WITHIN = ["claim-refine", "claim-build", "start-worker", "pick-seat", "apply-refinement-gate", "reprompt-run", "restart-run", "release-stopped", "escalate-concept", "start-ticket-conductor", "record-decision"];
const JACK = ["delete-data", "spend-money", "go-public", "personal-data", "product-taste-names-scope", "change-authority", "answer-prompt", "change-host", "close-breaker", "merge-protected", "rewrite-history"];
const D = "packages/cli/src/autonomous/director/";

describe("checkAuthority", () => {
  it("a within id passes", () => {
    expect(checkAuthority("claim-refine")).toEqual({ ok: true });
  });
  it("a Jack-only id is refused with code 3", () => {
    const r = checkAuthority("delete-data");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(3);
      expect(r.text).toContain("outside the Director's authority: use dg director escalate");
    }
  });
  it("an unknown id is refused with code 4", () => {
    const r = checkAuthority("make-coffee");
    expect(r).toMatchObject({ ok: false, code: 4 });
  });
});

describe("the list", () => {
  it("the list has the 11 within ids and the 11 Jack ids of the spec", () => {
    expect(AUTHORITY.filter((e) => e.side === "within").map((e) => e.id).sort()).toEqual([...WITHIN].sort());
    expect(AUTHORITY.filter((e) => e.side === "jack").map((e) => e.id).sort()).toEqual([...JACK].sort());
  });
  it("ids are unique and every entry has a reason", () => {
    const ids = AUTHORITY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of AUTHORITY) { expect(e.reason.length).toBeGreaterThan(0); expect(e.text.length).toBeGreaterThan(0); }
  });
  it("has the ten full authority paths", () => {
    expect(AUTHORITY_PATHS).toHaveLength(10);
    expect(AUTHORITY_PATHS).toContain(D);
    expect(AUTHORITY_PATHS).toContain(".digismith/profiles/");
  });
});

describe("namesAuthorityPath", () => {
  it("returns whole path TOKENS", () => {
    expect(namesAuthorityPath("edit director/refine.ts")).toEqual(["director/refine.ts"]);
    expect(namesAuthorityPath("autonomous/protected-paths.ts")).toEqual(["autonomous/protected-paths.ts"]);
    expect(namesAuthorityPath("the director/ folder")).toEqual(["director/"]);
  });
  it("removes leading ./ and ../ and trailing punctuation; duplicates collapse", () => {
    expect(namesAuthorityPath("see ./director/refine.ts, and ../director/refine.ts.")).toEqual(["director/refine.ts"]);
  });
  it.each(["authority-backstop.ts", "merge-gate.ts", "breaker.ts", "refine.ts", "refine-brief.md"])("%s is a hit", (f) => {
    expect(namesAuthorityPath(`change ${f} now`)).toEqual([f]);
  });
  it.each([
    "director/authority.ts", "autonomous/director/", "authority.ts", "skills/director", "run/limit", "limit-check.ts", "limit.ts", "guardrails.ts",
    "autonomous/protected-paths.ts", "protected-paths.ts", "config.yml", "nightwatch.limits", "protected_paths", "mandate.yml", "profiles/",
  ])("finds the short spelling %s, case-insensitive", (s) => {
    expect(namesAuthorityPath(`we touch ${s} here`)).toContain(s);
    expect(namesAuthorityPath(`we touch ${s.toUpperCase()} here`)).toHaveLength(1);
  });
  it("finds every full path", () => {
    for (const p of AUTHORITY_PATHS) expect(namesAuthorityPath(`edit ${p} please`).length).toBeGreaterThan(0);
  });
  it("returns [] for a text that names none", () => {
    expect(namesAuthorityPath("a directory/listing of notes")).toEqual([]);
    expect(namesAuthorityPath("")).toEqual([]);
  });
});

describe("parseApproval", () => {
  it("reads the line into { date, paths }", () => {
    const d = "Some text\nauthority change approved by jack: 2026-11-03: director/refine.ts, .digismith/config.yml\nmore";
    expect(parseApproval(d)).toEqual({ date: "2026-11-03", paths: ["director/refine.ts", ".digismith/config.yml"] });
  });
  it("a line without paths is not an approval; no line gives null", () => {
    expect(parseApproval("Authority change approved by Jack: 2026-11-03:")).toBeNull();
    expect(parseApproval("Authority change approved by Jack: 2026-11-03")).toBeNull();
    expect(parseApproval("nothing here")).toBeNull();
  });
  it("the line must start the line", () => {
    expect(parseApproval("note: Authority change approved by Jack: 2026-11-03: a.ts")).toBeNull();
  });
});

describe("isCovered and approvalCovers", () => {
  it("equal, suffix, under a folder", () => {
    expect(isCovered("director/refine.ts", ["director/refine.ts"])).toBe(true);
    expect(isCovered("authority.ts", [`${D}authority.ts`])).toBe(true);
    expect(isCovered(`${D}refine.ts`, [D])).toBe(true);
    expect(isCovered("director/refine.ts", [D])).toBe(true);
  });
  it("a suffix must sit at a / boundary", () => {
    expect(isCovered("thority.ts", [`${D}authority.ts`])).toBe(false);
  });
  it("a folder token is covered only by a folder approval", () => {
    expect(isCovered("director/", [D])).toBe(true);
    expect(isCovered("director/", [`${D}authority.ts`])).toBe(false);
  });
  it("approval for director/authority.ts covers neither director/refine.ts nor a bare director/", () => {
    const a = { paths: ["director/authority.ts"] };
    expect(approvalCovers(a, ["director/refine.ts", "director/"])).toEqual(["director/refine.ts", "director/"]);
  });
  it("approval for the director folder covers both", () => {
    expect(approvalCovers({ paths: [D] }, ["director/refine.ts", "director/"])).toEqual([]);
  });
  it("guardrails.ts does not cover config.yml; config.yml covers the config keys", () => {
    expect(approvalCovers({ paths: ["packages/cli/src/autonomous/guardrails.ts"] }, ["config.yml"])).toEqual(["config.yml"]);
    expect(approvalCovers({ paths: [".digismith/config.yml"] }, ["nightwatch.limits", "protected_paths"])).toEqual([]);
  });
  it("a null approval covers nothing", () => {
    expect(approvalCovers(null, ["a.ts", "b/"])).toEqual(["a.ts", "b/"]);
    expect(approvalCovers(null, [])).toEqual([]);
  });
});

describe("isAuthorityFile", () => {
  it("whole tokens at / boundaries or exact basenames", () => {
    expect(isAuthorityFile("profiles/emma.yml")).toBe(false);
    expect(isAuthorityFile(".digismith/profiles/x.yml")).toBe(true);
    expect(isAuthorityFile("rate-limit.ts")).toBe(false);
    expect(isAuthorityFile("packages/cli/src/run/rate-limit.ts")).toBe(false);
    expect(isAuthorityFile("packages/cli/src/run/limit-check.ts")).toBe(true);
    expect(isAuthorityFile("limit.ts")).toBe(true);
  });
  it("the guard code and the director folder are authority files", () => {
    for (const f of ["authority-backstop.ts", "merge-gate.ts", "breaker.ts"]) expect(isAuthorityFile(f)).toBe(true);
    expect(isAuthorityFile(`${D}authority-backstop.ts`)).toBe(true);
    expect(isAuthorityFile("packages/cli/src/autonomous/merge-gate.ts")).toBe(true);
    expect(isAuthorityFile("packages/cli/src/autonomous/breaker.ts")).toBe(true);
    expect(isAuthorityFile(`${D}refine.ts`)).toBe(true);
    expect(isAuthorityFile("skills/director/SKILL.md")).toBe(true);
    expect(isAuthorityFile(".digismith/config.yml")).toBe(true);
    expect(isAuthorityFile("packages/cli/src/autonomous/scan.ts")).toBe(false);
    expect(isAuthorityFile("docs/director.md")).toBe(false);
  });
});

describe("fullPathCovered", () => {
  const f = `${D}refine.ts`;
  it("a /-boundary suffix, equal, or folder covers", () => {
    expect(fullPathCovered(f, ["director/refine.ts"])).toBe(true);
    expect(fullPathCovered(f, [f])).toBe(true);
    expect(fullPathCovered(f, [D])).toBe(true);
    expect(fullPathCovered(`${D}authority.ts`, [D])).toBe(true);
    expect(fullPathCovered(`${D}authority.ts`, ["director/refine.ts"])).toBe(false);
  });
  it("limit.ts does not cover rate-limit.ts (not at a / boundary)", () => {
    expect(fullPathCovered("packages/cli/src/run/rate-limit.ts", ["limit.ts"])).toBe(false);
    expect(fullPathCovered("packages/cli/src/run/limit.ts", ["limit.ts"])).toBe(true);
  });
});

describe("approvals written the way Jack writes them (F1, F2)", () => {
  it("F1: a trailing period, ./ or ../ on an approval path does not break coverage", () => {
    const a = parseApproval("Authority change approved by Jack: 2026-11-03: ./director/authority.ts., ../director/refine.ts.");
    expect(a?.paths).toEqual(["director/authority.ts", "director/refine.ts"]);
    expect(approvalCovers(a, ["director/authority.ts", "director/refine.ts"])).toEqual([]);
    expect(isCovered("director/authority.ts", ["director/authority.ts."])).toBe(true);
    expect(isCovered("director/authority.ts", ["./director/authority.ts"])).toBe(true);
  });
  it("F2: a short-spelling approval covers the config keys", () => {
    expect(isCovered("nightwatch.limits", ["config.yml"])).toBe(true);
    expect(isCovered("protected_paths", ["config.yml"])).toBe(true);
    expect(isCovered("protected_paths", [".digismith/config.yml"])).toBe(true);
    expect(isCovered("nightwatch.limits", [".digismith/"])).toBe(true);
    expect(isCovered("nightwatch.limits", ["mandate.yml"])).toBe(false);
    expect(isCovered("nightwatch.limits", ["guardrails.ts"])).toBe(false);
  });
  it("F2: a slash-less folder token is covered by the folder approval, and only by a folder approval", () => {
    expect(isCovered("skills/director", ["skills/director/"])).toBe(true);
    expect(isCovered("skills/director", ["skills/director"])).toBe(true);
    expect(isCovered("skills/director", ["skills/other/"])).toBe(false);
    expect(isCovered("skills/director", ["skills/director/SKILL.md"])).toBe(false);
    expect(isCovered("run/limit", ["packages/cli/src/run/limit/"])).toBe(true);
  });
  it("every spelling is covered by an approval of its own full path or an equal short form, and by nothing unrelated", () => {
    for (const p of AUTHORITY_PATHS) {
      for (const tok of namesAuthorityPath(`edit ${p} now`)) expect(isCovered(tok, [p])).toBe(true);
    }
    for (const sp of AUTHORITY_PATH_SPELLINGS) {
      expect(isCovered(sp, [sp])).toBe(true);
      if (/.\/./.test(sp.replace(/\/$/, ""))) expect(isCovered(sp.replace(/\/$/, ""), [sp])).toBe(true);
      expect(isCovered(sp, ["unrelated/other.ts"])).toBe(false);
    }
  });
});
