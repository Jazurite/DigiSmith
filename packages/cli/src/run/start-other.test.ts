import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import yargs from "yargs";
import runCommand from "./index.ts";
import { findRunDir } from "./paths.ts";

// The researcher card starts a researcher with `dg run start --role other` (DGS-609 adds the role researcher).
let tmp: string;
let savedDepot: string | undefined;
let savedRunId: string | undefined;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-other-"));
  savedDepot = process.env.DIGISMITH_DEPOT_DIR;
  savedRunId = process.env.DIGISMITH_RUN_ID;
  process.env.DIGISMITH_DEPOT_DIR = tmp;
  delete process.env.DIGISMITH_RUN_ID;
  process.exitCode = undefined;
});
afterEach(() => {
  vi.restoreAllMocks();
  if (savedDepot === undefined) delete process.env.DIGISMITH_DEPOT_DIR; else process.env.DIGISMITH_DEPOT_DIR = savedDepot;
  if (savedRunId === undefined) delete process.env.DIGISMITH_RUN_ID; else process.env.DIGISMITH_RUN_ID = savedRunId;
  process.exitCode = undefined;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("dg run start --role other", () => {
  it("exits 0, prints a run id and writes a run record with role other", async () => {
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { out.push(a.join(" ")); });
    const args = ["run", "start", "--ticket", "DGS-606", "--role", "other", "--order", "/o.md"];
    await yargs(args).scriptName("dg").command(runCommand).demandCommand(1, "").strict().exitProcess(false).parseAsync(args);
    expect(Number(process.exitCode ?? 0)).toBe(0);
    const id = out.join("\n").trim();
    expect(id).toMatch(/^other-\d{8}T\d{6}-[0-9a-f]{6}$/);
    const rec = JSON.parse(fs.readFileSync(path.join(findRunDir(id)!, "run.json"), "utf8"));
    expect(rec).toMatchObject({ ticket: "DGS-606", role: "other", order: "/o.md" });
  });
});
