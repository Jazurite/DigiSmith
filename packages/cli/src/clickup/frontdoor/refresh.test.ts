import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RenewResponse } from "@digismith/clickup-client";
import { createRefreshCommand } from "./refresh.ts";

const dirs: string[] = [];
const jwt = (exp: number, tag: string): string =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp, tag })).toString("base64url")}.fake-signature`;
const OLD = jwt(1790000000, "old");
const NEW = jwt(1792322135, "new");
const COOKIE = "cu_refresh=fake-refresh-cookie; cu_session_meta=fake-meta-cookie";
const SECRETS = ["fake-refresh-cookie", "fake-meta-cookie", "eyJ", "fake-signature", "fake-rotated", "fake-api-token"];

function setup(extra = `CLICKUP_FRONTDOOR_REFRESH_COOKIE='${COOKIE}'\n`): string {
  const dir = mkdtempSync(join(tmpdir(), "dg-refresh-"));
  dirs.push(dir);
  const env = join(dir, ".env");
  writeFileSync(env, `CLICKUP_API_TOKEN=fake-api-token\nCLICKUP_TEAM_ID=5738747\nCLICKUP_FRONTDOOR_AUTH='Bearer ${OLD}'\n${extra}`, { mode: 0o600 });
  return env;
}

async function run(env: string, transport: (r: { url: string; headers: Record<string, string> }) => Promise<RenewResponse>) {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void err.push(a.join(" ")));
  await (createRefreshCommand(env, transport).handler as (a: object) => Promise<void>)({});
  return { out: out.join("\n"), err: err.join("\n") };
}

afterEach(() => {
  process.exitCode = 0;
  vi.restoreAllMocks();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("frontdoor refresh", () => {
  it("stores the new token, prints only the old and new expiry, and keeps the other lines and mode 600", async () => {
    const env = setup();
    const transport = vi.fn().mockResolvedValue({ status: 200, body: { token: NEW }, setCookies: ["cu_refresh=fake-rotated; Path=/"] });
    const { out, err } = await run(env, transport);
    expect(transport.mock.calls[0][0].url).toBe("https://id.app.clickup.com/data/v3/workspaces/5738747/authentication/access_tokens");
    expect(out).toBe(
      "clickup frontdoor refresh: renewed, expiry 2026-09-21 21:13 UTC+7 [2026-09-21 14:13 UTC] -> 2026-10-18 18:15 UTC+7 [2026-10-18 11:15 UTC]",
    );
    const file = readFileSync(env, "utf-8");
    expect(file).toContain(`CLICKUP_FRONTDOOR_AUTH='Bearer ${NEW}'`);
    expect(file).toContain("CLICKUP_FRONTDOOR_REFRESH_COOKIE='cu_refresh=fake-rotated; cu_session_meta=fake-meta-cookie'");
    expect(file.startsWith("CLICKUP_API_TOKEN=fake-api-token\nCLICKUP_TEAM_ID=5738747\n")).toBe(true);
    expect(statSync(env).mode & 0o777).toBe(0o600);
    expect(process.exitCode).toBe(0);
    for (const s of SECRETS) {
      expect(out).not.toContain(s);
      expect(err).not.toContain(s);
    }
  });

  it("on a failed renewal prints the plain message with the HTTP code, leaves .env alone, exits 1", async () => {
    const env = setup();
    const before = readFileSync(env, "utf-8");
    const { out, err } = await run(env, async () => ({ status: 401, body: { error: "fake-refresh-cookie" }, setCookies: ["cu_refresh=fake-rotated"] }));
    expect(err).toBe(
      "clickup frontdoor refresh: renewal failed (HTTP 401): capture a new session with Proxyman, then dg clickup frontdoor import-auth",
    );
    expect(readFileSync(env, "utf-8")).toBe(before);
    expect(process.exitCode).toBe(1);
    for (const s of SECRETS) {
      expect(out).not.toContain(s);
      expect(err).not.toContain(s);
    }
  });

  it("without a stored refresh cookie says so and makes no call", async () => {
    const env = setup("");
    const transport = vi.fn();
    const { err } = await run(env, transport);
    expect(err).toMatch(/no refresh cookie stored/);
    expect(transport).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("a thrown transport error never reaches the output", async () => {
    const env = setup();
    const { out, err } = await run(env, async () => {
      throw new Error("socket hang up Cookie: fake-refresh-cookie");
    });
    expect(err).toContain("renewal failed (no answer)");
    for (const s of SECRETS) {
      expect(out).not.toContain(s);
      expect(err).not.toContain(s);
    }
  });
});
