import { describe, expect, it } from "vitest";
import { formatRunsOn, parseRunsOn } from "./runs-on.ts";

describe("parseRunsOn", () => {
  it.each([
    ["herdr w2:p1", { session: "default", workspace: "w2", pane: "w2:p1" }],
    ["herdr Suite/w7:p1", { session: "Suite", workspace: "w7", pane: "w7:p1" }],
    ["herdr suite-probe/w1:pK", { session: "suite-probe", workspace: "w1", pane: "w1:pK" }],
  ])("%s", (s, want) => expect(parseRunsOn(s)).toEqual(want));
  it.each(["desktop", "ssh", "workbox", "herdr", "herdr x", "herdr Suite/w7", "herdr 9bad/w1:p1", "herdr w2:p1 extra", "", undefined])("%s is null", (s) => expect(parseRunsOn(s as string)).toBeNull());
});
describe("formatRunsOn", () => {
  it("no pane: workbox", () => expect(formatRunsOn({})).toBe("workbox"));
  it("default session (unset or named default): the old format", () => {
    expect(formatRunsOn({ HERDR_PANE_ID: "w2:p1" })).toBe("herdr w2:p1");
    expect(formatRunsOn({ HERDR_PANE_ID: "w2:p1", HERDR_SESSION: "default" })).toBe("herdr w2:p1");
  });
  it("another session carries its name", () => expect(formatRunsOn({ HERDR_PANE_ID: "w7:p1", HERDR_SESSION: "Suite" })).toBe("herdr Suite/w7:p1"));
  it("a session name that fails the session regex falls back to the default-style format", () => {
    expect(formatRunsOn({ HERDR_PANE_ID: "w2:p1", HERDR_SESSION: "my session" })).toBe("herdr w2:p1");
    expect(formatRunsOn({ HERDR_PANE_ID: "w2:p1", HERDR_SESSION: "9bad" })).toBe("herdr w2:p1");
  });
  it("a pane id that fails the parse regex gives workbox", () => {
    expect(formatRunsOn({ HERDR_PANE_ID: "bogus" })).toBe("workbox");
    expect(formatRunsOn({ HERDR_PANE_ID: "x:p1", HERDR_SESSION: "Suite" })).toBe("workbox");
    expect(formatRunsOn({ HERDR_PANE_ID: "w2:p1 extra" })).toBe("workbox");
  });
  it.each([
    [{ HERDR_PANE_ID: "w2:p1" }],
    [{ HERDR_PANE_ID: "w2:p1", HERDR_SESSION: "default" }],
    [{ HERDR_PANE_ID: "w7:p1", HERDR_SESSION: "Suite" }],
    [{ HERDR_PANE_ID: "w2:p1", HERDR_SESSION: "my session" }],
    [{ HERDR_PANE_ID: "bogus", HERDR_SESSION: "Suite" }],
  ])("a non-workbox result always parses (%j)", (env) => {
    const out = formatRunsOn(env);
    expect(out === "workbox" || parseRunsOn(out) !== null).toBe(true);
  });
});
