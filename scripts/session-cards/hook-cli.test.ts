import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runPrompt } from "./hook-cli.ts";
import { listCards } from "./cards.ts";

const CLI = path.join(import.meta.dirname, "hook-cli.ts");
let depot: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  depot = fs.mkdtempSync(path.join(os.tmpdir(), "dgs418cli-"));
  env = {
    PATH: process.env.PATH, DIGISMITH_DEPOT_DIR: depot, DIGISMITH_ROLE: "worker", DIGISMITH_ID: "w1",
    DIGISMITH_UNDER: "c1", DIGISMITH_PROJECT: "P", DIGISMITH_MANDATE: "m.md", DIGISMITH_CREATED_BY: "c1",
  };
});
afterEach(() => fs.rmSync(depot, { recursive: true, force: true }));

const run = (cmd: string, input: string) =>
  spawnSync("node", ["--experimental-strip-types", CLI, cmd], { input, env, encoding: "utf8" });

describe("hook-cli", () => {
  it("start, prompt and end over stdin write, refresh and close the card; exit 0 each time", () => {
    const e = JSON.stringify({ session_id: "s9", cwd: depot, reason: "other" });
    expect(run("start", e).status).toBe(0);
    expect(listCards("P", { env, scope: "open" })).toHaveLength(1);
    expect(run("prompt", e).status).toBe(0);
    expect(run("end", e).status).toBe(0);
    expect(listCards("P", { env, scope: "archive" })[0].card.status).toBe("closed");
  });
  it("still works when the script is reached through a symlink", () => {
    const link = path.join(depot, "lnk");
    fs.symlinkSync(path.dirname(CLI), link);
    const e = JSON.stringify({ session_id: "s7", cwd: depot });
    const r = spawnSync("node", ["--experimental-strip-types", path.join(link, "hook-cli.ts"), "start"], { input: e, env, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(listCards("P", { env, scope: "open" })).toHaveLength(1);
  });
  it("exits 0 on garbage input and an unknown command", () => {
    expect(run("start", "not json").status).toBe(0);
    expect(run("bogus", "{}").status).toBe(0);
  });
  it("exits 0 and writes nothing without a role", () => {
    delete env.DIGISMITH_ROLE;
    expect(run("start", JSON.stringify({ session_id: "s1", cwd: depot })).status).toBe(0);
    expect(listCards("P", { env })).toEqual([]);
  });
});

describe("runPrompt", () => {
  it("runs the pre-prompt handlers in order BEFORE the heartbeat, and prints their output", () => {
    const order: string[] = [];
    const out = runPrompt(
      { session_id: "s1", cwd: depot }, { ...env },
      { now: new Date(), touch: () => { order.push("touch"); } },
      [() => { order.push("a"); return "ctx-a"; }, () => { order.push("b"); }, () => "ctx-c"],
    );
    expect(order).toEqual(["a", "b", "touch"]);
    expect(out).toBe("ctx-a\nctx-c");
  });
  it("a throwing handler does not stop the next handler or the heartbeat", () => {
    const order: string[] = [];
    runPrompt({ session_id: "s", cwd: depot }, env, { touch: () => { order.push("touch"); } }, [
      () => { throw new Error("boom"); }, () => { order.push("next"); },
    ]);
    expect(order).toEqual(["next", "touch"]);
  });
});
