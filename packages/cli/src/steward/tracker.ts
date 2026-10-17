import type { Signoff } from "./types.ts";

export interface TicketSnapshot {
  key: string;
  status: string;
  signoff: Signoff;
  /** Date-only, UTC+7, or null. */
  startDate: string | null;
  dueDate: string | null;
  /** The status names on the ticket's list. */
  statuses: string[];
}

export interface ListTarget { id: string; name: string; folder: string; description: string }
export interface Candidate { key: string; name: string; status: string; list: string }
export interface NewTicket { listId: string; name: string; type: string; description?: string }

export interface Tracker {
  getTicket(key: string): Promise<TicketSnapshot>;
  setStatus(key: string, status: string): Promise<void>;
  setDates(key: string, dates: { start?: string; due?: string }): Promise<void>;
  addComment(key: string, text: string): Promise<void>;
  listTargets(): Promise<ListTarget[]>;
  findCandidates(idea: string): Promise<Candidate[]>;
  createTicket(t: NewTicket): Promise<{ key: string; url: string }>;
}
