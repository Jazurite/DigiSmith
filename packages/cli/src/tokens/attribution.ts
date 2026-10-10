import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function claudeProjectsDir(): string {
  return process.env.DIGISMITH_CLAUDE_PROJECTS_DIR ?? join(homedir(), ".claude", "projects");
}

function projectDirs(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((n) => join(root, n))
    .filter((p) => statSync(p).isDirectory());
}

export function findTranscript(sessionId: string, root: string = claudeProjectsDir()): string | null {
  for (const dir of projectDirs(root)) {
    const file = join(dir, `${sessionId}.jsonl`);
    if (existsSync(file)) return file;
  }
  return null;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// In a title: the key as a whole token, any case.
function titleRegex(ticket: string): RegExp {
  return new RegExp(`(^|[^A-Za-z0-9])${escapeRegex(ticket)}(?![A-Za-z0-9])`, "i");
}

// In a branch name or a path segment: the key at the start, then "__", "-" or the end.
function nameRegex(ticket: string): RegExp {
  return new RegExp(`^${escapeRegex(ticket)}(__|-|$)`, "i");
}

const CHUNK_SIZE = 64 * 1024;
const MAX_LINE_BYTES = 1024 * 1024;
const HEAD_LINES = 200;

export interface InferOptions {
  chunkSize?: number;
}

// Calls onLine for each line, reading the file in chunks. A line over MAX_LINE_BYTES is dropped
// without being held. onLine returns true to stop. Lines are decoded one at a time, so a multi-byte
// character that spans two chunks stays intact.
function scanLines(file: string, chunkSize: number, onLine: (line: string, index: number) => boolean | void): void {
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(chunkSize);
    let parts: Buffer[] = [];
    let held = 0;
    let skipping = false;
    let index = 0;
    const emit = (extra: Buffer): boolean => {
      let line: string | null = null;
      if (!skipping && held + extra.length <= MAX_LINE_BYTES) line = Buffer.concat([...parts, extra]).toString("utf-8");
      parts = [];
      held = 0;
      skipping = false;
      if (line === null) {
        index++;
        return false;
      }
      return onLine(line, index++) === true;
    };
    for (;;) {
      const n = readSync(fd, buf, 0, chunkSize, null);
      if (n === 0) break;
      let start = 0;
      for (;;) {
        const nl = buf.indexOf(10, start);
        if (nl === -1 || nl >= n) break;
        if (emit(Buffer.from(buf.subarray(start, nl)))) return;
        start = nl + 1;
      }
      if (start < n) {
        const rest = n - start;
        if (!skipping && held + rest > MAX_LINE_BYTES) {
          skipping = true;
          parts = [];
          held = 0;
        } else if (!skipping) {
          parts.push(Buffer.from(buf.subarray(start, n)));
          held += rest;
        }
      }
    }
    if (held > 0 || skipping) emit(Buffer.alloc(0));
  } finally {
    closeSync(fd);
  }
}

type Line = { type?: string; customTitle?: string; agentName?: string; gitBranch?: string; cwd?: string };

function fileHasTicket(file: string, titleRe: RegExp, nameRe: RegExp, chunkSize: number): boolean {
  let hit = false;
  scanLines(file, chunkSize, (raw, i) => {
    if (!raw) return;
    const isMeta = raw.includes('"custom-title"') || raw.includes('"agent-name"');
    // gitBranch and cwd count only in the head; titles and agent names count anywhere.
    if (i >= HEAD_LINES && !isMeta) return;
    try {
      const o = JSON.parse(raw) as Line;
      if (o.type === "custom-title" && typeof o.customTitle === "string" && titleRe.test(o.customTitle)) hit = true;
      if (o.type === "agent-name" && typeof o.agentName === "string" && nameRe.test(o.agentName)) hit = true;
      if (i < HEAD_LINES) {
        if (typeof o.gitBranch === "string" && nameRe.test(o.gitBranch)) hit = true;
        if (typeof o.cwd === "string" && o.cwd.split("/").some((seg) => nameRe.test(seg))) hit = true;
      }
    } catch {
      return;
    }
    return hit;
  });
  return hit;
}

export function inferSessionsForTicket(ticket: string, root: string = claudeProjectsDir(), opts: InferOptions = {}): string[] {
  const titleRe = titleRegex(ticket);
  const nameRe = nameRegex(ticket);
  const chunkSize = opts.chunkSize ?? CHUNK_SIZE;
  const found: string[] = [];
  for (const dir of projectDirs(root)) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".jsonl")) continue;
      const sid = name.slice(0, -".jsonl".length);
      // A session starts on main in the repo root and moves into the worktree later; a title can change.
      if (fileHasTicket(join(dir, name), titleRe, nameRe, chunkSize)) found.push(sid);
    }
  }
  return found;
}
