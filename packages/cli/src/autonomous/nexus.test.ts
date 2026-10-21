import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultNexus, runNow } from "./nexus.ts";

const TOKEN = "s3cret-token-value";
let dir: string;
let tokenFile: string;
let server: Server;
let status = 202;
let seen: { method?: string; url?: string; headers: Record<string, unknown>; body: string } | null = null;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "auto-nexus-"));
  tokenFile = join(dir, "token");
  writeFileSync(tokenFile, `${TOKEN}\n`);
  status = 202;
  seen = null;
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      seen = { method: req.method, url: req.url, headers: req.headers, body };
      res.statusCode = status;
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
});
afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(dir, { recursive: true, force: true });
});
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

describe("runNow", () => {
  it("posts the confirm body with the token header and returns ok on 202", async () => {
    const r = await runNow({ baseUrl: base(), tokenFile, fetch }, "autonomous-scan");
    expect(r).toEqual({ ok: true });
    expect(seen?.method).toBe("POST");
    expect(seen?.url).toBe("/api/v1/jobs/autonomous-scan/run");
    expect(seen?.headers["content-type"]).toBe("application/json");
    expect(seen?.headers["x-nexus-token"]).toBe(TOKEN);
    expect(JSON.parse(seen?.body ?? "")).toEqual({ confirm: "autonomous-scan" });
  });
  it("returns the status on 409 and 403", async () => {
    status = 409;
    const a = await runNow({ baseUrl: base(), tokenFile, fetch }, "autonomous-scan");
    expect(a).toMatchObject({ ok: false, status: 409 });
    status = 403;
    const b = await runNow({ baseUrl: base(), tokenFile, fetch }, "autonomous-scan");
    expect(b).toMatchObject({ ok: false, status: 403 });
    expect(JSON.stringify([a, b])).not.toContain(TOKEN);
  });
  it("fails without the token in the text when the token file is missing", async () => {
    const r = await runNow({ baseUrl: base(), tokenFile: join(dir, "nope"), fetch }, "autonomous-scan");
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(TOKEN);
    expect(seen).toBeNull();
  });
  it("fails on a closed port", async () => {
    const url = base();
    await new Promise<void>((r) => server.close(() => r()));
    const r = await runNow({ baseUrl: url, tokenFile, fetch }, "autonomous-scan");
    expect(r).toMatchObject({ ok: false, status: null });
    expect(JSON.stringify(r)).not.toContain(TOKEN);
    server = createServer();
    await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
  });
});

describe("runNow hardening", () => {
  it("times out on a hung server", async () => {
    await new Promise<void>((r) => server.close(() => r()));
    server = createServer(() => { /* never answers */ });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const r = await runNow({ baseUrl: base(), tokenFile, fetch, timeoutMs: 200 }, "autonomous-scan");
    expect(r).toMatchObject({ ok: false, status: null });
    server.closeAllConnections();
  });
  it("fails on an empty token file without a request", async () => {
    writeFileSync(tokenFile, "  \n");
    const r = await runNow({ baseUrl: base(), tokenFile, fetch }, "autonomous-scan");
    expect(r.ok).toBe(false);
    expect(seen).toBeNull();
  });
});

describe("defaultNexus", () => {
  it("uses the defaults and the env overrides", () => {
    const d = defaultNexus({});
    expect(d.baseUrl).toBe("http://127.0.0.1:4300");
    expect(d.tokenFile.endsWith(join(".digismith-depot", "nexus", "scheduler", "token"))).toBe(true);
    expect(defaultNexus({ NEXUS_URL: "http://x:1", NEXUS_STATE_DIR: "/s" })).toEqual({ baseUrl: "http://x:1", tokenFile: join("/s", "token") });
  });
});
