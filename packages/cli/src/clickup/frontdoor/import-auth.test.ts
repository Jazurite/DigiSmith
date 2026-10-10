import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, statSync, readdirSync } from "node:fs";
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
    expect(file).toBe(`CLICKUP_TEAM_ID=1\nCLICKUP_FRONTDOOR_AUTH='Bearer ${JWT}'\n`);
    expect(out).toBe("clickup frontdoor import-auth: stored, expires 2026-09-21 21:13 UTC+7 [2026-09-21 14:13 UTC]");
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
});
