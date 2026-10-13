import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cardFromIdentity, findByFolder, formatIdentity, identitiesDir, listIdentities, parseIdentity, readIdentity, validateIdentity, writeIdentity } from "./identity.ts";

let depot: string;
let env: NodeJS.ProcessEnv;
const base = {
  id: "digismith-maestro", name: "DigiSmith Maestro", owner: "jack", project: "DigiSmith",
  folder: "/work/DigiSmith", conductors: ["digismith-conductor"], role: "maestro",
  machine: "jack-desktop", state: "/work/DigiSmith/.digismith/sessions/DigiSmith/note.md", created: "2026-10-13T15:00+07:00",
};
beforeEach(() => {
  depot = fs.mkdtempSync(path.join(os.tmpdir(), "dgs411-"));
  env = { DIGISMITH_DEPOT_DIR: depot };
});
afterEach(() => fs.rmSync(depot, { recursive: true, force: true }));

describe("validateIdentity", () => {
  it("accepts a full record", () => expect(validateIdentity(base).ok).toBe(true));
  it("requires the always-fields", () => {
    const { id: _id, ...rest } = base;
    const r = validateIdentity(rest);
    expect(r.ok).toBe(false);
  });
  it("refuses unknown fields, secrets, line breaks, relative folder, bad role, empty conductors", () => {
    for (const bad of [
      { ...base, extra: "x" },
      { ...base, owner: "sk-abcdefghijklmnop1234567890abcd" },
      { ...base, name: "a\nb" },
      { ...base, folder: "relative/dir" },
      { ...base, role: "worker" },
      { ...base, conductors: [] },
      { ...base, id: "Bad Id" },
      { ...base, conductors: ["Bad Id"] },
    ]) expect(validateIdentity(bad).ok).toBe(false);
  });
});

describe("format and parse", () => {
  it("round-trips", () => {
    const v = validateIdentity(base);
    if (!v.ok) throw new Error("x");
    expect(parseIdentity(formatIdentity(v.identity))).toEqual(v.identity);
  });
  it("round-trips several conductors", () => {
    const v = validateIdentity({ ...base, conductors: ["a-one", "b-two"] });
    if (!v.ok) throw new Error("x");
    expect(parseIdentity(formatIdentity(v.identity)).conductors).toEqual(["a-one", "b-two"]);
  });
  it("parse throws on an invalid file", () => expect(() => parseIdentity("id: x\n")).toThrow());
});

describe("depot store", () => {
  it("writes to identities/<id>.yml, reads, lists", () => {
    const file = writeIdentity(base, env);
    expect(file).toBe(path.join(identitiesDir(env), "digismith-maestro.yml"));
    expect(readIdentity("digismith-maestro", env)?.name).toBe("DigiSmith Maestro");
    expect(listIdentities(env).map((i) => i.id)).toEqual(["digismith-maestro"]);
  });
  it("read of a missing or unsafe id is undefined", () => {
    expect(readIdentity("nope", env)).toBeUndefined();
    expect(readIdentity("../x", env)).toBeUndefined();
  });
  it("refuses to write an invalid record", () => expect(() => writeIdentity({ ...base, folder: "x" }, env)).toThrow());
  it("a bad file does not break the list", () => {
    writeIdentity(base, env);
    fs.writeFileSync(path.join(identitiesDir(env), "broken.yml"), "garbage\n");
    expect(listIdentities(env)).toHaveLength(1);
  });
});

describe("findByFolder", () => {
  it("matches exactly one record by folder", () => {
    writeIdentity(base, env);
    expect(findByFolder("/work/DigiSmith", env).found).toEqual(base);
  });
  it("no match", () => expect(findByFolder("/other", env)).toEqual({ found: undefined }));
  it("two matches is ambiguous", () => {
    writeIdentity(base, env);
    writeIdentity({ ...base, id: "second-maestro", name: "Second" }, env);
    const r = findByFolder("/work/DigiSmith", env);
    expect(r.found).toBeUndefined();
    expect(r.ambiguous).toEqual(["digismith-maestro", "second-maestro"]);
  });
});

describe("cardFromIdentity", () => {
  it("builds a valid maestro card input", () => {
    const v = validateIdentity(base);
    if (!v.ok) throw new Error("x");
    const c = cardFromIdentity(v.identity, "sess1", new Date("2026-10-13T08:00:00Z"), {});
    expect(c).toMatchObject({ name: "DigiSmith Maestro", role: "maestro", id: "digismith-maestro", session: "sess1", domain: "DigiSmith", runs_on: "desktop", machine: "jack-desktop", created_by: "jack", status: "open", started: "2026-10-13T15:00+07:00" });
    expect(c).not.toHaveProperty("under");
  });
  it("runs_on is ssh over SSH", () => {
    const v = validateIdentity(base);
    if (!v.ok) throw new Error("x");
    expect(cardFromIdentity(v.identity, "s", new Date(), { SSH_CONNECTION: "1 2 3 4" }).runs_on).toBe("ssh");
  });
});
