import type { Candidate, ListTarget, NewTicket, Tracker, TicketSnapshot } from "./tracker.ts";

export const ALL_STATUSES = [
  "backlog", "concept", "discovery", "refinement", "scheduled", "to do", "claimed", "in progress", "review",
  "acceptance", "release", "done", "documented", "discarded", "Closed",
];

export function snapshot(status: string, extra: Partial<TicketSnapshot> = {}): TicketSnapshot {
  return { key: "DGS-1", status, signoff: null, startDate: null, dueDate: null, statuses: ALL_STATUSES, ...extra };
}

/** In-memory Tracker. failWrites = how many of the next write calls throw. */
export class FakeTracker implements Tracker {
  calls: string[] = [];
  comments: string[] = [];
  failWrites = 0;
  targets: ListTarget[] = [];
  candidates: Candidate[] = [];
  created: NewTicket[] = [];

  ticket: TicketSnapshot;

  constructor(ticket: TicketSnapshot) {
    this.ticket = ticket;
  }

  private write(name: string): void {
    this.calls.push(name);
    if (this.failWrites > 0) {
      this.failWrites -= 1;
      throw new Error("write failed");
    }
  }

  async getTicket(): Promise<TicketSnapshot> {
    return { ...this.ticket };
  }
  async setStatus(_key: string, status: string): Promise<void> {
    this.write(`status:${status}`);
    this.ticket.status = status;
  }
  async setDates(_key: string, dates: { start?: string; due?: string }): Promise<void> {
    this.write(`dates:${dates.start ?? ""}|${dates.due ?? ""}`);
    if (dates.start) this.ticket.startDate = dates.start;
    if (dates.due) this.ticket.dueDate = dates.due;
  }
  async addComment(_key: string, text: string): Promise<void> {
    this.write("comment");
    this.comments.push(text);
  }
  async listTargets(): Promise<ListTarget[]> {
    return this.targets;
  }
  async findCandidates(): Promise<Candidate[]> {
    return this.candidates;
  }
  async createTicket(t: NewTicket): Promise<{ key: string; url: string }> {
    this.write("create");
    this.created.push(t);
    return { key: "DGS-900", url: "https://app.clickup.com/t/x" };
  }
}
