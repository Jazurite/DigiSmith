// The capped guide index block for the session-start hook (DGS-785 spec D3-D5).
// It holds one line per guide, never a page body, and stays under CAP bytes.
// It parses no Markdown: it reads <depot>/guides/index.json only.
// Runs under `node --experimental-strip-types`, so it imports only node: modules and ../depot-dir.ts.
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn as nodeSpawn } from "node:child_process";
import { depotDir } from "../depot-dir.ts";

const CAP = 3000;
const HEADER = "User manual (DigiSmith): before acting on a request that matches a line, read the page with dg guide <slug>.";
const NOT_CACHED = "Guide index: not cached yet. Run dg guide list.";
const MIN_LINE = 40;
const MAX_LINE = 200;
const OLD_DAYS = 7;
const REFRESH_AFTER_MS = 15 * 60 * 1000;
// Duplicated from packages/cli/src/guide/cache.ts (the plugin cannot import workspace code):
// index at <depot>/guides/index.json, lock at <depot>/guides/refresh.lock holding a start time in ms,
// and a lock is live while it is younger than 2 minutes.
const LOCK_STALE_MS = 2 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Entry {
  slug: string;
  kind: string;
  when: string;
}

export interface SpawnedChild {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  unref(): void;
}
export type SpawnFn = (command: string, args: string[], options: { detached: boolean; stdio: "ignore" }) => SpawnedChild;
export interface RefreshDeps {
  now: number;
  env: NodeJS.ProcessEnv;
  spawn: SpawnFn;
}

const bytes = (s: string): number => Buffer.byteLength(s);

/** Longest prefix of s that fits in max bytes, cut on a character boundary. */
function cutBytes(s: string, max: number): string {
  let out = "";
  let used = 0;
  for (const ch of s) {
    const n = bytes(ch);
    if (used + n > max) break;
    out += ch;
    used += n;
  }
  return out;
}

/** The line, or undefined when even the whole slug does not fit (a slug is never cut). */
function line(e: Entry, budget: number): string | undefined {
  const max = budget - 1; // the newline
  const when = e.when.replace(/\s+/g, " ").trim();
  const slugOnly = bytes(e.slug) <= max ? e.slug : undefined;
  if (when === "") return slugOnly;
  const prefix = `${e.slug} — `;
  const room = max - bytes(prefix);
  if (room < 4) return slugOnly;
  if (bytes(when) <= room) return prefix + when;
  let cut = cutBytes(when, room - bytes("…"));
  const rest = when.slice(cut.length);
  if (rest !== "" && !/^\s/.test(rest)) {
    const sp = cut.lastIndexOf(" ");
    if (sp > 0) cut = cut.slice(0, sp);
  }
  cut = cut.replace(/[\s,;:.\-—]+$/, "");
  return cut === "" ? slugOnly : `${prefix}${cut}…`;
}

function parse(cacheJson: string | undefined): { fetchedAt: number; entries: Entry[] } | undefined {
  if (cacheJson === undefined) return undefined;
  try {
    const data: unknown = JSON.parse(cacheJson);
    if (typeof data !== "object" || data === null) return undefined;
    const o = data as Record<string, unknown>;
    if (o.version !== 1 || !Array.isArray(o.guides)) return undefined;
    const entries: Entry[] = [];
    for (const g of o.guides) {
      if (typeof g !== "object" || g === null) continue;
      const r = g as Record<string, unknown>;
      if (typeof r.slug !== "string" || r.slug === "") continue;
      entries.push({
        slug: r.slug,
        kind: r.kind === "manual" ? "manual" : "guide",
        when: typeof r.when === "string" ? r.when : "",
      });
    }
    const fetchedAt = typeof o.fetched_at === "string" ? Date.parse(o.fetched_at) : NaN;
    return { fetchedAt, entries };
  } catch {
    return undefined;
  }
}

/** Pure. Guides first, then manuals; lines are dropped from the end and the trailer counts them. */
export function buildGuideIndex(cacheJson: string | undefined, now: number): string {
  const parsed = parse(cacheJson);
  if (parsed === undefined) return NOT_CACHED;
  let header = HEADER;
  if (Number.isFinite(parsed.fetchedAt)) {
    const days = Math.floor((now - parsed.fetchedAt) / DAY_MS);
    if (days > OLD_DAYS) header += ` (cache is ${days} days old)`;
  }
  const ordered = [...parsed.entries.filter((e) => e.kind === "guide"), ...parsed.entries.filter((e) => e.kind === "manual")];
  if (ordered.length === 0) return header;
  for (let keep = ordered.length; keep >= 0; keep--) {
    const dropped = ordered.length - keep;
    const trailer = dropped > 0 ? `(${dropped} more: dg guide list)` : undefined;
    const fixed = bytes(header) + (trailer === undefined ? 0 : bytes(trailer) + 1);
    const budget = keep === 0 ? MIN_LINE : Math.min(MAX_LINE, Math.max(MIN_LINE, Math.floor((CAP - fixed) / keep)));
    const lines = ordered.slice(0, keep).map((e) => line(e, budget));
    if (lines.some((l) => l === undefined)) continue;
    const out = [header, ...(lines as string[]), ...(trailer === undefined ? [] : [trailer])].join("\n");
    if (bytes(out) <= CAP) return out;
  }
  return header;
}

function lockIsLive(file: string, now: number): boolean {
  try {
    const started = Number(fs.readFileSync(file, "utf8").trim());
    return Number.isFinite(started) && started <= now && now - started < LOCK_STALE_MS;
  } catch {
    return false;
  }
}

/** Starts a detached `dg guide refresh --quiet` when the cache is missing or 15+ minutes old. Never awaits, never throws. */
export function maybeRefresh({ now, env, spawn }: RefreshDeps): void {
  try {
    const dir = path.join(depotDir(env), "guides");
    const parsed = parse(readIfExists(path.join(dir, "index.json")));
    const fresh = parsed !== undefined && Number.isFinite(parsed.fetchedAt) && now - parsed.fetchedAt < REFRESH_AFTER_MS;
    if (fresh) return;
    if (lockIsLive(path.join(dir, "refresh.lock"), now)) return;
    const child = spawn("dg", ["guide", "refresh", "--quiet"], { detached: true, stdio: "ignore" });
    // A missing dg binary emits 'error'; with no listener that would crash the hook.
    child.on("error", () => {});
    child.unref();
  } catch {
    // a missing dg binary or an unreadable folder must never break the session start
  }
}

function readIfExists(file: string): string | undefined {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

/** The block for the session-start hook, or undefined when something unexpected fails. */
export function readGuideIndexBlock(
  env: NodeJS.ProcessEnv = process.env,
  now: number = Date.now(),
  deps: { spawn: SpawnFn } = { spawn: nodeSpawn as unknown as SpawnFn },
): string | undefined {
  try {
    const cacheJson = readIfExists(path.join(depotDir(env), "guides", "index.json"));
    try {
      maybeRefresh({ now, env, spawn: deps.spawn });
    } catch {
      // never let the refresh path reach the hook
    }
    return buildGuideIndex(cacheJson, now);
  } catch {
    return undefined;
  }
}
