import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newestCapture, readCalls, maskJwts, jwtExpiry, formatExpiry } from "./captures.ts";

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "dg-captures-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

// header.payload.signature with payload {"exp":1790000000}
const payload = Buffer.from(JSON.stringify({ exp: 1790000000 })).toString("base64url");
const JWT = `eyJhbGciOiJIUzI1NiJ9.${payload}.sig_nature-1`;

describe("newestCapture", () => {
  it("picks the newest Raw_* by its name timestamp, not its mtime", () => {
    const root = tmp();
    for (const n of ["Raw_10_03_2026_13_50_53.folder", "Raw_10_10_2026_12_22_34.folder", "Raw_10_08_2026_23_49_34.folder"]) {
      mkdirSync(join(root, n));
    }
    mkdirSync(join(root, "Other"));
    expect(newestCapture(root)).toBe(join(root, "Raw_10_10_2026_12_22_34.folder"));
  });

  it("throws when there is no Raw_* capture", () => {
    expect(() => newestCapture(tmp())).toThrow(/no Raw_\* capture/);
  });

  it("orders across years and months by the timestamp, not the text", () => {
    const root = tmp();
    mkdirSync(join(root, "Raw_12_31_2026_00_00_00.folder"));
    mkdirSync(join(root, "Raw_01_02_2027_00_00_00.folder"));
    expect(newestCapture(root)).toBe(join(root, "Raw_01_02_2027_00_00_00.folder"));
  });
});

describe("readCalls", () => {
  function capture(): string {
    const d = tmp();
    writeFileSync(
      join(d, "[10] Request - frontdoor-prod-ap-southeast-2-2.cl.txt"),
      `POST /tasks/v1/1/customItem HTTP/1.1\r\nHost: frontdoor-prod-ap-southeast-2-2.clickup.com\r\nAuthorization: Bearer ${JWT}\r\n\r\n{"name":"Epic","t":"${JWT}"}`,
    );
    writeFileSync(
      join(d, "[10] Response - frontdoor-prod-ap-southeast-2-2.c.txt"),
      `HTTP/1.1 200 OK\r\nSet-Cookie: s=1\r\n\r\n{"id":1030}`,
    );
    writeFileSync(
      join(d, "[9] Request - app-cdn.clickup.com_media_pixel-EY.txt"),
      `GET /pixel HTTP/1.1\r\nHost: app-cdn.clickup.com\r\n\r\n`,
    );
    return d;
  }

  it("returns calls sorted by number, with the request line, headers, bodies and the response", () => {
    const calls = readCalls(capture());
    expect(calls.map((c) => c.n)).toEqual([9, 10]);
    const c = calls[1];
    expect(c.requestLine).toBe("POST /tasks/v1/1/customItem");
    expect(c.host).toBe("frontdoor-prod-ap-southeast-2-2.clickup.com");
    expect(c.isFrontdoor).toBe(true);
    expect(calls[0].isFrontdoor).toBe(false);
    expect(c.requestHeaders.authorization).toBe(`Bearer ${JWT}`);
    expect(c.requestBody).toContain('"name":"Epic"');
    expect(c.responseStatus).toBe("HTTP/1.1 200 OK");
    expect(c.responseBody).toBe('{"id":1030}');
  });

  it("works with LF line endings too", () => {
    const d = tmp();
    writeFileSync(join(d, "[1] Request - frontdoor-prod-x.txt"), "GET /a HTTP/1.1\nHost: frontdoor-prod-x\nAuthorization: Bearer t\n\nbody");
    const [c] = readCalls(d);
    expect(c.requestBody).toBe("body");
    expect(c.requestHeaders.authorization).toBe("Bearer t");
  });
});

describe("maskJwts / jwtExpiry / formatExpiry", () => {
  it("masks every JWT-shaped string", () => {
    expect(maskJwts(`a ${JWT} b ${JWT}`)).toBe("a <JWT-REDACTED> b <JWT-REDACTED>");
  });
  it("reads exp from a Bearer value or a bare JWT", () => {
    expect(jwtExpiry(`Bearer ${JWT}`)).toBe(1790000000);
    expect(jwtExpiry(JWT)).toBe(1790000000);
  });
  it("returns undefined for a value that has no JWT", () => {
    expect(jwtExpiry("opaque")).toBeUndefined();
  });
  it("formats UTC+7 first, UTC in brackets", () => {
    expect(formatExpiry(1790000000)).toBe("2026-09-21 21:13 UTC+7 [2026-09-21 14:13 UTC]");
  });
});
