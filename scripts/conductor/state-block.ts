// The conductor's structured state: one block inside its (otherwise free-form) note.
// Line formats equal the catch-up template's rendered lines (DGS-427, design section 7).
import * as fs from "node:fs";
import * as path from "node:path";

export interface Marker {
  name: string;
  version?: string;
  attrs?: string;
}

export const STATE_MARKER: Marker = { name: "digismith:conductor-state", version: "v1" };

export function catchUpMarker(identity: string): Marker {
  return { name: "digismith:catch-up", version: "v1", attrs: `maestro=${identity}` };
}

export function markerLines(m: Marker): { open: string; close: string } {
  const open = [m.name, m.version, m.attrs].filter(Boolean).join(" ");
  const close = [m.name, m.attrs].filter(Boolean).join(" ");
  return { open: `<!-- ${open} -->`, close: `<!-- /${close} -->` };
}

export interface BlockMatch {
  found: boolean;
  body: string;
  /** index where the body starts (after the open line) and ends (start of the close line) */
  bodyStart: number;
  bodyEnd: number;
}

export function extractBlock(text: string, marker: Marker): BlockMatch {
  const { open, close } = markerLines(marker);
  const lines = text.split("\n");
  let offset = 0;
  const opens: { start: number; bodyStart: number }[] = [];
  let closeAt: { start: number } | undefined;
  for (const line of lines) {
    const next = offset + line.length + 1;
    const t = line.trim();
    if (t === open) opens.push({ start: offset, bodyStart: Math.min(next, text.length) });
    else if (t === close && opens.length === 1 && !closeAt) closeAt = { start: offset };
    offset = next;
  }
  if (opens.length === 0) return { found: false, body: "", bodyStart: 0, bodyEnd: 0 };
  if (opens.length > 1) throw new Error(`the note has ${opens.length} blocks "${open}": two or more; keep one`);
  if (!closeAt) throw new Error(`the block "${open}" has no close marker "${close}"`);
  return {
    found: true,
    body: text.slice(opens[0].bodyStart, closeAt.start),
    bodyStart: opens[0].bodyStart,
    bodyEnd: closeAt.start,
  };
}

export function writeStateBlock(notePath: string, body: string, marker: Marker = STATE_MARKER): void {
  if (body.split("\n").some((l) => /^\s*<!--\s*\/?digismith:/.test(l))) {
    throw new Error("the block body must not contain a digismith marker line");
  }
  const { open, close } = markerLines(marker);
  const clean = body.endsWith("\n") ? body : `${body}\n`;
  let existing = "";
  let mode = 0o644;
  if (fs.existsSync(notePath)) {
    notePath = fs.realpathSync(notePath); // a symlinked note: write next to the target and keep the link
    existing = fs.readFileSync(notePath, "utf-8");
    mode = fs.statSync(notePath).mode & 0o777;
  }
  const m = extractBlock(existing, marker);
  let out: string;
  if (m.found) {
    out = existing.slice(0, m.bodyStart) + clean + existing.slice(m.bodyEnd);
  } else {
    const sep = existing === "" ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
    out = `${existing}${sep}${open}\n${clean}${close}\n`;
  }
  fs.mkdirSync(path.dirname(notePath), { recursive: true });
  const tmp = path.join(path.dirname(notePath), `.${path.basename(notePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, out, { mode });
  fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, notePath);
}

// ---- the structured body ----

export interface RunningRow { worker: string; key: string; stage: string; since: string }
export interface WaitingRow { question: string; since: string; pane: string }
export interface DecidedRow { decision: string; why: string; allowedBy: string }
export interface ParkedRow { what: string; why: string; next: string }
export interface Seat { seat: string; fiveHourPct: number; weeklyPct: number }

export interface NoteState {
  updated?: string;
  /** when the block content (not the refresh time) last changed */
  changed?: string;
  /** files and folders whose mtime state-refresh compares with `changed` */
  watch?: string[];
  /** set when Running could not be rebuilt: the reason */
  runningUnknown?: string;
  conductor?: string;
  /** the worker names the conductor passed to state-refresh; the next refresh reuses them */
  workers?: string[];
  /** newest merge (short hash) on origin/main when the block was refreshed */
  main?: string;
  /** panes in the conductor's workspace that no card and no --workers list assigns (computed by state-refresh) */
  ownerUnknown?: string[];
  running: RunningRow[];
  waiting: WaitingRow[];
  decided: DecidedRow[];
  parked: ParkedRow[];
  next: string[];
  seats: Seat[];
}

const SECTIONS = ["Running", "Waiting for Jack", "Decided under the mandate", "Parked or failed", "Next", "Health"] as const;
type Section = (typeof SECTIONS)[number];

const FORMATS: Record<Section, string> = {
  Running: "- <worker> | <KEY> | <stage> | since <time>",
  "Waiting for Jack": "- <question> | since <time> | pane <w:p>",
  "Decided under the mandate": "- <decision> | why: <reason> | allowed by: <order or standing rule>",
  "Parked or failed": "- <what> | why: <reason> | next step: <step>",
  Next: "1. <step>",
  Health: "- Seats and usage: jack: 5h 19%, weekly 59%; dev0: 5h 12%, weekly 36%",
};

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(:\d{2})?(Z|[+-]\d{2}:\d{2})$/;
const HUMAN = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC\+7$/;

/** Accepts an ISO time with offset, or "YYYY-MM-DD HH:MM UTC+7" (the template's rendering). Returns undefined if invalid. */
export function parseTime(raw: string): string | undefined {
  const t = raw.trim();
  const h = HUMAN.exec(t);
  const iso = h ? `${h[1]}T${h[2]}:00+07:00` : t;
  if (!ISO.test(iso)) return undefined;
  if (Number.isNaN(Date.parse(iso))) return undefined;
  // Date.parse rolls 31 Feb over to March: check the calendar date itself
  const [y, mo, d] = iso.slice(0, 10).split("-").map(Number);
  const cal = new Date(Date.UTC(y, mo - 1, d));
  return cal.getUTCFullYear() === y && cal.getUTCMonth() === mo - 1 && cal.getUTCDate() === d ? iso : undefined;
}

function stripBullet(line: string): string {
  return line.replace(/^\s*(?:-\s+|\d+\.\s+)/, "").trim();
}

function isNone(s: string): boolean {
  return s === "" || /^none$/i.test(s);
}

function prefixed(s: string, prefix: string): string | undefined {
  return s.startsWith(prefix) ? s.slice(prefix.length).trim() : undefined;
}

export function parseSeats(raw: string): Seat[] | undefined {
  const out: Seat[] = [];
  for (const part of raw.split(";")) {
    const m = /^\s*(\S+?):\s*5h\s+(\d+(?:\.\d+)?)%,\s*weekly\s+(\d+(?:\.\d+)?)%\s*$/.exec(part);
    if (!m) return undefined;
    out.push({ seat: m[1], fiveHourPct: Number(m[2]), weeklyPct: Number(m[3]) });
  }
  return out;
}

export function parseStateBody(body: string, firstLine = 1): { state: NoteState; problems: string[] } {
  const state: NoteState = { running: [], waiting: [], decided: [], parked: [], next: [], seats: [] };
  const problems: string[] = [];
  let section: Section | "unknown" | undefined;
  const lines = body.split("\n");
  lines.forEach((raw, i) => {
    const n = i + firstLine;
    const line = raw.trimEnd();
    if (line.trim() === "") return;
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      const name = heading[1].trim();
      section = (SECTIONS as readonly string[]).includes(name) ? (name as Section) : "unknown";
      if (section === "unknown") {
        problems.push(`line ${n}: unknown heading "${name}"; expected one of: ${SECTIONS.join(", ")}`);
      }
      return;
    }
    if (section === undefined) {
      const u = prefixed(line, "Updated:");
      const c = prefixed(line, "Conductor:");
      const w = prefixed(line, "Workers:");
      const mh = prefixed(line, "Main:");
      const ch = prefixed(line, "Changed:");
      const wa = prefixed(line, "Watch:");
      const ru = prefixed(line, "Running:");
      if (mh !== undefined) state.main = mh;
      else if (ch !== undefined) {
        const t = parseTime(ch);
        if (t) state.changed = t;
        else problems.push(`line ${n}: Changed needs a time like 2026-10-13T14:05+07:00 (got "${ch}")`);
      } else if (wa !== undefined) state.watch = isNone(wa) ? [] : wa.split(",").map((x) => x.trim()).filter(Boolean);
      else if (ru !== undefined) {
        const m = /^unknown \((.*)\)$/.exec(ru);
        if (m) state.runningUnknown = m[1];
        else problems.push(`line ${n}: Running here must read "unknown (<reason>)" (got "${ru}")`);
      }
      else if (w !== undefined) state.workers = isNone(w) ? [] : w.split(",").map((x) => x.trim()).filter(Boolean);
      else if (u !== undefined) {
        const t = parseTime(u);
        if (t) state.updated = t;
        else problems.push(`line ${n}: Updated needs a time like 2026-10-13T14:05+07:00 (got "${u}")`);
      } else if (c !== undefined) state.conductor = c;
      else problems.push(`line ${n}: text before the first "## " heading; only "Updated:", "Changed:", "Conductor:", "Workers:", "Watch:", "Running: unknown (...)" and "Main:" are allowed there`);
      return;
    }
    if (section === "unknown") return;
    const item = stripBullet(line);
    if (isNone(item)) return;
    const bad = (why: string) => problems.push(`line ${n}: ${why}; expected "${FORMATS[section as Section]}"`);
    const time = (s: string, prefix: string): string | undefined => {
      const v = prefixed(s, prefix);
      const t = v === undefined ? undefined : parseTime(v);
      if (v !== undefined && !t) problems.push(`line ${n}: bad time "${v}"; use 2026-10-13T14:05+07:00 or 2026-10-13 14:05 UTC+7`);
      return v === undefined ? undefined : t ?? v;
    };
    const parts = item.split(" | ").map((s) => s.trim());
    switch (section) {
      case "Running": {
        if (parts.length !== 4 || !parts[3].startsWith("since ")) return bad("needs 4 fields");
        state.running.push({ worker: parts[0], key: parts[1], stage: parts[2], since: time(parts[3], "since ") ?? "" });
        return;
      }
      case "Waiting for Jack": {
        const pane = parts.length >= 3 ? prefixed(parts[parts.length - 1], "pane ") : undefined;
        if (pane === undefined || !parts[parts.length - 2].startsWith("since ")) return bad("needs question, since, pane");
        state.waiting.push({
          question: parts.slice(0, -2).join(" | "),
          since: time(parts[parts.length - 2], "since ") ?? "",
          pane,
        });
        return;
      }
      case "Decided under the mandate": {
        const why = parts.length >= 3 ? prefixed(parts[parts.length - 2], "why:") : undefined;
        const by = parts.length >= 3 ? prefixed(parts[parts.length - 1], "allowed by:") : undefined;
        if (why === undefined || by === undefined) return bad("needs decision, why, allowed by");
        state.decided.push({ decision: parts.slice(0, -2).join(" | "), why, allowedBy: by });
        return;
      }
      case "Parked or failed": {
        const why = parts.length >= 3 ? prefixed(parts[parts.length - 2], "why:") : undefined;
        const next = parts.length >= 3 ? prefixed(parts[parts.length - 1], "next step:") : undefined;
        if (why === undefined || next === undefined) return bad("needs what, why, next step");
        state.parked.push({ what: parts.slice(0, -2).join(" | "), why, next });
        return;
      }
      case "Next":
        state.next.push(item);
        return;
      case "Health": {
        const seats = prefixed(item, "Seats and usage:");
        if (seats === undefined) {
          const ou = prefixed(item, "Owner unknown:");
          if (ou !== undefined) {
            state.ownerUnknown = isNone(ou) ? [] : ou.split(",").map((x) => x.trim()).filter(Boolean);
            return;
          }
          if (/^(Server|Open tabs):/.test(item)) return; // computed from herdr, not read from the note
          return bad("unknown Health line");
        }
        if (isNone(seats)) return;
        const parsed = parseSeats(seats);
        if (!parsed) return bad(`cannot read seats "${seats}"`);
        state.seats.push(...parsed);
        return;
      }
    }
  });
  return { state, problems };
}

function section(name: string, rows: string[]): string {
  return `## ${name}\n${rows.length ? rows.join("\n") : "none"}\n`;
}

export function renderStateBody(s: NoteState): string {
  const head = [
    s.updated ? `Updated: ${s.updated}` : "",
    s.changed ? `Changed: ${s.changed}` : "",
    s.conductor ? `Conductor: ${s.conductor}` : "",
    s.main ? `Main: ${s.main}` : "",
    s.workers ? `Workers: ${s.workers.join(", ") || "none"}` : "",
    s.watch ? `Watch: ${s.watch.join(", ") || "none"}` : "",
    s.runningUnknown !== undefined ? `Running: unknown (${s.runningUnknown})` : "",
  ].filter(Boolean);
  const seats = s.seats.map((x) => `${x.seat}: 5h ${x.fiveHourPct}%, weekly ${x.weeklyPct}%`).join("; ");
  const parts = [
    section("Running", s.running.map((r) => `- ${r.worker} | ${r.key} | ${r.stage} | since ${r.since}`)),
    section("Waiting for Jack", s.waiting.map((r) => `- ${r.question} | since ${r.since} | pane ${r.pane}`)),
    section("Decided under the mandate", s.decided.map((r) => `- ${r.decision} | why: ${r.why} | allowed by: ${r.allowedBy}`)),
    section("Parked or failed", s.parked.map((r) => `- ${r.what} | why: ${r.why} | next step: ${r.next}`)),
    section("Next", s.next.map((r, i) => `${i + 1}. ${r}`)),
    `## Health\n- Seats and usage: ${seats || "none"}\n${s.ownerUnknown?.length ? `- Owner unknown: ${s.ownerUnknown.join(", ")}\n` : ""}`,
  ];
  return (head.length ? `${head.join("\n")}\n\n` : "") + parts.join("\n");
}

/** The block text without the refresh time, content time and Main: equal keys mean the content did not change (DGS-577). */
export function contentKey(s: NoteState): string {
  return renderStateBody({ ...s, updated: undefined, changed: undefined, main: undefined });
}
