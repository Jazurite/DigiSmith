import { describe, expect, it } from "vitest";
import { notSalvagedMessage, secretFiles, secretHits } from "./secrets.ts";

const f = (path: string, size = 10) => ({ path, size });
describe("secretFiles", () => {
  it.each([".env", ".env.local", "a/b/.env.production", "x.pem", "k/id.key", "my-Secret-notes.txt", "a/api_token.json", "TOKEN"])
    ("flags %s", (p) => expect(secretFiles([f(p)])).toEqual([p]));
  it("flags a file over 5 MB", () => expect(secretFiles([f("big.bin", 5 * 1024 * 1024 + 1)])).toEqual(["big.bin"]));
  it("passes 5 MB exactly and ordinary names", () => {
    expect(secretFiles([f("a.ts"), f("env.md"), f("exact.bin", 5 * 1024 * 1024)])).toEqual([]);
  });
});

describe("secretHits and the message", () => {
  it("names the matching pattern", () => {
    const hits = secretHits([f("tokens.test.ts"), f(".env"), f("big.bin", 5 * 1024 * 1024 + 1), f("ok.ts")]);
    expect(hits).toEqual([
      { path: "tokens.test.ts", pattern: "*token*" },
      { path: ".env", pattern: ".env*" },
      { path: "big.bin", pattern: "over 5 MB" },
    ]);
    expect(notSalvagedMessage(hits.slice(0, 2))).toBe("not salvaged: tokens.test.ts (matches *token*), .env (matches .env*); Jack decides");
  });
});
