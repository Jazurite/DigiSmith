import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSessionStore, writeEnvValues } from "./session-store.ts";

const dirs: string[] = [];
function tmp(content?: string): { dir: string; env: string } {
  const dir = mkdtempSync(join(tmpdir(), "dg-session-"));
  dirs.push(dir);
  const env = join(dir, ".env");
  if (content !== undefined) writeFileSync(env, content, { mode: 0o644 });
  return { dir, env };
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("writeEnvValues", () => {
  it("keeps every other line byte for byte, replaces its own lines, and sets mode 600", () => {
    const original = "# comment\nCLICKUP_TEAM_ID=1\r\nCLICKUP_FRONTDOOR_AUTH='Bearer old'\n\nB=  spaced  =x\n";
    const { env } = tmp(original);
    writeEnvValues(env, { CLICKUP_FRONTDOOR_AUTH: "Bearer fake-new", CLICKUP_FRONTDOOR_REFRESH_COOKIE: "cu_refresh=fake-refresh-cookie" });
    expect(readFileSync(env, "utf-8")).toBe(
      "# comment\nCLICKUP_TEAM_ID=1\r\nCLICKUP_FRONTDOOR_AUTH='Bearer fake-new'\n\nB=  spaced  =x\nCLICKUP_FRONTDOOR_REFRESH_COOKIE='cu_refresh=fake-refresh-cookie'\n",
    );
    expect(statSync(env).mode & 0o777).toBe(0o600);
  });

  it("creates a missing file with mode 600 and leaves no temp file behind", () => {
    const { dir, env } = tmp();
    writeEnvValues(env, { A: "1" });
    expect(readFileSync(env, "utf-8")).toBe("A='1'\n");
    expect(statSync(env).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir)).toEqual([".env"]);
  });

  it("escapes single quotes so the shell can source the file", () => {
    const { env } = tmp("");
    writeEnvValues(env, { A: "it's" });
    expect(readFileSync(env, "utf-8")).toBe("A='it'\\''s'\n");
  });
});

describe("FileSessionStore", () => {
  const fast = { pollMs: 5, waitMs: 200, staleMs: 60_000 };

  it("reads auth and refresh cookie; undefined without auth", () => {
    const { env } = tmp("CLICKUP_FRONTDOOR_AUTH='Bearer a'\nCLICKUP_FRONTDOOR_REFRESH_COOKIE='cu_refresh=r; cu_session_meta=m'\n");
    expect(new FileSessionStore(env, fast).read()).toEqual({ auth: "Bearer a", refreshCookie: "cu_refresh=r; cu_session_meta=m" });
    const none = tmp("X=1\n");
    expect(new FileSessionStore(none.env, fast).read()).toBeUndefined();
    expect(new FileSessionStore(join(none.dir, "missing"), fast).read()).toBeUndefined();
  });

  it("treats an empty cookie value as no cookie", () => {
    const { env } = tmp("CLICKUP_FRONTDOOR_AUTH='Bearer a'\nCLICKUP_FRONTDOOR_REFRESH_COOKIE=''\n");
    expect(new FileSessionStore(env, fast).read()).toEqual({ auth: "Bearer a", refreshCookie: undefined });
  });

  it("write stores both values and keeps other lines", () => {
    const { env } = tmp("CLICKUP_TEAM_ID=1\n");
    new FileSessionStore(env, fast).write({ auth: "Bearer n", refreshCookie: "cu_refresh=r" });
    expect(readFileSync(env, "utf-8")).toBe(
      "CLICKUP_TEAM_ID=1\nCLICKUP_FRONTDOOR_AUTH='Bearer n'\nCLICKUP_FRONTDOOR_REFRESH_COOKIE='cu_refresh=r'\n",
    );
  });

  it("the lock file exists inside withLock, is removed after, and is removed after a throw", async () => {
    const { env } = tmp("");
    const store = new FileSessionStore(env, fast);
    await store.withLock(async () => {
      expect(existsSync(`${env}.lock`)).toBe(true);
    });
    expect(existsSync(`${env}.lock`)).toBe(false);
    await expect(store.withLock(async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    expect(existsSync(`${env}.lock`)).toBe(false);
  });

  it("a second holder waits until the first lets go", async () => {
    const { env } = tmp("");
    const a = new FileSessionStore(env, { ...fast, waitMs: 2000 });
    const b = new FileSessionStore(env, { ...fast, waitMs: 2000 });
    const order: string[] = [];
    const first = a.withLock(async () => {
      order.push("a-in");
      await new Promise((r) => setTimeout(r, 60));
      order.push("a-out");
    });
    await new Promise((r) => setTimeout(r, 10));
    const second = b.withLock(async () => void order.push("b-in"));
    await Promise.all([first, second]);
    expect(order).toEqual(["a-in", "a-out", "b-in"]);
  });

  it("gives up with a plain message when the lock is held and fresh", async () => {
    const { env } = tmp("");
    writeFileSync(`${env}.lock`, "1");
    await expect(new FileSessionStore(env, fast).withLock(async () => 1)).rejects.toThrow(/lock/);
    expect(existsSync(`${env}.lock`)).toBe(true);
  });

  it("takes over a lock older than 60 s", async () => {
    const { env } = tmp("");
    writeFileSync(`${env}.lock`, "1");
    const old = new Date(Date.now() - 61_000);
    utimesSync(`${env}.lock`, old, old);
    await expect(new FileSessionStore(env, fast).withLock(async () => "ok")).resolves.toBe("ok");
    expect(existsSync(`${env}.lock`)).toBe(false);
  });
});
