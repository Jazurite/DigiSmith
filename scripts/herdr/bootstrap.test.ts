import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveConductor, scopeFor } from "../conductor/registry.ts";

const dir = __dirname;
const SCRIPT = path.join(dir, "herdr-bootstrap.sh");
const FAKE = path.join(dir, "fake-herdr.sh");

let tmp: string, home: string, depot: string, fake: string;
const REG = {
  "DigiSmith/digismith-conductor": { session: "Castle", kind: ["project"], floor: "w2" },
  "Factory/factory-conductor": { session: "Castle", kind: "factory", floor: "w2" },
  "DigiSmith/tc-dgs-9": { session: "Castle", kind: "ticket", ticket: "DGS-9", status: "open", floor: "w2" },
  "Emma/emma-conductor": { workspace: "w3" },
};
const env = (over: Record<string, string> = {}) => ({
  PATH: process.env.PATH ?? "", HOME: home, HERDR_BIN: FAKE, FAKE_DIR: fake, DIGISMITH_DEPOT_DIR: depot, PGREP: "true",
  DG_DIR: tmp, EMMA_DIR: tmp, EMMA_MAESTRO_DIR: tmp, SOV_DIR: tmp, ...over,
});
const run = (over: Record<string, string> = {}) => spawnSync("bash", [SCRIPT], { env: env(over), encoding: "utf8" });
const read = (f: string) => (fs.existsSync(path.join(fake, f)) ? fs.readFileSync(path.join(fake, f), "utf8") : "");
const labels = (f: string) => read(f).split("\n").filter(Boolean).map((l) => l.split(" ")[1]);
const regFile = () => path.join(depot, "conductors.json");

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-"));
  home = path.join(tmp, "home"); depot = path.join(tmp, "depot"); fake = path.join(tmp, "fake");
  fs.mkdirSync(home); fs.mkdirSync(depot);
  fs.writeFileSync(regFile(), JSON.stringify(REG));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("herdr-bootstrap.sh", () => {
  it("is valid bash", () => expect(spawnSync("bash", ["-n", SCRIPT]).status).toBe(0));

  it("sets up both sessions and starts the Castle conductors with the flags", () => {
    const r = run();
    expect(r.status).toBe(0);
    expect(labels("Castle.ws")).toEqual(["Factory", "DigiSmith", "Emma", "Soveron"]);
    expect(labels("default.ws")).toEqual(["DigiSmith", "Emma", "Soveron"]);
    const calls = read("calls.log");
    for (const name of ["digismith-conductor", "factory-conductor"]) {
      expect(calls).toMatch(new RegExp(`--session Castle agent start ${name} --kind claude --pane \\S+ --timeout 90000 -- --name ${name} --disallowedTools Bash\\(herdr \\*\\) --allowedTools Bash\\(herdr-ws \\*\\)`));
    }
    expect(read("Castle.agents")).toContain("digismith-conductor");
    expect(read("Castle.agents")).toContain("factory-conductor");
    // every conductor sits in its own tab, labelled with its name
    expect(read("Castle.tabs")).toMatch(/digismith-conductor/);
    expect(read("Castle.tabs")).toMatch(/factory-conductor/);
  });

  it("writes the Castle workspace ids back, and HERDR_SCOPE equals scopeFor of the registry", () => {
    expect(run().status).toBe(0);
    const env_ = { DIGISMITH_DEPOT_DIR: depot };
    const reg = JSON.parse(fs.readFileSync(regFile(), "utf8"));
    expect(reg["DigiSmith/digismith-conductor"].workspace).toBe("w3");
    expect(reg["Factory/factory-conductor"].workspace).toBe("w2");
    expect(reg["Emma/emma-conductor"]).toEqual({ workspace: "w3" });   // the old entry is untouched
    const scopeOf = (name: string) => new RegExp(`pane run \\S+ cd .* && export HERDR_SCOPE=(\\S+) DIGISMITH_NAME=${name}`).exec(read("calls.log"))?.[1];
    for (const key of ["DigiSmith/digismith-conductor", "Factory/factory-conductor"]) {
      expect(scopeOf(key.split("/")[1])).toBe(scopeFor(resolveConductor(key, env_)!, env_));
    }
    expect(scopeOf("digismith-conductor")).toBe("Castle:w3,default:w2,default:w3");
  });

  it("sets HERDR_WS to the Floor workspace, but not for the factory", () => {
    run();
    const calls = read("calls.log");
    expect(calls).toMatch(/export HERDR_SCOPE=\S+ DIGISMITH_NAME=digismith-conductor HERDR_WS=w2/);
    expect(calls).not.toMatch(/DIGISMITH_NAME=factory-conductor HERDR_WS/);
  });

  it("is idempotent: a second run adds no workspace, no tab and no agent", () => {
    run();
    const before = ["Castle.ws", "default.ws", "Castle.tabs", "default.tabs", "Castle.agents", "default.agents"].map(read);
    const second = run();
    expect(second.status).toBe(0);
    expect(["Castle.ws", "default.ws", "Castle.tabs", "default.tabs", "Castle.agents", "default.agents"].map(read)).toEqual(before);
  });

  it("DRY_RUN=1 changes nothing and logs dry-run lines", () => {
    const regBefore = fs.readFileSync(regFile(), "utf8");
    const r = run({ DRY_RUN: "1" });
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/dry-run: --session Castle workspace create/);
    expect(r.stderr).toMatch(/dry-run: --session Castle agent start/);
    for (const f of ["Castle.ws", "default.ws", "Castle.agents", "default.agents"]) expect(read(f).trim()).toBe("");
    expect(fs.readFileSync(regFile(), "utf8")).toBe(regBefore);
  });

  it("an old entry with no session still goes through the old Floor path", () => {
    run();
    expect(read("default.agents")).toContain("emma-conductor");
    expect(read("calls.log")).toMatch(/--session default tab rename w3:t1 conductor/);
    expect(read("calls.log")).toMatch(/--session default pane run w3:p1 cd .* && export HERDR_WS=w3/);
    expect(run({ FLOOR_CONDUCTORS: "0" }).status).toBe(0);
  });

  it("FLOOR_CONDUCTORS=0 leaves the old entries alone", () => {
    run({ FLOOR_CONDUCTORS: "0" });
    expect(read("default.agents").trim()).toBe("");
  });

  it("an open ticket conductor with no live agent is not created", () => {
    const r = run();
    expect(r.stderr).toMatch(/ticket conductor tc-dgs-9 not running, start it with dg conductor start-ticket/);
    expect(read("Castle.agents")).not.toContain("tc-dgs-9");
    expect(labels("Castle.tabs")).not.toContain("tc-dgs-9");   // neither its tab nor its agent
  });

  it("an open ticket conductor that is running is relaunched with its flags, never briefed again", () => {
    run();
    fs.appendFileSync(path.join(fake, "Castle.tabs"), "w3:t90 tc-dgs-9\n");
    fs.appendFileSync(path.join(fake, "Castle.panes"), "w3:p90 w3:t90\n");
    fs.appendFileSync(path.join(fake, "Castle.agents"), "tc-dgs-9 w3:p90 idle\n");
    const r = run({ PGREP: "false" });   // pgrep finds no claude with the flags: herdr restored it as a plain resume
    expect(r.stderr).toMatch(/tc-dgs-9 restored as resume sid-tc-dgs-9: relaunching with flags/);
    expect(read("calls.log")).toMatch(/agent start tc-dgs-9 --kind claude --pane w3:p90 --timeout 90000 -- --resume sid-tc-dgs-9 --name tc-dgs-9/);
  });
  it("a closed entry is skipped", () => {
    fs.writeFileSync(regFile(), JSON.stringify({ ...REG, "Emma/old": { session: "Castle", kind: "project", status: "closed", floor: "w3" } }));
    run();
    expect(read("Castle.agents")).not.toContain("old ");
  });

  it("does nothing for conductors when there is no registry", () => {
    fs.rmSync(regFile());
    const r = run();
    expect(r.status).toBe(0);
    expect(read("Castle.agents").trim()).toBe("");
  });
});
