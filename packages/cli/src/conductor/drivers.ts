import * as fs from "node:fs";
import * as path from "node:path";
import { registryPath } from "../conductor-registry/registry.ts";

// Driver records: one file per ticket, <depot>/drivers/<KEY>.json. The file names the one conductor that drives the ticket.

export interface Driver { ticket: string; driver: string; since: string; mode: "attended" | "factory" }

const TICKET = /^[A-Z]+-\d+$/;

export class DriverTaken extends Error {
  ticket: string; // no parameter properties: node --experimental-strip-types cannot run them
  driver: string;
  constructor(ticket: string, driver: string) {
    super(`${ticket} already has a driver: ${driver}`);
    this.name = "DriverTaken";
    this.ticket = ticket;
    this.driver = driver;
  }
}

export function driversDir(env?: NodeJS.ProcessEnv): string {
  return path.join(path.dirname(registryPath(env)), "drivers");
}

function fileFor(ticket: string, env?: NodeJS.ProcessEnv): string {
  if (!TICKET.test(ticket)) throw new Error(`ticket "${ticket}" must match ${TICKET.source}`);
  return path.join(driversDir(env), `${ticket}.json`);
}

function nowPlus7(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().replace(/\.\d{3}Z$/, "+07:00");
}

function parse(p: string, text: string): Driver {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (err) {
    throw new Error(`driver file ${p} is not valid JSON: ${(err as Error).message}`);
  }
  const r = v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const ok = typeof r.ticket === "string" && typeof r.driver === "string" && r.driver !== "" && typeof r.since === "string" && (r.mode === "attended" || r.mode === "factory");
  if (!ok) throw new Error(`driver file ${p} is unreadable: needs ticket, driver, since and mode attended|factory`);
  return r as unknown as Driver;
}

export function readDriver(ticket: string, env?: NodeJS.ProcessEnv): Driver | null {
  const p = fileFor(ticket, env);
  let text: string;
  try {
    text = fs.readFileSync(p, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  return parse(p, text);
}

export function claimDriver(d: Omit<Driver, "since"> & { since?: string }, env?: NodeJS.ProcessEnv): Driver {
  const p = fileFor(d.ticket, env);
  const rec: Driver = { ticket: d.ticket, driver: d.driver, since: d.since ?? nowPlus7(), mode: d.mode };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  try {
    fs.writeFileSync(p, JSON.stringify(rec, null, 2) + "\n", { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      let name = "unreadable driver file";
      try {
        name = readDriver(d.ticket, env)?.driver ?? "unknown";
      } catch {
        // a bad file still means the ticket is taken
      }
      throw new DriverTaken(d.ticket, name);
    }
    throw err;
  }
  return rec;
}

export function handoverDriver(ticket: string, from: string, to: string, env?: NodeJS.ProcessEnv): Driver {
  const p = fileFor(ticket, env);
  const cur = readDriver(ticket, env);
  if (cur === null) throw new Error(`${ticket} has no driver, nothing to hand over`);
  if (cur.driver !== from) throw new Error(`${ticket}: driver is ${cur.driver}, not ${from}`);
  const next: Driver = { ...cur, driver: to, since: nowPlus7() };
  const tmp = `${p}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n");
    fs.renameSync(tmp, p);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  return next;
}

export function releaseDriver(ticket: string, driver: string, env?: NodeJS.ProcessEnv): boolean {
  const cur = readDriver(ticket, env);
  if (cur === null || cur.driver !== driver) return false;
  fs.rmSync(fileFor(ticket, env), { force: true });
  return true;
}
