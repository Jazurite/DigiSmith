import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runWatch, type WatchDeps } from "./watch.ts";

let tmp: string;
let dir: string;
let cwd: string;
let env: NodeJS.ProcessEnv;
const NOW = Date.parse("2026-11-03T03:00:00Z");

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "nw-watch-wake-"));
  dir = join(tmp, "autonomous");
  cwd = join(tmp, "repo");
  mkdirSync(cwd, { recursive: true });
  env = { DIGISMITH_DEPOT_DIR: join(tmp, "depot"), AUTONOMOUS_DIR: dir };
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const deps = (over: Partial<WatchDeps> = {}): WatchDeps => ({
  env, dir, cwd, now: () => NOW, panes: async () => new Map(), runDg: async () => ({ ok: true }), dryRun: false, ...over,
});

describe("runWatch wake", () => {
  it("the wake runs once per pass and its failure changes nothing", async () => {
    let n = 0;
    const base = await runWatch(deps());
    const withWake = await runWatch(deps({ wake: async () => { n++; } }));
    expect(n).toBe(1);
    expect(withWake).toEqual(base);
    const failing = await runWatch(deps({ wake: async () => { n++; throw new Error("herdr down"); } }));
    expect(n).toBe(2);
    expect(failing).toEqual(base);
  });
  it("a dry run never wakes", async () => {
    let n = 0;
    await runWatch(deps({ dryRun: true, wake: async () => { n++; } }));
    expect(n).toBe(0);
  });
  it("without a wake dep the pass is as before", async () => {
    expect((await runWatch(deps())).lines.at(-1)).toContain("watch:");
  });
});
