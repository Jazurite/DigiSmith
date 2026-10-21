import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const ENTRY = path.join(import.meta.dirname, "..", "index.ts");
let tmp: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-dg-"));
  env = { ...process.env, DIGISMITH_DEPOT_DIR: tmp };
  delete env.DIGISMITH_RUN_ID;
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const dg = (...args: string[]) => spawnSync(process.execPath, ["--experimental-strip-types", ENTRY, "run", ...args], { env, encoding: "utf8" });

describe("dg run", () => {
  it("start prints the run id alone; event, list, show and tail read it back", () => {
    const s = dg("start", "--ticket", "DGS-581", "--role", "builder", "--order", "/o.md", "--seat", "dev0");
    expect(s.status).toBe(0);
    const id = s.stdout.trim();
    expect(id).toMatch(/^builder-\d{8}T\d{6}-[0-9a-f]{6}$/);

    expect(dg("event", id, "review_ready", "--data", '{"pack":"p1"}').status).toBe(0);
    expect(dg("event", id, "merged").status).toBe(0);

    const list = JSON.parse(dg("list", "--json").stdout);
    expect(list).toHaveLength(1);
    expect(list[0].record.run).toBe(id);
    expect(list[0].summary.events).toBe(2);
    expect(dg("list", "--ticket", "DGS-9", "--json").stdout.trim()).toBe("[]");
    expect(dg("list").stdout).toContain(id);

    const show = JSON.parse(dg("show", id, "--json").stdout);
    expect(show.record.seat).toBe("dev0");
    expect(show.summary.last_type).toBe("merged");
    expect(dg("show", id).stdout).toContain("DGS-581");

    const all = dg("tail", id).stdout.trim().split("\n").map((l) => JSON.parse(l));
    expect(all.map((e) => [e.seq, e.type])).toEqual([[1, "review_ready"], [2, "merged"]]);
    expect(all[0].data).toEqual({ pack: "p1" });
    expect(dg("tail", id, "--since", "1").stdout.trim().split("\n").map((l) => JSON.parse(l).seq)).toEqual([2]);
  }, 60000);
  it("exits 1 with a message for an unknown run, an unknown type, a bad --data and a bad role", () => {
    const id = dg("start", "--ticket", "DGS-581", "--role", "scout").stdout.trim();
    expect(dg("event", "builder-x-000000", "merged").status).toBe(1);
    expect(dg("event", id, "started").status).toBe(1); // a hook type, not a conductor type
    expect(dg("event", id, "merged", "--data", "[1]").status).toBe(1);
    expect(dg("show", "builder-x-000000").status).toBe(1);
    expect(dg("tail", "builder-x-000000").status).toBe(1);
    const bad = dg("start", "--ticket", "DGS-581", "--role", "boss");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/role/);
  }, 60000);
});
