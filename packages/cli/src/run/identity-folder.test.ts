import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { maestroIdentityAt } from "./identity-folder.ts";

let tmp: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-ident-"));
  env = { DIGISMITH_DEPOT_DIR: tmp };
  fs.mkdirSync(path.join(tmp, "identities"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const card = (file: string, folder: string) =>
  fs.writeFileSync(path.join(tmp, "identities", file), `id: x\nname: X\nproject: P\nfolder: ${folder}\nrole: maestro\n`);

describe("maestroIdentityAt", () => {
  it("is true when exactly one card names the root", () => {
    card("digismith-maestro.yml", "/w/DigiSmith");
    card("emma-maestro.yml", "/w/emma");
    expect(maestroIdentityAt("/w/DigiSmith", env)).toBe(true);
  });
  it("is false for no card, two cards, a null root or no identities folder", () => {
    expect(maestroIdentityAt("/w/DigiSmith", env)).toBe(false);
    card("a.yml", "/w/DigiSmith");
    card("b.yml", "/w/DigiSmith");
    expect(maestroIdentityAt("/w/DigiSmith", env)).toBe(false);
    expect(maestroIdentityAt(null, env)).toBe(false);
    expect(maestroIdentityAt("/w/DigiSmith", { DIGISMITH_DEPOT_DIR: path.join(tmp, "none") })).toBe(false);
  });
  it("ignores files that are not .yml and a trailing slash in the card", () => {
    fs.writeFileSync(path.join(tmp, "identities", "notes.txt"), "folder: /w/DigiSmith\n");
    card("m.yml", "/w/DigiSmith/");
    expect(maestroIdentityAt("/w/DigiSmith", env)).toBe(true);
  });
});
