import { describe, it, expect, vi, afterEach } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, statSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createImportAuthCommand } from "./import-auth.ts";

const exp = 1790000000;
const JWT = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.sig_nature-1`;
const dirs: string[] = [];

function setup(envContent?: string): { cap: string; env: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "dg-import-"));
  dirs.push(root);
  const cap = join(root, "Raw_10_10_2026_12_22_34.folder");
  writeFileSync(join(root, "keep"), "");
  mkdirSync(cap);
  writeFileSync(join(cap, "[1] Request - app.clickup.com.txt"), "GET / HTTP/1.1\r\nHost: app.clickup.com\r\nAuthorization: Bearer webapp\r\n\r\n");
  writeFileSync(
    join(cap, "[2] Request - frontdoor-prod-x.txt"),
    `GET /a HTTP/1.1\r\nHost: frontdoor-prod-x.clickup.com\r\nAuthorization: Bearer old\r\n\r\n`,
  );
  writeFileSync(
    join(cap, "[7] Request - frontdoor-prod-x.txt"),
    `GET /b HTTP/1.1\r\nHost: frontdoor-prod-x.clickup.com\r\nAuthorization: Bearer ${JWT}\r\n\r\n`,
  );
  const env = join(root, ".env");
  if (envContent !== undefined) writeFileSync(env, envContent, { mode: 0o600 });
  return { cap, env, root };
}

async function run(env: string, argv: object): Promise<{ out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void err.push(a.join(" ")));
  await (createImportAuthCommand(env).handler as (a: object) => Promise<void>)(argv);
  return { out: out.join("\n"), err: err.join("\n") };
}

describe("frontdoor import-auth", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it("stores the newest Frontdoor Authorization as a single-quoted line and prints only stored + expiry", async () => {
    const { cap, env } = setup("CLICKUP_TEAM_ID=1\n");
    const { out } = await run(env, { capture: cap });
    const file = readFileSync(env, "utf-8");
    expect(file).toBe(`CLICKUP_TEAM_ID=1\nCLICKUP_FRONTDOOR_AUTH='Bearer ${JWT}'\nCLICKUP_FRONTDOOR_REFRESH_COOKIE=''\n`);
    expect(out).toBe(
      "clickup frontdoor import-auth: stored, expires 2026-09-21 21:13 UTC+7 [2026-09-21 14:13 UTC], renewal: no",
    );
    expect(out).not.toContain("eyJ");
    expect(process.exitCode).toBe(0);
  });

  it("replaces an existing line instead of appending a second one", async () => {
    const { cap, env } = setup("A=1\nCLICKUP_FRONTDOOR_AUTH='Bearer stale'\nB=2\n");
    await run(env, { capture: cap });
    const lines = readFileSync(env, "utf-8").split("\n");
    expect(lines.filter((l) => l.startsWith("CLICKUP_FRONTDOOR_AUTH="))).toHaveLength(1);
    expect(lines[0]).toBe("A=1");
    expect(lines[2]).toBe("B=2");
  });

  it("creates the env file when it is missing, mode 600", async () => {
    const { cap, env } = setup();
    await run(env, { capture: cap });
    expect(statSync(env).mode & 0o777).toBe(0o600);
  });

  it("chmods an existing 0644 env file to 600 before writing the value", async () => {
    const { cap, env } = setup("A=1\n");
    chmodSync(env, 0o644);
    await run(env, { capture: cap });
    expect(statSync(env).mode & 0o777).toBe(0o600);
  });

  it("leaves the export untouched: same names, same modes", async () => {
    const { cap, env } = setup("");
    const before = readdirSync(cap).map((f) => [f, statSync(join(cap, f)).mode]);
    const modeBefore = statSync(cap).mode;
    await run(env, { capture: cap });
    expect(readdirSync(cap).map((f) => [f, statSync(join(cap, f)).mode])).toEqual(before);
    expect(statSync(cap).mode).toBe(modeBefore);
  });

  it("fails when the capture has no Frontdoor request with an Authorization header", async () => {
    const { env, root } = setup("");
    const empty = join(root, "Raw_01_01_2026_00_00_00.folder");
    mkdirSync(empty);
    const { err } = await run(env, { capture: empty });
    expect(err).toMatch(/no frontdoor request with an Authorization header/i);
    expect(process.exitCode).toBe(1);
  });

  describe("renewal cookie", () => {
    function withCookies(): { cap: string; env: string } {
      const { cap, env } = setup("CLICKUP_TEAM_ID=1\nB=2\n");
      writeFileSync(
        join(cap, "[8] Request - id.app.clickup.com.txt"),
        "POST /data/v3/workspaces/1/authentication/access_tokens HTTP/1.1\r\nHost: id.app.clickup.com\r\nCookie: _ga=fake-ga; cu_session_meta=fake-meta-old; cu_refresh=fake-refresh-old; cu_jwt=fake-jwt-cookie\r\n\r\n",
      );
      writeFileSync(
        join(cap, "[8] Response - id.app.clickup.com.txt"),
        "HTTP/1.1 200 OK\r\nSet-Cookie: cu_jwt=fake-new-jwt-cookie; Path=/\r\nSet-Cookie: cu_refresh=fake-refresh-new; Path=/; HttpOnly\r\nSet-Cookie: cu_session_meta=; Path=/\r\n\r\n{}",
      );
      return { cap, env };
    }

    it("stores only cu_refresh and cu_session_meta, a Set-Cookie of the capture winning over the request Cookie, and says renewal: yes", async () => {
      const { cap, env } = withCookies();
      const { out, err } = await run(env, { capture: cap });
      const file = readFileSync(env, "utf-8");
      expect(file).toContain("CLICKUP_FRONTDOOR_REFRESH_COOKIE='cu_refresh=fake-refresh-new; cu_session_meta=fake-meta-old'\n");
      expect(file).not.toContain("fake-ga");
      expect(file).not.toContain("fake-jwt-cookie");
      expect(file.startsWith("CLICKUP_TEAM_ID=1\nB=2\n")).toBe(true);
      expect(statSync(env).mode & 0o777).toBe(0o600);
      expect(out).toMatch(/, renewal: yes$/);
      for (const secret of ["fake-refresh", "fake-meta", "eyJ"]) {
        expect(out).not.toContain(secret);
        expect(err).not.toContain(secret);
      }
    });

    it("clears a stale stored cookie when the new capture has none", async () => {
      const { cap, env } = setup("CLICKUP_FRONTDOOR_REFRESH_COOKIE='cu_refresh=fake-stale'\n");
      await run(env, { capture: cap });
      expect(readFileSync(env, "utf-8")).toContain("CLICKUP_FRONTDOOR_REFRESH_COOKIE=''\n");
      expect(readFileSync(env, "utf-8")).not.toContain("fake-stale");
    });

    it("leaves no temp file in the env folder", async () => {
      const { cap, env, root } = setup("A=1\n");
      await run(env, { capture: cap });
      expect(readdirSync(root).filter((f) => f.includes("tmp"))).toEqual([]);
    });
  });
});
