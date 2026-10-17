import { describe, it, expect } from "vitest";
import { evaluate } from "./rules.ts";
import { EVENTS, GATE_EVENTS, STATUSES, FINISHED } from "./types.ts";
import type { Config, EventInput, EventName, RuleResult, Signoff, TicketView } from "./types.ts";

const OFF: Config = { releaseStage: false };
const ON: Config = { releaseStage: true };
const view = (status: string, extra: Partial<TicketView> = {}): TicketView => ({
  status, signoff: null, mergedRecorded: false, acceptedYes: false, ...extra,
});
const ev = (event: EventName, extra: Partial<EventInput> = {}): EventInput => ({ event, ...extra });
const Q = { quote: "yes, go" };
const to = (r: RuleResult) => (r.kind === "move" ? r.to : r.kind);

describe("entry events, one per status", () => {
  const rows: [EventInput, TicketView, string][] = [
    [ev("concept-started"), view("backlog"), "concept"],
    [ev("discovery-started"), view("concept"), "discovery"],
    [ev("refinement-started"), view("concept"), "refinement"],
    [ev("refinement-started"), view("discovery"), "refinement"],
    [ev("approved", Q), view("refinement"), "to do"],
    [ev("started"), view("to do"), "in progress"],
    [ev("review-started"), view("in progress"), "review"],
    [ev("merged"), view("review", { signoff: "Jack" }), "acceptance"],
    [ev("merged"), view("review", { signoff: "Auto" }), "done"],
    [ev("verified"), view("review", { mergedRecorded: true }), "done"],
    [ev("release-started"), view("review", { signoff: "Auto", mergedRecorded: true }), "release"],
    [ev("released"), view("release"), "done"],
    [ev("documented"), view("done"), "documented"],
    [ev("discard", Q), view("backlog"), "discarded"],
    [ev("close", Q), view("in progress"), "Closed"],
  ];
  it.each(rows)("%j from %j gives %s", (input, v, expected) => {
    expect(to(evaluate(input, v, OFF))).toBe(expected);
  });
  it("every status except backlog is the target of some row; backlog is made by filed", () => {
    const targets = new Set(rows.map((r) => r[2]));
    for (const s of STATUSES) if (s !== "backlog") expect(targets.has(s)).toBe(true);
    expect(to(evaluate(ev("filed"), view("backlog"), OFF))).toBe("refuse");
  });
});

describe("dates", () => {
  it("started sets the start date, done sets the due date", () => {
    expect(evaluate(ev("started"), view("to do"), OFF)).toMatchObject({ startDate: true });
    expect(evaluate(ev("released"), view("release"), OFF)).toMatchObject({ dueDate: true });
    expect(evaluate(ev("merged"), view("review", { signoff: "Auto" }), OFF)).toMatchObject({ dueDate: true, recordMerge: true });
  });
});

describe("merged by Sign-off mark", () => {
  it("Auto goes to release when the release stage is on", () => {
    expect(to(evaluate(ev("merged"), view("review", { signoff: "Auto" }), ON))).toBe("release");
  });
  it("unmarked records the merge and does not move", () => {
    expect(evaluate(ev("merged", { sha: "abc" }), view("review"), OFF)).toEqual({ kind: "record", recordMerge: true });
  });
  it("is refused from in progress", () => {
    expect(to(evaluate(ev("merged"), view("in progress", { signoff: "Auto" }), OFF))).toBe("refuse");
  });
  it("is a no-op when the merge is already recorded and the ticket moved on", () => {
    expect(evaluate(ev("merged"), view("done", { signoff: "Auto", mergedRecorded: true }), OFF)).toEqual({ kind: "noop" });
    expect(evaluate(ev("merged"), view("review", { mergedRecorded: true }), OFF)).toEqual({ kind: "noop" });
  });
});

describe("verified", () => {
  it("is refused for Jack tickets, Auto tickets, and before a merge", () => {
    expect(to(evaluate(ev("verified"), view("review", { signoff: "Jack", mergedRecorded: true }), OFF))).toBe("refuse");
    expect(to(evaluate(ev("verified"), view("review", { signoff: "Auto", mergedRecorded: true }), OFF))).toBe("refuse");
    expect(to(evaluate(ev("verified"), view("review"), OFF))).toBe("refuse");
  });
  it("is refused in acceptance", () => {
    expect(to(evaluate(ev("verified"), view("acceptance", { signoff: "Jack", mergedRecorded: true }), OFF))).toBe("refuse");
  });
});

describe("accepted", () => {
  const a = (answer: "yes" | "no", cfg: Config, v = view("acceptance", { signoff: "Jack", mergedRecorded: true })) =>
    evaluate(ev("accepted", { answer, ...Q }), v, cfg);
  it("yes goes to done, or to release when the stage is on", () => {
    expect(to(a("yes", OFF))).toBe("done");
    expect(to(a("yes", ON))).toBe("release");
  });
  it("no returns to refinement with Jack's words as a comment", () => {
    expect(a("no", OFF)).toMatchObject({ kind: "move", to: "refinement", comment: expect.stringContaining("yes, go") });
  });
  it("needs an answer, and is refused outside acceptance", () => {
    expect(to(evaluate(ev("accepted", Q), view("acceptance"), OFF))).toBe("refuse");
    expect(to(a("yes", OFF, view("review")))).toBe("refuse");
  });
});

describe("release-started", () => {
  it("is valid from acceptance only after an accepted yes", () => {
    expect(to(evaluate(ev("release-started"), view("acceptance"), OFF))).toBe("refuse");
    expect(to(evaluate(ev("release-started"), view("acceptance", { acceptedYes: true }), OFF))).toBe("release");
  });
});

describe("discard and close", () => {
  it("are refused on a finished ticket", () => {
    for (const s of FINISHED.filter((x) => x !== "discarded"))
      expect(to(evaluate(ev("discard", Q), view(s), OFF))).toBe("refuse");
  });
});

describe("idempotent repeats", () => {
  it("an event whose target is the current status is a no-op", () => {
    expect(evaluate(ev("started"), view("in progress"), OFF)).toEqual({ kind: "noop" });
    expect(evaluate(ev("discard", Q), view("discarded"), OFF)).toEqual({ kind: "noop" });
    expect(evaluate(ev("released"), view("done"), OFF)).toEqual({ kind: "noop" });
  });
});

describe("the gates", () => {
  const signoffs: Signoff[] = [null, "Auto", "Jack"];
  const every = () => {
    const out: { input: EventInput; v: TicketView; cfg: Config; r: RuleResult }[] = [];
    for (const event of EVENTS)
      for (const status of STATUSES)
        for (const signoff of signoffs)
          for (const cfg of [OFF, ON])
            for (const flags of [false, true]) {
              const v = view(status, { signoff, mergedRecorded: flags, acceptedYes: flags });
              const input = ev(event, { answer: "yes", ...Q });
              out.push({ input, v, cfg, r: evaluate(input, v, cfg) });
            }
    return out;
  };
  it("only approved moves a ticket into to do, and only from refinement", () => {
    for (const { input, v, r } of every())
      if (r.kind === "move" && r.to === "to do") {
        expect(input.event).toBe("approved");
        expect(v.status).toBe("refinement");
      }
  });
  it("only accepted, discard, close and release-started move a ticket out of acceptance", () => {
    for (const { input, v, r } of every())
      if (v.status === "acceptance" && r.kind === "move") expect(["accepted", "discard", "close", "release-started"]).toContain(input.event);
  });
  it("nothing but approved moves a ticket out of refinement toward to do; only merged enters acceptance", () => {
    for (const { input, v, r } of every()) {
      if (v.status === "refinement" && r.kind === "move" && r.to !== "discarded" && r.to !== "Closed") expect(input.event).toBe("approved");
      if (r.kind === "move" && r.to === "acceptance") expect(input.event).toBe("merged");
    }
  });
  it("every gate event is refused without a quote", () => {
    for (const event of GATE_EVENTS)
      for (const status of STATUSES)
        expect(evaluate({ event, answer: "yes" }, view(status), OFF).kind).toBe("refuse");
  });
});
