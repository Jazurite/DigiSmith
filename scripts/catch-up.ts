import * as fs from "node:fs";
import { parseArgs, requireArgs } from "./cli-args.ts";

export type TimeInput = string | { at: string; fromTool: true };

export interface CatchUp {
  conductor: string;
  window: { from: TimeInput; to: TimeInput };
  identity: string;
  askedBy: string;
  done: { key: string; line: string; report?: string }[];
  running: { worker: string; key: string; stage: string; since: TimeInput }[];
  waiting: { question: string; since: TimeInput; pane: string }[];
  decided: { decision: string; why: string; allowedBy: string }[];
  parked: { what: string; why: string; next: string }[];
  next: string[];
  health: {
    seats: { seat: string; fiveHourPct: number; weeklyPct: number }[];
    server: string;
    tabs: string[];
  };
}

const TEMPLATE_PATH = new URL("../skills/generate-comment/templates/catch-up.md", import.meta.url);
const OFFSET_MS = 7 * 60 * 60 * 1000;
const NEXT_STEPS_SHOWN = 3;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function clock(date: Date, offsetMs: number): { day: string; hm: string } {
  const d = new Date(date.getTime() + offsetMs);
  return {
    day: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    hm: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

export function formatTime(t: TimeInput): string {
  const at = typeof t === "string" ? t : t.at;
  const date = new Date(at);
  // Without Z or an offset, Date reads the string in the host time zone: refuse it.
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(at) || Number.isNaN(date.getTime())) throw new Error(`invalid time: ${JSON.stringify(at)}`);
  const local = clock(date, OFFSET_MS);
  const text = `${local.day} ${local.hm} UTC+7`;
  return typeof t === "string" ? text : `${text} [${clock(date, 0).hm} UTC]`;
}

function lines(items: string[]): string {
  return items.length === 0 ? "none" : items.join("\n");
}

function orNone(value: string): string {
  return value.trim() === "" ? "none" : value;
}

const SECTIONS = ["done", "running", "waiting", "decided", "parked", "next"] as const;

function assertShape(data: CatchUp): void {
  for (const key of ["conductor", "identity", "askedBy"] as const) {
    if (typeof data[key] !== "string" || data[key].trim() === "") {
      throw new Error(`${key} must be a non-empty string`);
    }
  }
  for (const key of SECTIONS) {
    if (!Array.isArray(data[key])) throw new Error(`${key} must be an array`);
  }
  if (!data.health || !Array.isArray(data.health.seats) || !Array.isArray(data.health.tabs)) {
    throw new Error("health must hold seats and tabs arrays");
  }
  for (const s of data.health.seats) {
    if (!Number.isFinite(s.fiveHourPct) || !Number.isFinite(s.weeklyPct)) {
      throw new Error(`seat ${s.seat}: usage must be finite numbers`);
    }
  }
}

export function renderCatchUp(data: CatchUp): string {
  assertShape(data);
  const { health } = data;
  const seats = health.seats.map((s) => `${s.seat}: 5h ${s.fiveHourPct}%, weekly ${s.weeklyPct}%`);
  const values: Record<string, string> = {
    conductor: data.conductor,
    from: formatTime(data.window.from),
    to: formatTime(data.window.to),
    identity: data.identity,
    "asked-by": data.askedBy,
    done: lines(
      data.done.map((d) => `- ${d.key}: ${d.line}.${d.report ? ` Report: ${d.report}` : ""}`),
    ),
    running: lines(
      data.running.map((r) => `- ${r.worker} | ${r.key} | ${r.stage} | since ${formatTime(r.since)}`),
    ),
    waiting: lines(
      data.waiting.map((w) => `- ${w.question} | since ${formatTime(w.since)} | pane ${w.pane}`),
    ),
    decided: lines(
      data.decided.map((d) => `- ${d.decision} | why: ${d.why} | allowed by: ${d.allowedBy}`),
    ),
    parked: lines(data.parked.map((p) => `- ${p.what} | why: ${p.why} | next step: ${p.next}`)),
    next: lines(data.next.slice(0, NEXT_STEPS_SHOWN).map((s, i) => `${i + 1}. ${s}`)),
    health: [
      `- Seats and usage: ${orNone(seats.join("; "))}`,
      `- Server: ${orNone(health.server)}`,
      `- Open tabs: ${health.tabs.length === 0 ? "none" : `${health.tabs.length}: ${health.tabs.join(", ")}`}`,
    ].join("\n"),
  };
  const template = fs.readFileSync(TEMPLATE_PATH, "utf-8").replace(/\r\n/g, "\n");
  // One pass over the template, so a value that holds "<running>" is never filled again.
  return template
    .replace(/<([a-z-]+)>/g, (token, key: string) => values[key] ?? token)
    .trim();
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  try {
    requireArgs(args, ["data"]);
    const data = JSON.parse(fs.readFileSync(args.data, "utf-8")) as CatchUp;
    console.log(renderCatchUp(data));
  } catch (err) {
    console.error(`catch-up: failed (${err instanceof Error ? err.message : String(err)})`);
    process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
