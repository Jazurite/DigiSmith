import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildHerdrCall, herdrPaneLookup } from "./pane.ts";

describe("herdrPaneLookup", () => {
  it("returns the pane ids", async () => {
    const lookup = herdrPaneLookup(async () => ({ code: 0, stdout: '{"result":{"panes":[{"pane_id":"w2:p1"},{"pane_id":"w2:p7P"}]}}' }));
    expect(await lookup("w2")).toEqual(new Set(["w2:p1", "w2:p7P"]));
  });
  it("returns null for a non-zero code, non-JSON, a missing list and a throw", async () => {
    expect(await herdrPaneLookup(async () => ({ code: 1, stdout: "{}" }))("w2")).toBeNull();
    expect(await herdrPaneLookup(async () => ({ code: 0, stdout: "nope" }))("w2")).toBeNull();
    expect(await herdrPaneLookup(async () => ({ code: 0, stdout: '{"result":{}}' }))("w2")).toBeNull();
    expect(await herdrPaneLookup(async () => { throw new Error("boom"); })("w2")).toBeNull();
  });
  it("skips a pane entry without a string pane_id", async () => {
    const lookup = herdrPaneLookup(async () => ({ code: 0, stdout: '{"result":{"panes":[{"pane_id":"w2:p1"},{},{"pane_id":null},{"pane_id":7}]}}' }));
    expect(await lookup("w2")).toEqual(new Set(["w2:p1"]));
  });
  it("passes the workspace to the exec", async () => {
    const seen: string[] = [];
    await herdrPaneLookup(async (w) => { seen.push(w); return { code: 0, stdout: '{"result":{"panes":[]}}' }; })("w3");
    expect(seen).toEqual(["w3"]);
  });
  it("F8: the herdr-ws path follows DIGISMITH_DEPOT_DIR", () => {
    const c = buildHerdrCall("w2", { DIGISMITH_DEPOT_DIR: "/x/depot" });
    expect(c.file).toBe(join("/x/depot", "bin", "herdr-ws"));
  });
  it("builds a read-only pane list call with HERDR_WS", () => {
    const c = buildHerdrCall("w2", { PATH: "/bin" });
    expect(c.file).toBe(join(homedir(), ".digismith-depot", "bin", "herdr-ws"));
    expect(c.args).toEqual(["pane", "list"]);
    expect(c.env).toEqual({ PATH: "/bin", HERDR_WS: "w2" });
  });
});
