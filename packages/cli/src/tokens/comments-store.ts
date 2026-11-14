import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TICKET_PATTERN, depotRegistryDir } from "./registry.ts";

export interface PostedComment { head: string; id: string; posted_at: string }

function fileFor(ticket: string): string {
  if (!TICKET_PATTERN.test(ticket)) throw new Error(`invalid ticket key: ${ticket}`);
  return join(depotRegistryDir(), `${ticket}.comments.json`);
}

function isPosted(r: unknown): r is PostedComment {
  if (typeof r !== "object" || r === null) return false;
  const o = r as Record<string, unknown>;
  return ["head", "id", "posted_at"].every((k) => typeof o[k] === "string");
}

export function readPosted(ticket: string): PostedComment[] {
  const file = fileFor(ticket);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw e;
  }
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(isPosted) : [];
  } catch (e) {
    if (e instanceof SyntaxError) return [];
    throw e;
  }
}

export function recordPosted(ticket: string, rec: PostedComment): void {
  const file = fileFor(ticket);
  const next = [...readPosted(ticket).filter((r) => r.head !== rec.head), rec];
  mkdirSync(depotRegistryDir(), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(next, null, 2));
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}
