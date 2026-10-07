import { describe, it, expect } from "vitest";
import { toVnd } from "./money.ts";

describe("toVnd", () => {
  it("divides by 100000", () => expect(toVnd(43141700000)).toBe(431417));
  it("keeps zero", () => expect(toVnd(0)).toBe(0));
  it("rejects non-integers and non-numbers", () => {
    expect(toVnd(1.5)).toBeNull();
    expect(toVnd("5")).toBeNull();
    expect(toVnd(undefined)).toBeNull();
  });
});
