import { APPROVE_TARGETS, FINISHED, GATE_EVENTS, type Config, type EventInput, type EventName, type RuleResult, type Status, type TicketView } from "./types.ts";

interface Entry {
  from: Status[];
  to: Status;
}

/** Events with one fixed target. The others (merged, verified, accepted, release-started, discard, close) are below. */
const ENTRY: Partial<Record<EventName, Entry>> = {
  "concept-started": { from: ["backlog"], to: "concept" },
  "discovery-started": { from: ["concept"], to: "discovery" },
  "refinement-started": { from: ["concept", "discovery"], to: "refinement" },
  started: { from: ["to do", "claimed"], to: "in progress" },
  "review-started": { from: ["in progress"], to: "review" },
  released: { from: ["release"], to: "done" },
  documented: { from: ["done"], to: "documented" },
};

const AFTER_MERGE: readonly string[] = ["acceptance", "release", "done", "documented"];

const refuse = (reason: string): RuleResult => ({ kind: "refuse", reason });
const NOOP: RuleResult = { kind: "noop" };

function move(to: Status, extra: Omit<Extract<RuleResult, { kind: "move" }>, "kind" | "to"> = {}): RuleResult {
  return { kind: "move", to, ...(to === "done" ? { dueDate: true } : {}), ...extra };
}

export function evaluate(input: EventInput, view: TicketView, cfg: Config): RuleResult {
  const { event } = input;
  if (GATE_EVENTS.includes(event) && !(input.quote && input.quote.trim() !== "")) {
    return refuse(`${event} needs Jack's own words (--quote)`);
  }
  if (event === "filed") return refuse("filed is made by dg steward file, not sent as an event");
  const entry = ENTRY[event];
  if (entry) return viaEntry(event, entry, view);
  switch (event) {
    case "approved": return approved(input, view);
    case "merged": return merged(view, cfg);
    case "verified": return verified(view);
    case "accepted": return accepted(input, view, cfg);
    case "release-started": return releaseStarted(view);
    case "discard": return closeOut("discarded", view);
    case "close": return closeOut("Closed", view);
    default: return refuse(`unknown event ${String(event)}`);
  }
}

function viaEntry(event: EventName, entry: Entry, view: TicketView): RuleResult {
  if (view.status === entry.to) return NOOP;
  if (!entry.from.includes(view.status as Status)) {
    return refuse(`${event} is valid from ${entry.from.join(" or ")}; the ticket is in ${view.status}`);
  }
  return move(entry.to, event === "started" ? { startDate: true } : {});
}

function approved(input: EventInput, view: TicketView): RuleResult {
  const into = input.into ?? "to do";
  if (!(APPROVE_TARGETS as readonly string[]).includes(into)) return refuse(`approved --into must be one of ${APPROVE_TARGETS.join(", ")}`);
  return viaEntry("approved", { from: ["refinement"], to: into }, view);
}

function merged(view: TicketView, cfg: Config): RuleResult {
  if (view.mergedRecorded && (AFTER_MERGE.includes(view.status) || (view.status === "review" && view.signoff === null))) return NOOP;
  if (view.status !== "review") return refuse(`merged is valid from review; the ticket is in ${view.status}`);
  if (view.signoff === "Auto") return move(cfg.releaseStage ? "release" : "done", { recordMerge: true });
  if (view.signoff === "Jack") return move("acceptance", { recordMerge: true });
  return { kind: "record", recordMerge: true };
}

function verified(view: TicketView): RuleResult {
  if (view.status === "done") return NOOP;
  if (view.status !== "review") return refuse(`verified is valid from review; the ticket is in ${view.status}`);
  if (view.signoff === "Jack") return refuse("a Sign-off: Jack ticket waits for Jack's accepted, never verified");
  if (view.signoff === "Auto") return refuse("a Sign-off: Auto ticket goes done at merged");
  if (!view.mergedRecorded) return refuse("verified needs a recorded merge first");
  return move("done");
}

function accepted(input: EventInput, view: TicketView, cfg: Config): RuleResult {
  if (input.answer !== "yes" && input.answer !== "no") return refuse("accepted needs --answer yes or no");
  if (input.answer === "yes" && (view.status === "done" || view.status === "release")) return NOOP;
  if (input.answer === "no" && view.status === "refinement") return NOOP;
  if (view.status !== "acceptance") return refuse(`accepted is valid from acceptance; the ticket is in ${view.status}`);
  if (input.answer === "yes") return move(cfg.releaseStage ? "release" : "done");
  return move("refinement", { comment: `Jack did not accept: ${input.quote?.trim()}` });
}

function releaseStarted(view: TicketView): RuleResult {
  if (view.status === "release") return NOOP;
  const fromReview = view.status === "review" && view.signoff === "Auto" && view.mergedRecorded;
  const fromAcceptance = view.status === "acceptance" && view.acceptedYes;
  if (fromReview || fromAcceptance) return move("release");
  return refuse(`release-started needs a merged Auto ticket in review, or an accepted yes in acceptance; the ticket is in ${view.status}`);
}

function closeOut(to: "discarded" | "Closed", view: TicketView): RuleResult {
  if (view.status === to) return NOOP;
  if (FINISHED.includes(view.status)) return refuse(`${view.status} is finished; it cannot be ${to}`);
  return move(to);
}
