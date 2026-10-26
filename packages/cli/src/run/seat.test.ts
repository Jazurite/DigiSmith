import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { seatOf } from "./seat.ts";

let home: string;
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), "nw-seat-")); });
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

const login = (dir: string, email: string): void => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude.json"), JSON.stringify({ oauthAccount: { emailAddress: email } }));
};

describe("seatOf", () => {
  it("DIGISMITH_SEAT wins", () => {
    login(home, "other@x.com");
    expect(seatOf({ HOME: home, DIGISMITH_SEAT: "dev0" })).toBe("dev0");
  });
  it("an unsafe DIGISMITH_SEAT is dropped", () => {
    login(home, "jack@x.com");
    expect(seatOf({ HOME: home, DIGISMITH_SEAT: "a b" })).toBe("jack");
  });
  it("reads the local part of the login email when no token variable is set", () => {
    login(home, "Jack@jazurite.com");
    expect(seatOf({ HOME: home })).toBe("jack");
  });
  it("reads $CLAUDE_CONFIG_DIR/.claude.json when CLAUDE_CONFIG_DIR is set", () => {
    login(home, "wrong@x.com");
    const cfg = path.join(home, "cfg");
    login(cfg, "dev0@x.com");
    expect(seatOf({ HOME: home, CLAUDE_CONFIG_DIR: cfg })).toBe("dev0");
  });
  it.each(["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"])("skips the file when %s is present", (name) => {
    login(home, "wrong@x.com");
    expect(seatOf({ HOME: home, [name]: "x" })).toBeNull();
  });
  it("a missing, empty or bad file gives null", () => {
    expect(seatOf({ HOME: home })).toBeNull();
    fs.writeFileSync(path.join(home, ".claude.json"), "");
    expect(seatOf({ HOME: home })).toBeNull();
    fs.writeFileSync(path.join(home, ".claude.json"), "{not json");
    expect(seatOf({ HOME: home })).toBeNull();
    login(home, "not an email");
    expect(seatOf({ HOME: home })).toBeNull();
  });
  it("the token value is never read", () => {
    login(home, "jack@x.com");
    const reads: string[] = [];
    const env = new Proxy({ HOME: home, CLAUDE_CODE_OAUTH_TOKEN: "x" } as Record<string, string>, {
      get(t, k) { reads.push(String(k)); return t[k as string]; },
    });
    seatOf(env);
    expect(reads.filter((k) => ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"].includes(k))).toEqual([]);
  });
});
