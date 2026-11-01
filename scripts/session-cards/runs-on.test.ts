import { describe, expect, it } from "vitest";
import { formatRunsOn, parseRunsOn } from "./runs-on.ts";

describe("parseRunsOn", () => {
  it.each([
    ["herdr w2:p1", { session: "default", workspace: "w2", pane: "w2:p1" }],
    ["herdr Suite/w7:p1", { session: "Suite", workspace: "w7", pane: "w7:p1" }],
    ["herdr suite-probe/w1:pK", { session: "suite-probe", workspace: "w1", pane: "w1:pK" }],
  ])("%s", (s, want) => expect(parseRunsOn(s)).toEqual(want));
  it.each(["desktop", "ssh", "workbox", "herdr", "herdr x", "", undefined])("%s is null", (s) => expect(parseRunsOn(s as string)).toBeNull());
});
describe("formatRunsOn", () => {
  it("no pane: workbox", () => expect(formatRunsOn({})).toBe("workbox"));
  it("default session (unset or named default): the old format", () => {
    expect(formatRunsOn({ HERDR_PANE_ID: "w2:p1" })).toBe("herdr w2:p1");
    expect(formatRunsOn({ HERDR_PANE_ID: "w2:p1", HERDR_SESSION: "default" })).toBe("herdr w2:p1");
  });
  it("another session carries its name", () => expect(formatRunsOn({ HERDR_PANE_ID: "w7:p1", HERDR_SESSION: "Suite" })).toBe("herdr Suite/w7:p1"));
});
