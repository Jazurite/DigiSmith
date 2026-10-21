import { describe, expect, it } from "vitest";
import { CAUSES, classOfCause, normalizeCause } from "./causes.ts";

describe("causes", () => {
  it("the fixed list has the spec codes in the right classes", () => {
    for (const c of ["gateway-5xx", "gateway-timeout", "rate-limited", "pane-died", "tab-lost"]) expect(CAUSES[c]).toBe("transient");
    for (const c of ["classifier-block", "merge-refused", "test-red", "review-rejected", "spec-gap", "mandate-deny"]) expect(CAUSES[c]).toBe("durable");
    expect(CAUSES["unknown"]).toBe("unknown");
    expect(Object.keys(CAUSES)).toHaveLength(12);
  });
  it("a classifier block is durable", () => expect(classOfCause("classifier-block")).toBe("durable"));
  it("a mandate deny is durable", () => expect(classOfCause("mandate-deny")).toBe("durable"));
  it("a code outside the list, or none, is unknown with a warning", () => {
    expect(normalizeCause("weird")).toEqual({ code: "unknown", warning: expect.stringContaining("weird") });
    expect(normalizeCause(undefined).code).toBe("unknown");
    expect(normalizeCause("test-red")).toEqual({ code: "test-red", warning: null });
    expect(classOfCause("weird")).toBe("unknown");
  });
});
