import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readOpen } from "../attention.ts";
import type { Exec } from "../conductor.ts";
import { PromptError } from "../act.ts";
import { directorTarget, projectConductorName, promptDirector, promptDriver, writeDriverIfAbsent } from "./target.ts";

const HERDR = join(homedir(), ".digismith-depot", "bin", "herdr-ws");
let root: string;
let dir: string;
let conductorsJson: string;
let calls: { file: string; args: string[]; env?: Record<string, string> }[];
let code: number;
const exec: Exec = async (file, args, env) => { calls.push({ file, args, env }); return { code, stderr: code === 0 ? "" : "boom" }; };
const writeReg = (extra: Record<string, unknown> = {}, base: Record<string, unknown> | null = null): void => {
  writeFileSync(conductorsJson, JSON.stringify({
    "DigiSmith/digismith-conductor": { workspace: "w2", ...(base ?? {}) },
    "DigiSmith/director": { session: "Castle", workspace: "w1", kind: "factory" },
    ...extra,
  }));
};
const driverFile = (k: string): string => join(root, "drivers", `${k}.json`);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "director-target-"));
  dir = join(root, "autonomous");
  conductorsJson = join(root, "conductors.json");
  calls = []; code = 0;
  writeReg();
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("directorTarget", () => {
  it("finds the registry entry named director with kind factory and returns its session and workspace", () => {
    expect(directorTarget(conductorsJson)).toMatchObject({ key: "DigiSmith/director", name: "director", session: "Castle", workspace: "w1" });
    expect(directorTarget(conductorsJson)?.scope).toContain("Castle:w1");
  });
  it("returns null when no such entry (lane and wake stay off)", () => {
    writeFileSync(conductorsJson, JSON.stringify({ "DigiSmith/digismith-conductor": { workspace: "w2", kind: "factory" } }));
    expect(directorTarget(conductorsJson)).toBeNull();
    writeFileSync(conductorsJson, JSON.stringify({ "DigiSmith/director": { session: "Castle", workspace: "w1", kind: "project" } }));
    expect(directorTarget(conductorsJson)).toBeNull();
    writeFileSync(conductorsJson, JSON.stringify({ "DigiSmith/director": { session: "Castle", workspace: "w1", kind: "factory", status: "closed" } }));
    expect(directorTarget(conductorsJson)).toBeNull();
  });
  it("returns null for a missing, unreadable or workspace-less file and never throws", () => {
    rmSync(conductorsJson);
    expect(directorTarget(conductorsJson)).toBeNull();
    writeFileSync(conductorsJson, "{nope");
    expect(directorTarget(conductorsJson)).toBeNull();
    writeFileSync(conductorsJson, JSON.stringify({ "DigiSmith/director": { session: "Castle", kind: "factory" } }));
    expect(directorTarget(conductorsJson)).toBeNull();
  });
});

describe("promptDirector", () => {
  it("builds: herdr-ws --session Castle agent prompt director <msg> with HERDR_WS and HERDR_SCOPE", async () => {
    await promptDirector(exec, conductorsJson, "Director: refine DGS-1, read /o.md");
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe(HERDR);
    expect(calls[0].args).toEqual(["--session", "Castle", "agent", "prompt", "director", "Director: refine DGS-1, read /o.md"]);
    expect(calls[0].env).toMatchObject({ HERDR_WS: "w1" });
    expect(calls[0].env?.HERDR_SCOPE).toContain("Castle:w1");
  });
  it("throws with the exit code when herdr fails, and when there is no Director", async () => {
    code = 1;
    await expect(promptDirector(exec, conductorsJson, "x")).rejects.toThrow(/exit 1/);
    writeFileSync(conductorsJson, JSON.stringify({ "DigiSmith/digismith-conductor": { workspace: "w2" } }));
    await expect(promptDirector(exec, conductorsJson, "x")).rejects.toThrow(/no Director/);
  });
});

describe("promptDriver", () => {
  const send = (ticket = "DGS-1") => promptDriver(exec, conductorsJson, dir, ticket, `${ticket}: do it`);
  it("reads drivers/<KEY>.json and prompts that conductor", async () => {
    writeReg({ "Emma/emma-conductor": { workspace: "w3" } });
    mkdirSync(join(root, "drivers"));
    writeFileSync(driverFile("EMKT-5"), JSON.stringify({ ticket: "EMKT-5", driver: "emma-conductor", since: "2026-11-03T10:00:00+07:00", mode: "factory" }));
    await send("EMKT-5");
    expect(calls[0].args).toEqual(["agent", "prompt", "emma-conductor", "EMKT-5: do it"]);
    expect(calls[0].env).toMatchObject({ HERDR_WS: "w3" });
  });
  it("no driver file: falls back to DigiSmith/digismith-conductor", async () => {
    await send();
    expect(calls[0].args).toEqual(["agent", "prompt", "digismith-conductor", "DGS-1: do it"]);
    expect(calls[0].env).toMatchObject({ HERDR_WS: "w2" });
    expect(readOpen(dir)).toEqual([]);
  });
  it("a malformed driver file: falls back and appends an attention item", async () => {
    mkdirSync(join(root, "drivers"));
    writeFileSync(driverFile("DGS-1"), "{nope");
    await send();
    expect(calls[0].args).toContain("digismith-conductor");
    expect(readOpen(dir)).toMatchObject([{ ticket: "DGS-1", run: "DGS-1/driver", kind: "unknown", cause: "driver-file-unreadable" }]);
    await send();
    expect(readOpen(dir)).toHaveLength(1);   // once
  });
  it("a driver that is not in the registry: falls back and appends an attention item", async () => {
    mkdirSync(join(root, "drivers"));
    writeFileSync(driverFile("DGS-1"), JSON.stringify({ ticket: "DGS-1", driver: "ghost", since: "x", mode: "factory" }));
    await send();
    expect(calls[0].args).toContain("digismith-conductor");
    expect(readOpen(dir)[0]).toMatchObject({ cause: "driver-not-in-registry" });
  });
  it("a ticket that is not a key falls back without reading a file; a failing herdr throws", async () => {
    await promptDriver(exec, conductorsJson, dir, "not-a-key", "x");
    expect(calls[0].args).toContain("digismith-conductor");
    code = 2;
    await expect(send()).rejects.toThrow(/exit 2/);
  });
});

describe("F1 to F3: delivered, the Director as driver, a fallback without a workspace", () => {
  const send = (ticket = "DGS-1") => promptDriver(exec, conductorsJson, dir, ticket, "x");
  it("F1: errors before herdr is called are PromptError no; a non-zero exit is no; an exec that throws is maybe", async () => {
    writeFileSync(conductorsJson, JSON.stringify({ "DigiSmith/digismith-conductor": { status: "closed", workspace: "w2" } }));
    await expect(send()).rejects.toMatchObject({ name: expect.any(String), delivered: "no" });
    await expect(send()).rejects.toBeInstanceOf(PromptError);
    writeFileSync(conductorsJson, "{nope");
    await expect(send()).rejects.toMatchObject({ delivered: "no" });
    await expect(promptDirector(exec, conductorsJson, "x")).rejects.toMatchObject({ delivered: "no" });
    writeReg();
    code = 1;
    await expect(send()).rejects.toMatchObject({ delivered: "no" });
    code = 0;
    const boom: Exec = async () => { throw new Error("timeout"); };
    await expect(promptDriver(boom, conductorsJson, dir, "DGS-1", "x")).rejects.toMatchObject({ delivered: "maybe" });
  });
  it("F2: a driver record that names the Director is skipped: fall back and open the attention item", async () => {
    mkdirSync(join(root, "drivers"));
    writeFileSync(driverFile("DGS-1"), JSON.stringify({ ticket: "DGS-1", driver: "director", since: "x", mode: "factory" }));
    await send();
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(["agent", "prompt", "digismith-conductor", "x"]);
    expect(calls[0].args).not.toContain("--session");
    expect(readOpen(dir)).toMatchObject([{ ticket: "DGS-1", cause: "driver-not-in-registry" }]);
  });
  it("F3: the fallback conductor needs a workspace: without one nothing is sent and the item opens", async () => {
    writeFileSync(conductorsJson, JSON.stringify({ "DigiSmith/digismith-conductor": { session: "default" }, "DigiSmith/director": { session: "Castle", workspace: "w1", kind: "factory" } }));
    await expect(send()).rejects.toMatchObject({ delivered: "no" });
    expect(calls).toEqual([]);
    expect(readOpen(dir)).toMatchObject([{ cause: "driver-not-in-registry" }]);
  });
});

describe("writeDriverIfAbsent and projectConductorName", () => {
  it("creates drivers/<KEY>.json with exclusive create and the DGS-683 6.3 fields; a second call is a no-op", () => {
    expect(writeDriverIfAbsent(conductorsJson, "DGS-1", "digismith-conductor")).toBe(true);
    const rec = JSON.parse(readFileSync(driverFile("DGS-1"), "utf8"));
    expect(rec).toMatchObject({ ticket: "DGS-1", driver: "digismith-conductor", mode: "factory" });
    expect(typeof rec.since).toBe("string");
    expect(writeDriverIfAbsent(conductorsJson, "DGS-1", "someone-else")).toBe(false);
    expect(JSON.parse(readFileSync(driverFile("DGS-1"), "utf8")).driver).toBe("digismith-conductor");
    expect(existsSync(join(root, "drivers", "DGS-1.json"))).toBe(true);
  });
  it("the project conductor name comes from the registry, with digismith-conductor as the fallback", () => {
    expect(projectConductorName(conductorsJson)).toBe("digismith-conductor");
    rmSync(conductorsJson);
    expect(projectConductorName(conductorsJson)).toBe("digismith-conductor");
  });
});
