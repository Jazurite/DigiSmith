import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildHerdrCall, herdrPaneLookup } from "./pane.ts";

describe("herdrPaneLookup", () => {
  it("returns pane ids with their agent_status", async () => {
    const lookup = herdrPaneLookup(async () => ({ code: 0, stdout: '{"result":{"panes":[{"pane_id":"w2:p1","agent_status":"blocked"},{"pane_id":"w2:p7P","agent_status":"done"}]}}' }));
    expect(await lookup("w2")).toEqual(new Map([["w2:p1", "blocked"], ["w2:p7P", "done"]]));
  });
  it("gives a pane with a missing or non-string agent_status the status unknown", async () => {
    const lookup = herdrPaneLookup(async () => ({ code: 0, stdout: '{"result":{"panes":[{"pane_id":"w2:p1"},{"pane_id":"w2:p2","agent_status":7},{"pane_id":"w2:p3","agent_status":null}]}}' }));
    expect(await lookup("w2")).toEqual(new Map([["w2:p1", "unknown"], ["w2:p2", "unknown"], ["w2:p3", "unknown"]]));
  });
  it("returns null for a non-zero code, non-JSON, a missing list and a throw", async () => {
    expect(await herdrPaneLookup(async () => ({ code: 1, stdout: "{}" }))("w2")).toBeNull();
    expect(await herdrPaneLookup(async () => ({ code: 0, stdout: "nope" }))("w2")).toBeNull();
    expect(await herdrPaneLookup(async () => ({ code: 0, stdout: '{"result":{}}' }))("w2")).toBeNull();
    expect(await herdrPaneLookup(async () => { throw new Error("boom"); })("w2")).toBeNull();
  });
  it("skips a pane entry without a string pane_id", async () => {
    const lookup = herdrPaneLookup(async () => ({ code: 0, stdout: '{"result":{"panes":[{"pane_id":"w2:p1","agent_status":"idle"},{},{"pane_id":null},{"pane_id":7}]}}' }));
    expect(await lookup("w2")).toEqual(new Map([["w2:p1", "idle"]]));
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
