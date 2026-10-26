// scripts/workbox-health/install.test.ts
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

describe("install.sh", () => {
  it("installs a drift-check wrapper that runs the copied .ts", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "dgs498-home-"));
    const ws = path.join(home, "ws"); fs.mkdirSync(ws);
    const inst = spawnSync("bash", [path.join(import.meta.dirname, "install.sh")], { env: { ...process.env, HOME: home }, encoding: "utf8" });
    expect(inst.status).toBe(0);
    const bin = path.join(home, ".digismith-depot/bin");
    expect(fs.existsSync(path.join(bin, "drift-check.ts"))).toBe(true);
    const r = spawnSync(path.join(bin, "drift-check"), ["--root", ws, "--no-log"], { env: { ...process.env, HOME: home }, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    fs.rmSync(home, { recursive: true, force: true });
  });
});
