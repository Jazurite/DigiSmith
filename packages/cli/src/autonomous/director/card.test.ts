import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUTHORITY } from "./authority.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const card = readFileSync(join(ROOT, "skills/director/SKILL.md"), "utf8");
const brief = readFileSync(join(ROOT, "skills/director/brief.md"), "utf8");
const refineBrief = readFileSync(join(ROOT, "skills/director/refine-brief.md"), "utf8");
const docs = readFileSync(join(ROOT, "docs/director.md"), "utf8");

/** The text of the `## Authority` section, up to the next `## ` heading. */
const authoritySection = (): string => {
  const m = /^## Authority\n([\s\S]*?)(?=^## |\n?$(?![\s\S]))/m.exec(card);
  if (!m) throw new Error("no ## Authority section");
  return m[1];
};
const idsInTables = (text: string): string[] => [...text.matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|/gm)].map((m) => m[1]);

describe("skills/director/SKILL.md", () => {
  it("every authority id in authority.ts appears in the card, and every id in the card's authority tables is in authority.ts", () => {
    const inCard = idsInTables(authoritySection());
    expect([...inCard].sort()).toEqual(AUTHORITY.map((e) => e.id).sort());
    expect(new Set(inCard).size).toBe(inCard.length);
  });
  it("has the sections Purpose, Lives, Owns, Does not own, Talks to, Reads, Authority, Rules", () => {
    for (const s of ["Purpose", "Lives", "Owns", "Does not own", "Talks to", "Reads"]) expect(card).toMatch(new RegExp(`^${s}:`, "m"));
    for (const s of ["Authority", "Rules"]) expect(card).toMatch(new RegExp(`^## ${s}$`, "m"));
  });
  it("has frontmatter name director and a description starting 'Use when'", () => {
    const fm = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(card);
    expect(fm?.[1]).toBe("director");
    expect(fm?.[2]).toMatch(/^Use when/);
  });
  it("says 'Jack changes this list'", () => {
    expect(card).toContain("Jack changes this list");
  });
  it("says to run moves with dg director do and never to start a Reviewer itself (the project conductor starts the plan Reviewer)", () => {
    expect(card).toContain("dg director do");
    expect(card).toMatch(/never start a Reviewer yourself/i);
    expect(card).toMatch(/project conductor starts the plan Reviewer/i);
  });
  it("says the Director never edits a ticket description (it cannot write the Authority change approved by Jack line)", () => {
    expect(card).toMatch(/never edit(s)? a ticket description/i);
    expect(card).toContain("Authority change approved by Jack");
  });
  it("names the Castle session and the LaunchDaemon com.jazurite.herdr-castle", () => {
    expect(card).toContain("Castle");
    expect(card).toContain("com.jazurite.herdr-castle");
  });
  it("does not mention the express lane except the line 'express lane: DGS-700, later'", () => {
    const lines = card.split("\n").filter((l) => /express/i.test(l));
    expect(lines).toEqual(["express lane: DGS-700, later"]);
  });
  it("tells the Director to do start-again and reprompt-to-self itself in its own session and then record the move (dg director do cannot)", () => {
    expect(card).toMatch(/start-again/);
    expect(card).toMatch(/dg director do[^\n]*cannot|cannot[^\n]*dg director do/i);
    expect(card).toContain("dg director decide --id restart-run");
    expect(card).toContain("dg director decide --id reprompt-run");
    expect(card).toMatch(/refine-brief\.md/);
    expect(card).toMatch(/do it yourself in your own session/i);
  });
  it("F2: the Director keeps a Monitor watch on the refine worker's pane for 'STOP: plan-ready' and then asks the project conductor for the plan Reviewer; the wake-up rule has the exception", () => {
    expect(card).toMatch(/Monitor/);
    expect(card).toContain("STOP: plan-ready");
    expect(card).toMatch(/keep a Monitor watch on (its|the worker's) pane for .?STOP: plan-ready/i);
    expect(card).toMatch(/then ask the project conductor[^\n]*plan Reviewer/i);
    expect(card).toMatch(/nothing else, except the refine watch/i);
  });
  it("F6: the card says the Monitor watch is the one route, ignores a second copy of the same STOP line for the same round and asks the plan Reviewer once per round", () => {
    expect(card).not.toMatch(/relays the line/i);
    expect(card).toMatch(/ignore a second copy of the same `?STOP: plan-ready`? line for the same round/i);
    expect(card).toMatch(/once per round/i);
  });
  it("F4: the card says how the Director stops a stuck refine run (dg run event <run-id> lost) and records it", () => {
    expect(card).toMatch(/older than 6 hours/);
    expect(card).toContain("dg run event <run-id> lost");
    expect(card).toContain("dg director decide --id release-stopped");
  });
  it("has the loop, the refine flow, the unblock table, escalation and the decision record", () => {
    for (const h of ["## The loop", "## The refine flow", "## Unblocking", "## Escalation", "## The decision record"]) expect(card).toContain(h);
  });
  it("keeps the rules: no prompts, no token read, no sudo, dg run start only, UTC+7, no AI attribution", () => {
    const rules = card.slice(card.indexOf("## Rules"));
    for (const s of ["permission, delete or \"keep allowing\" prompt", "token", "sudo", "dg run start", "UTC+7", "AI attribution"]) expect(rules).toContain(s);
  });
});

describe("skills/director/brief.md", () => {
  it("tells the Director session to read the card, run dg director plan, and follow the voice rules", () => {
    expect(brief).toContain("skills/director/SKILL.md");
    expect(brief).toContain("dg director plan");
    expect(brief).toMatch(/conversation voice/i);
    expect(brief).toMatch(/no questions in chat/i);
    expect(brief).toContain("UTC+7");
    expect(brief).toMatch(/AI attribution/i);
    expect(brief).toContain("~/.digismith-depot/autonomous");
  });
});

describe("skills/director/refine-brief.md", () => {
  it("says: never edit the ticket description, never write the 'Authority change approved by Jack' line, name an authority path only when the plan changes it, and call the protected list 'the protected paths (section 13, DEFAULT_PROTECTED)'", () => {
    expect(refineBrief).toMatch(/never edit the ticket description/i);
    expect(refineBrief).toContain("Authority change approved by Jack");
    expect(refineBrief).toMatch(/never write the .?Authority change approved by Jack/i);
    expect(refineBrief).toMatch(/name an authority path only when the plan changes it/i);
    expect(refineBrief).toContain("the protected paths (section 13, DEFAULT_PROTECTED)");
  });
  it("F6: the brief says the Director started you and watches your pane for the STOP line; it does not claim a conductor relays it", () => {
    expect(refineBrief).toMatch(/Director started you/i);
    expect(refineBrief).toMatch(/watches your pane[^\n]*STOP: plan-ready|STOP: plan-ready[^\n]*watches your pane/i);
    expect(refineBrief).not.toMatch(/conductor that watches your pane|relays that line|agent prompt director/i);
  });
  it("has the shape of a refine worker brief: docs only, no worktree, no branch, board folder, STOP: plan-ready, placeholders", () => {
    for (const s of ["docs only", "no worktree", "no branch", "STOP: plan-ready", "<KEY>", "<board folder>", "<seat>", "done"]) expect(refineBrief).toContain(s);
    expect(refineBrief).toMatch(/never scope a commit with the ticket key/i);
  });
});

describe("docs/director.md", () => {
  it("names the lanes, the state files, the commands and the express line", () => {
    for (const s of ["refine-lock.json", "director/decisions.jsonl", "escalations.jsonl", "comment-pending.jsonl", "last-tick.json", "dg director plan", "dg director do", "express lane: DGS-700, later"]) expect(docs).toContain(s);
  });
});
