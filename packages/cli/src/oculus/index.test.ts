import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeDepot, type Depot } from "./fixture.test-util.ts";
import { runOculus } from "./index.ts";

const exec = promisify(execFile);
const NOW = new Date("2026-10-22T03:00:00.000Z");
let d: Depot;
beforeEach(() => { d = makeDepot(); });
afterEach(() => d.cleanup());

describe("runOculus", () => {
  it("prints one JSON document for each view and exits 0", () => {
    for (const name of ["overview", "attention", "runs"]) {
      const r = runOculus(["view", name], d.env, NOW);
      expect(r.code).toBe(0);
      expect(r.err).toBe("");
      expect(() => JSON.parse(r.out)).not.toThrow();
      expect(r.out.trim().split("\n")).toHaveLength(1);
    }
    expect(runOculus(["view", "plan", "--ticket", "DGS-590"], d.env, NOW).code).toBe(0);
  });
  it("exits 1 for an unknown view, an unsafe id, a missing run, a missing ticket flag", () => {
    expect(runOculus(["view", "nope"], d.env, NOW)).toMatchObject({ code: 1, out: "" });
    expect(runOculus(["view", "run", "--run", "../x"], d.env, NOW)).toMatchObject({ code: 1, out: "" });
    expect(runOculus(["view", "run", "--run", "nope-1"], d.env, NOW)).toMatchObject({ code: 1, err: "not found\n" });
    expect(runOculus(["view", "events", "--run", "nope-1"], d.env, NOW).code).toBe(1);
    expect(runOculus(["view", "plan"], d.env, NOW).code).toBe(1);
  });
  it("passes the filters through", () => {
    d.writeRun({ ticket: "DGS-590", run: "builder-1", role: "builder", created_at: "2026-10-22T02:20:00.000Z", order: "/x/order-nw.md" });
    d.writeEvents("DGS-590", "builder-1", [{ type: "started", ts: "2026-10-22T02:20:00.000Z" }]);
    expect(JSON.parse(runOculus(["view", "runs", "--role", "reviewer"], d.env, NOW).out).total).toBe(0);
    expect(JSON.parse(runOculus(["view", "runs", "--role", "builder"], d.env, NOW).out).total).toBe(1);
  });
  it("refuses an unknown flag or a flag without a value, and accepts --key=value", () => {
    const typo = runOculus(["view", "runs", "--rol", "builder"], d.env, NOW);
    expect(typo).toMatchObject({ code: 1, out: "" });
    expect(typo.err).not.toContain("builder");
    expect(runOculus(["view", "runs", "--role"], d.env, NOW)).toMatchObject({ code: 1, out: "" });
    expect(runOculus(["view", "runs", "--json"], d.env, NOW).code).toBe(0);
    d.writeRun({ ticket: "DGS-590", run: "builder-1", role: "builder", created_at: "2026-10-22T02:20:00.000Z", order: "/x/order-nw.md" });
    expect(JSON.parse(runOculus(["view", "runs", "--role=reviewer"], d.env, NOW).out).total).toBe(0);
    expect(JSON.parse(runOculus(["view", "runs", "--role=builder"], d.env, NOW).out).total).toBe(1);
    expect(runOculus(["view", "runs", "--limit=x"], d.env, NOW).code).toBe(1);
    expect(runOculus(["view", "runs", "--project", "DigiSmith"], d.env, NOW).code).toBe(0);
    expect(runOculus(["view", "runs", "--project", "my.repo"], d.env, NOW).code).toBe(0);
    expect(runOculus(["view", "runs", "--project", "../x"], d.env, NOW)).toMatchObject({ code: 1, err: expect.stringContaining("bad id") });
  });
  it("creates nothing in an empty depot", () => {
    runOculus(["view", "overview"], d.env, NOW);
    expect(readdirSync(d.dir).sort()).toEqual(["autonomous"]);
  });
});

// index.e2e.test.ts rebuilds packages/clickup-client/dist while the files run in parallel,
// so a spawn of the source entry can hit the missing dist for a moment. Retry on that only.
async function execEntry(args: string[]) {
  for (let i = 0; ; i++) {
    try {
      return await exec(process.execPath, args, { env: { ...process.env, ...d.env } });
    } catch (e) {
      if (i >= 20 || !String((e as { stderr?: string }).stderr).includes("ERR_MODULE_NOT_FOUND")) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

describe("the real entry", () => {
  it("runs under --experimental-strip-types", async () => {
    const entry = new URL("../index.ts", import.meta.url).pathname;
    const { stdout } = await execEntry(["--experimental-strip-types", entry, "oculus", "view", "overview"]);
    expect(JSON.parse(stdout).tickets.windowDays).toBe(7);
  }, 30_000);
  it("passes flags through yargs", async () => {
    const entry = new URL("../index.ts", import.meta.url).pathname;
    d.writeRun({ ticket: "DGS-590", run: "builder-1", role: "builder", created_at: "2026-10-22T02:20:00.000Z", order: "/x/order-nw.md" });
    const { stdout } = await execEntry(["--experimental-strip-types", entry, "oculus", "view", "runs", "--role", "builder", "--limit", "2"]);
    expect(JSON.parse(stdout).total).toBe(1);
    await expect(exec(process.execPath, ["--experimental-strip-types", entry, "oculus", "view", "runs", "--rol", "builder"], { env: { ...process.env, ...d.env } })).rejects.toMatchObject({ code: 1 });
  }, 30_000);
});
