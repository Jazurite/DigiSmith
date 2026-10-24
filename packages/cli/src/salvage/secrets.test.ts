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
    const hits = secretHits([f("api-token.txt"), f(".env"), f("big.bin", 5 * 1024 * 1024 + 1), f("ok.ts")]);
    expect(hits).toEqual([
      { path: "api-token.txt", pattern: "*token*" },
      { path: ".env", pattern: ".env*" },
      { path: "big.bin", pattern: "over 5 MB" },
    ]);
    expect(notSalvagedMessage(hits.slice(0, 2))).toBe("not salvaged: api-token.txt (matches *token*), .env (matches .env*); Jack decides");
  });
});

describe("harmless source files with secret or token in the name", () => {
  it.each([
    "scripts/nexus-web/app/assets/nightwatch-tokens.scss", "tokens.test.ts", "a/token.tsx", "a/token.js", "a/token.mjs",
    "a/token.vue", "a/token.css", "secret-notes.md", "token.html", "token.yml", "tokens.yml", "token-config.yaml", "a/Token.TS",
    ".digismith/board/DGS-1\u2014x/tokens.json",
  ])("passes %s", (p) => expect(secretFiles([f(p)])).toEqual([]));
  it.each(["src/tokens.json", ".digismith/board/a/b/tokens.json", ".digismith/board/tokens.json", ".digismith/board/a/tokens.json.bak"])
    ("still flags %s", (p) => expect(secretFiles([f(p)])).toEqual([p]));
  it.each([
    ["secrets.yaml", "*secret*"], ["secrets.yml", "*secret*"], ["db-secret.yaml", "*secret*"],
    ["k8s/db-secret.yaml", "*secret*"], ["secret-token.yaml", "*secret*"],
  ])("a secret name stays strict on yaml: %s", (p, pattern) => expect(secretHits([f(p)])).toEqual([{ path: p, pattern }]));
  it.each(["api-token.txt", "secrets.json", "TOKEN", "token", "a/secret.sh", "token.txt.ts.bak"])
    ("still flags %s", (p) => expect(secretFiles([f(p)])).toEqual([p]));
});

describe("the strict list on any extension", () => {
  it.each([
    ["x.p12", "*.p12"], ["x.pfx", "*.pfx"], ["id_rsa", "id_rsa*"], ["id_rsa.pub", "id_rsa*"], ["id_ed25519", "id_ed25519*"],
    ["a/id_ed25519.pub", "id_ed25519*"], [".env.local", ".env*"], ["cert.pem", "*.pem"], ["id.key", "*.key"],
  ])("flags %s as %s", (p, pattern) => expect(secretHits([f(p)])).toEqual([{ path: p, pattern }]));
  it.each([
    [".env.ts", ".env*"], ["id_rsa.md", "id_rsa*"], ["server.key.ts", "*.key"], ["a/cert.pem.md", "*.pem"], ["x.p12.ts", "*.p12"],
  ])("strict beats the extension skip: %s", (p, pattern) => expect(secretHits([f(p)])).toEqual([{ path: p, pattern }]));
  it("flags a big source file", () => expect(secretFiles([f("big.ts", 5 * 1024 * 1024 + 1)])).toEqual(["big.ts"]));
});
