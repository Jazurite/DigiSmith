import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDumpCommand } from "./dump.ts";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3OTAwMDAwMDB9.sig_nature-1";
const dirs: string[] = [];

function capture(): string {
  const d = mkdtempSync(join(tmpdir(), "dg-dump-"));
  dirs.push(d);
  writeFileSync(
    join(d, "[3] Request - frontdoor-prod-x.txt"),
    `POST /tasks/v1/1/customItem HTTP/1.1\r\nHost: frontdoor-prod-x.clickup.com\r\nAuthorization: Bearer ${JWT}\r\nCookie: secretcookie=1\r\n\r\n{"name":"Epic","note":"${JWT}"}`,
  );
  writeFileSync(
    join(d, "[3] Response - frontdoor-prod-x.txt"),
    `HTTP/1.1 200 OK\r\nSet-Cookie: other=2\r\n\r\n{"id":1030}`,
  );
  writeFileSync(join(d, "[4] Request - app.clickup.com.txt"), `GET /x HTTP/1.1\r\nHost: app.clickup.com\r\n\r\nnot-frontdoor`);
  writeFileSync(
    join(d, "[5] Request - frontdoor-prod-x.txt"),
    `GET /other/thing HTTP/1.1\r\nHost: frontdoor-prod-x.clickup.com\r\n\r\n`,
  );
  return d;
}

async function run(argv: object): Promise<string> {
  const out: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
  await (createDumpCommand().handler as (a: object) => Promise<void>)(argv);
  return out.join("\n");
}

describe("frontdoor dump", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it("prints Frontdoor request and response bodies, never a header, JWT masked", async () => {
    const text = await run({ capture: capture() });
    expect(text).toContain("===== [3] POST /tasks/v1/1/customItem");
    expect(text).toContain('"name": "Epic"');
    expect(text).toContain("<JWT-REDACTED>");
    expect(text).toContain("----- [3] HTTP/1.1 200 OK");
    expect(text).toContain('"id": 1030');
    for (const secret of ["Authorization", "secretcookie", "Set-Cookie", "other=2", JWT, "not-frontdoor"]) {
      expect(text).not.toContain(secret);
    }
    expect(process.exitCode).toBe(0);
  });

  it("--match keeps only calls whose request line matches", async () => {
    const text = await run({ capture: capture(), match: "other/thing" });
    expect(text).toContain("[5] GET /other/thing");
    expect(text).not.toContain("[3]");
  });

  it("exits 1 with a message when the capture folder is missing", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await (createDumpCommand().handler as (a: object) => Promise<void>)({ capture: "/nonexistent/Raw_x" });
    expect(err).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("masks credential query parameters and credential-named body fields that are not JWTs", async () => {
    const d = mkdtempSync(join(tmpdir(), "dg-dump-"));
    dirs.push(d);
    writeFileSync(
      join(d, "[1] Request - frontdoor-prod-x.txt"),
      'POST /p?token=opaqueq&x=1&session_id=opaqueq2 HTTP/1.1\r\nHost: frontdoor-prod-x.clickup.com\r\n\r\n' +
        '{"cookie":"opaquec","nested":{"Authorization":"opaquea","password":"opaquep","keep":"visible"},' +
        '"list":[{"api_secret":"opaques"}],"blob":"' + "A1b2".repeat(15) + '"}',
    );
    writeFileSync(
      join(d, "[1] Response - frontdoor-prod-x.txt"),
      'HTTP/1.1 200 OK\r\n\r\n{"sessionToken":"opaquer","ok":true}',
    );
    const text = await run({ capture: d });
    for (const secret of ["opaqueq", "opaquec", "opaquea", "opaquep", "opaques", "opaquer", "A1b2A1b2"]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain("x=1");
    expect(text).toContain('"keep": "visible"');
    expect(text).toContain('"ok": true');
  });
});
