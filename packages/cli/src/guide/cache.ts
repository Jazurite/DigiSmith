// Depot cache for the guide index and pages. See DGS-785 spec D3. Writes are temp file + rename.
import * as fs from "node:fs";
import * as path from "node:path";
import { depotDir } from "../run/paths.ts";

export interface GuideIndexEntry {
  slug: string;
  key: string;
  id: string;
  kind: "guide" | "manual";
  name: string;
  when: string;
  updated: string;
}

export interface GuideIndex {
  version: 1;
  fetched_at: string;
  list_id: string;
  guides: GuideIndexEntry[];
}

const SLUG_RE = /^[a-z0-9-]+$/;
const LOCK_STALE_MS = 2 * 60 * 1000;

export function guidesDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(depotDir(env), "guides");
}

function writeAtomic(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

export function writeIndexAtomic(index: GuideIndex, env: NodeJS.ProcessEnv = process.env): void {
  writeAtomic(path.join(guidesDir(env), "index.json"), JSON.stringify(index, null, 2) + "\n");
}

/** Undefined for a missing file, bad JSON, a wrong version or non-array guides. Never throws. */
export function readIndex(env: NodeJS.ProcessEnv = process.env): GuideIndex | undefined {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(path.join(guidesDir(env), "index.json"), "utf8"));
    if (typeof data !== "object" || data === null) return undefined;
    const o = data as Record<string, unknown>;
    if (o.version !== 1 || !Array.isArray(o.guides)) return undefined;
    return data as GuideIndex;
  } catch {
    return undefined;
  }
}

function pagePath(slug: string, env: NodeJS.ProcessEnv): string | undefined {
  return SLUG_RE.test(slug) ? path.join(guidesDir(env), "pages", `${slug}.md`) : undefined;
}

export function writePageAtomic(slug: string, markdown: string, env: NodeJS.ProcessEnv = process.env): void {
  const file = pagePath(slug, env);
  if (file === undefined) throw new Error(`unsafe guide slug: ${JSON.stringify(slug)}`);
  writeAtomic(file, markdown);
}

export function readPage(slug: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const file = pagePath(slug, env);
  if (file === undefined) return undefined;
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

function lockPath(env: NodeJS.ProcessEnv): string {
  return path.join(guidesDir(env), "refresh.lock");
}

/** True when the lock was taken (absent, unreadable or older than 2 minutes); false when a fresh lock exists. */
export function takeLock(now: number = Date.now(), env: NodeJS.ProcessEnv = process.env): boolean {
  const file = lockPath(env);
  try {
    const started = Number(fs.readFileSync(file, "utf8").trim());
    if (Number.isFinite(started) && now - started < LOCK_STALE_MS) return false;
  } catch {
    // absent or unreadable: take it
  }
  writeAtomic(file, String(now));
  return true;
}

export function releaseLock(env: NodeJS.ProcessEnv = process.env): void {
  fs.rmSync(lockPath(env), { force: true });
}
