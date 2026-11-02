import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const dir = __dirname;
const WATCH = path.join(dir, "conductor-watch");
let tmp: string, bin: string, fake: string, home: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cwatch-"));
  bin = path.join(tmp, "bin"); fake = path.join(tmp, "fake"); home = path.join(tmp, "home");
  fs.mkdirSync(bin); fs.mkdirSync(fake); fs.mkdirSync(home);
  fs.symlinkSync(path.join(dir, "fake-herdr.sh"), path.join(bin, "herdr"));   // the watcher finds herdr on PATH
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const watch = (...targets: string[]) =>
  spawnSync("python3", [WATCH, "--once", ...targets], { encoding: "utf8", env: { PATH: `${bin}:${process.env.PATH}`, HOME: home, FAKE_DIR: fake } });

describe("conductor-watch session targets", () => {
  it("Castle/<name> reads the Castle session, a plain target reads the default one", () => {
    fs.writeFileSync(path.join(fake, "Castle.agents"), "emma-conductor w7:p1 working\n");
    fs.writeFileSync(path.join(fake, "default.agents"), "emma-conductor w3:p1 idle\n");
    const r = watch("Castle/emma-conductor", "emma-conductor");
    expect(r.status).toBe(0);
    const calls = fs.readFileSync(path.join(fake, "calls.log"), "utf8").split("\n").filter(Boolean);
    expect(calls).toContain("--session Castle agent get emma-conductor");
    expect(calls).toContain("agent get emma-conductor");           // no --session: exactly as before
    expect(r.stdout).toContain("Castle/emma-conductor working");
    expect(r.stdout).toContain("emma-conductor idle");
  });
  it("a pane id after the session prefix is passed on whole", () => {
    watch("Castle/w7:p1");
    expect(fs.readFileSync(path.join(fake, "calls.log"), "utf8")).toContain("--session Castle agent get w7:p1");
  });
  it("an unreadable target reports gone", () => {
    const r = watch("Castle/nobody", "nobody");
    expect(r.stdout).toContain("Castle/nobody gone");
    expect(r.stdout).toContain("nobody gone");
  });
});
