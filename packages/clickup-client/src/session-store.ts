import { closeSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { defaultEnvPath, parseEnvFile } from "./credentials.ts";
import type { FrontdoorSession, SessionStore } from "./frontdoor-session.ts";

const AUTH_KEY = "CLICKUP_FRONTDOOR_AUTH";
const COOKIE_KEY = "CLICKUP_FRONTDOOR_REFRESH_COOKIE";

/**
 * Sets KEY='value' lines in an env file. Every other line stays byte for byte. Single quotes: shells source the file.
 * Atomic: a temp file (mode 600) in the same folder, then a rename, so a reader never sees half a file.
 */
export function writeEnvValues(envPath: string, values: Record<string, string>): void {
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const lines = existing === "" ? [] : existing.replace(/\n$/, "").split("\n");
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}='${value.replace(/'/g, "'\\''")}'`;
    const at = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (at === -1) lines.push(line);
    else lines[at] = line;
  }
  const tmp = join(dirname(envPath), `.${basename(envPath)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  writeFileSync(tmp, lines.join("\n") + "\n", { mode: 0o600, flag: "wx" });
  try {
    chmodSync(tmp, 0o600);
    renameSync(tmp, envPath);
  } catch (err) {
    try {
      unlinkSync(tmp); // never leave a secret behind in a temp file
    } catch {
      // nothing to remove
    }
    throw err;
  }
}

export interface FileSessionStoreOptions {
  /** A lock older than this is taken over. Default 60 s. */
  staleMs?: number;
  /** How long to wait for a lock held by someone else. Default 15 s. */
  waitMs?: number;
  pollMs?: number;
}

/** The Frontdoor session in ~/.digismith-depot/.env, with a create-exclusive lock file next to it. */
export class FileSessionStore implements SessionStore {
  private readonly lockPath: string;
  private readonly staleMs: number;
  private readonly waitMs: number;
  private readonly pollMs: number;

  constructor(
    private readonly envPath: string = defaultEnvPath(),
    opts: FileSessionStoreOptions = {},
  ) {
    this.lockPath = `${envPath}.lock`;
    this.staleMs = opts.staleMs ?? 60_000;
    this.waitMs = opts.waitMs ?? 15_000;
    this.pollMs = opts.pollMs ?? 100;
  }

  read(): FrontdoorSession | undefined {
    let vars: Record<string, string>;
    try {
      vars = parseEnvFile(this.envPath);
    } catch {
      return undefined;
    }
    if (!vars[AUTH_KEY]) return undefined;
    return { auth: vars[AUTH_KEY], refreshCookie: vars[COOKIE_KEY] || undefined };
  }

  write(session: FrontdoorSession): void {
    writeEnvValues(this.envPath, {
      [AUTH_KEY]: session.auth,
      ...(session.refreshCookie !== undefined ? { [COOKIE_KEY]: session.refreshCookie } : {}),
    });
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const owner = await this.acquire();
    try {
      return await fn();
    } finally {
      try {
        // Only our own lock: after a run longer than staleMs another process may hold a new one.
        if (readFileSync(this.lockPath, "utf-8") === owner) unlinkSync(this.lockPath);
      } catch {
        // already gone
      }
    }
  }

  private async acquire(): Promise<string> {
    const deadline = Date.now() + this.waitMs;
    for (;;) {
      try {
        const owner = `${process.pid}-${randomBytes(6).toString("hex")}`;
        const fd = openSync(this.lockPath, "wx", 0o600);
        try {
          writeFileSync(fd, owner);
        } finally {
          closeSync(fd);
        }
        return owner;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      }
      try {
        if (Date.now() - statSync(this.lockPath).mtimeMs > this.staleMs) {
          unlinkSync(this.lockPath);
          continue;
        }
      } catch {
        continue; // released between the open and the stat
      }
      if (Date.now() >= deadline) throw new Error(`another dg process holds the renewal lock (${this.lockPath}); try again in a minute`);
      await new Promise((r) => setTimeout(r, this.pollMs));
    }
  }
}
